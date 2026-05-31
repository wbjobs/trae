import os
import torch
import torch.nn as nn
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime
import numpy as np
from transformers import CLIPModel, CLIPProcessor
from peft import LoraConfig, get_peft_model, PeftModel
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW
from sklearn.model_selection import train_test_split
from tqdm import tqdm
import uuid
import json

from services.clip_service import CLIPService
from services.vector_db import VectorDBService
from services.feedback_store import FeedbackStore


class CLIPLoRADataset(Dataset):
    def __init__(
        self,
        texts: List[str],
        images: List[str],
        labels: List[int],
        processor: CLIPProcessor,
        max_length: int = 77
    ):
        self.texts = texts
        self.images = images
        self.labels = labels
        self.processor = processor
        self.max_length = max_length

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        from PIL import Image
        
        text = self.texts[idx]
        image_path = self.images[idx]
        label = self.labels[idx]

        try:
            image = Image.open(image_path).convert("RGB")
        except Exception as e:
            print(f"Warning: Could not load image {image_path}: {e}")
            image = Image.new('RGB', (224, 224), color='white')

        inputs = self.processor(
            text=[text],
            images=image,
            return_tensors="pt",
            padding="max_length",
            truncation=True,
            max_length=self.max_length
        )

        return {
            "input_ids": inputs["input_ids"].squeeze(0),
            "attention_mask": inputs["attention_mask"].squeeze(0),
            "pixel_values": inputs["pixel_values"].squeeze(0),
            "labels": torch.tensor(label, dtype=torch.float)
        }


class CLIPLoRATrainer:
    def __init__(
        self,
        base_model_name: str = "openai/clip-vit-base-patch32",
        output_dir: str = "./models",
        device: Optional[str] = None
    ):
        self.base_model_name = base_model_name
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        if device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device
        
        self.processor = None
        self.base_model = None
        self.peft_model = None
        
        print(f"CLIPLoRATrainer initialized on {self.device}")

    def _load_base_model(self):
        if self.base_model is None:
            print(f"Loading base model: {self.base_model_name}")
            self.base_model = CLIPModel.from_pretrained(self.base_model_name)
            self.processor = CLIPProcessor.from_pretrained(self.base_model_name)
            self.base_model.to(self.device)
            self.base_model.eval()

    def _create_lora_config(
        self,
        r: int = 8,
        lora_alpha: int = 16,
        lora_dropout: float = 0.05,
        target_modules: Optional[List[str]] = None
    ) -> LoraConfig:
        if target_modules is None:
            target_modules = ["q_proj", "v_proj"]
        
        return LoraConfig(
            r=r,
            lora_alpha=lora_alpha,
            target_modules=target_modules,
            lora_dropout=lora_dropout,
            bias="none",
            task_type="FEATURE_EXTRACTION"
        )

    def prepare_training_data(
        self,
        feedback_data: List[Dict[str, Any]],
        vector_db: VectorDBService
    ) -> Tuple[List[str], List[str], List[int]]:
        texts = []
        image_paths = []
        labels = []

        items_by_id = {}
        all_result_ids = list(set([f["result_id"] for f in feedback_data if f.get("result_id")]))
        
        batch_size = 100
        for i in range(0, len(all_result_ids), batch_size):
            batch_ids = all_result_ids[i:i + batch_size]
            items = vector_db.get_by_ids(batch_ids)
            for item in items:
                items_by_id[item["id"]] = item

        for feedback in feedback_data:
            text = feedback.get("text") or feedback.get("query_text")
            result_id = feedback.get("result_id")
            
            if not text or not result_id:
                continue

            item = items_by_id.get(result_id)
            if not item:
                continue

            image_path = item.get("metadata", {}).get("image_path")
            if not image_path or not os.path.exists(image_path):
                continue

            feedback_type = feedback.get("feedback")
            if feedback_type == "like":
                label = 1
            elif feedback_type == "dislike":
                label = 0
            else:
                continue

            texts.append(text)
            image_paths.append(image_path)
            labels.append(label)

        print(f"Prepared {len(texts)} training pairs")
        return texts, image_paths, labels

    def train(
        self,
        texts: List[str],
        image_paths: List[str],
        labels: List[int],
        config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        self._load_base_model()
        
        if config is None:
            config = {}

        lora_config = self._create_lora_config(
            r=config.get("lora_rank", 8),
            lora_alpha=config.get("lora_alpha", 16),
            lora_dropout=config.get("lora_dropout", 0.05),
            target_modules=config.get("target_modules", ["q_proj", "v_proj"])
        )

        batch_size = config.get("batch_size", 8)
        learning_rate = config.get("learning_rate", 1e-4)
        num_epochs = config.get("num_epochs", 3)
        test_size = config.get("test_size", 0.2)
        random_seed = config.get("random_seed", 42)

        print(f"Training config: {json.dumps(config, indent=2)}")

        (train_texts, val_texts,
         train_images, val_images,
         train_labels, val_labels) = train_test_split(
            texts, image_paths, labels,
            test_size=test_size,
            random_state=random_seed
        )

        train_dataset = CLIPLoRADataset(
            train_texts, train_images, train_labels, self.processor
        )
        val_dataset = CLIPLoRADataset(
            val_texts, val_images, val_labels, self.processor
        )

        train_loader = DataLoader(
            train_dataset,
            batch_size=batch_size,
            shuffle=True,
            num_workers=0
        )
        val_loader = DataLoader(
            val_dataset,
            batch_size=batch_size,
            shuffle=False,
            num_workers=0
        )

        self.peft_model = get_peft_model(self.base_model, lora_config)
        self.peft_model.to(self.device)
        self.peft_model.train()

        self.peft_model.print_trainable_parameters()

        optimizer = AdamW(self.peft_model.parameters(), lr=learning_rate)
        criterion = nn.BCEWithLogitsLoss()

        version = f"v{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        adapter_path = self.output_dir / f"clip_lora_{version}"

        best_val_loss = float('inf')
        metrics = {
            "train_losses": [],
            "val_losses": [],
            "train_accuracies": [],
            "val_accuracies": []
        }

        for epoch in range(num_epochs):
            self.peft_model.train()
            train_loss = 0.0
            train_correct = 0
            train_total = 0

            for batch in tqdm(train_loader, desc=f"Epoch {epoch + 1}/{num_epochs}"):
                optimizer.zero_grad()

                input_ids = batch["input_ids"].to(self.device)
                attention_mask = batch["attention_mask"].to(self.device)
                pixel_values = batch["pixel_values"].to(self.device)
                labels = batch["labels"].to(self.device)

                outputs = self.peft_model(
                    input_ids=input_ids,
                    attention_mask=attention_mask,
                    pixel_values=pixel_values,
                    return_loss=True
                )

                text_embeds = outputs.text_embeds
                image_embeds = outputs.image_embeds

                similarity = torch.sum(text_embeds * image_embeds, dim=1)
                loss = criterion(similarity, labels)

                loss.backward()
                optimizer.step()

                train_loss += loss.item()
                predictions = (torch.sigmoid(similarity) > 0.5).float()
                train_correct += (predictions == labels).sum().item()
                train_total += labels.size(0)

            avg_train_loss = train_loss / len(train_loader)
            train_accuracy = train_correct / train_total

            self.peft_model.eval()
            val_loss = 0.0
            val_correct = 0
            val_total = 0

            with torch.no_grad():
                for batch in val_loader:
                    input_ids = batch["input_ids"].to(self.device)
                    attention_mask = batch["attention_mask"].to(self.device)
                    pixel_values = batch["pixel_values"].to(self.device)
                    labels = batch["labels"].to(self.device)

                    outputs = self.peft_model(
                        input_ids=input_ids,
                        attention_mask=attention_mask,
                        pixel_values=pixel_values,
                        return_loss=True
                    )

                    text_embeds = outputs.text_embeds
                    image_embeds = outputs.image_embeds

                    similarity = torch.sum(text_embeds * image_embeds, dim=1)
                    loss = criterion(similarity, labels)

                    val_loss += loss.item()
                    predictions = (torch.sigmoid(similarity) > 0.5).float()
                    val_correct += (predictions == labels).sum().item()
                    val_total += labels.size(0)

            avg_val_loss = val_loss / len(val_loader)
            val_accuracy = val_correct / val_total

            metrics["train_losses"].append(avg_train_loss)
            metrics["val_losses"].append(avg_val_loss)
            metrics["train_accuracies"].append(train_accuracy)
            metrics["val_accuracies"].append(val_accuracy)

            print(f"Epoch {epoch + 1}: "
                  f"Train Loss: {avg_train_loss:.4f}, "
                  f"Train Acc: {train_accuracy:.4f}, "
                  f"Val Loss: {avg_val_loss:.4f}, "
                  f"Val Acc: {val_accuracy:.4f}")

            if avg_val_loss < best_val_loss:
                best_val_loss = avg_val_loss
                self.peft_model.save_pretrained(str(adapter_path))
                print(f"Saved best model to {adapter_path}")

        final_metrics = {
            "final_train_loss": metrics["train_losses"][-1],
            "final_val_loss": metrics["val_losses"][-1],
            "final_train_accuracy": metrics["train_accuracies"][-1],
            "final_val_accuracy": metrics["val_accuracies"][-1],
            "best_val_loss": best_val_loss,
            "num_epochs": num_epochs,
            "training_samples": len(train_texts),
            "validation_samples": len(val_texts)
        }

        return {
            "version": version,
            "adapter_path": str(adapter_path),
            "metrics": final_metrics,
            "success": True
        }

    def train_from_feedback(
        self,
        feedback_store: FeedbackStore,
        vector_db: VectorDBService,
        config: Optional[Dict[str, Any]] = None,
        min_samples: int = 10
    ) -> Dict[str, Any]:
        from datetime import timedelta
        
        feedback_data = feedback_store.get_training_pairs(min_samples=min_samples)
        
        if len(feedback_data) < min_samples:
            return {
                "success": False,
                "error_message": f"Insufficient training samples: {len(feedback_data)} < {min_samples}"
            }

        texts, image_paths, labels = self.prepare_training_data(feedback_data, vector_db)

        if len(texts) < min_samples:
            return {
                "success": False,
                "error_message": f"Insufficient valid training pairs: {len(texts)} < {min_samples}"
            }

        return self.train(texts, image_paths, labels, config)


class LoRAInferenceService:
    def __init__(
        self,
        base_model_name: str = "openai/clip-vit-base-patch32",
        device: Optional[str] = None
    ):
        self.base_model_name = base_model_name
        if device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device
        
        self.base_model = None
        self.processor = None
        self.peft_model = None
        self.current_adapter_path = None

    def load_base_model(self):
        if self.base_model is None:
            print(f"Loading base model: {self.base_model_name}")
            self.base_model = CLIPModel.from_pretrained(self.base_model_name)
            self.processor = CLIPProcessor.from_pretrained(self.base_model_name)
            self.base_model.to(self.device)
            self.base_model.eval()

    def load_adapter(self, adapter_path: str):
        self.load_base_model()
        
        if self.current_adapter_path == adapter_path and self.peft_model is not None:
            print(f"Adapter {adapter_path} already loaded")
            return

        print(f"Loading LoRA adapter: {adapter_path}")
        
        if self.peft_model is not None:
            self.peft_model.unload()
        
        self.peft_model = PeftModel.from_pretrained(
            self.base_model,
            adapter_path
        )
        self.peft_model.to(self.device)
        self.peft_model.eval()
        self.current_adapter_path = adapter_path
        print("Adapter loaded successfully")

    def unload_adapter(self):
        if self.peft_model is not None:
            self.peft_model.unload()
            self.peft_model = None
            self.current_adapter_path = None
            print("Adapter unloaded")

    @torch.no_grad()
    def encode_text(self, text: str) -> np.ndarray:
        self.load_base_model()
        
        model = self.peft_model if self.peft_model is not None else self.base_model
        
        inputs = self.processor(
            text=text,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=77
        ).to(self.device)
        
        outputs = model.get_text_features(**inputs)
        embeddings = outputs / outputs.norm(dim=-1, keepdim=True)
        return embeddings.cpu().numpy().flatten()

    @torch.no_grad()
    def encode_image(self, image_path: str) -> np.ndarray:
        from PIL import Image
        
        self.load_base_model()
        
        model = self.peft_model if self.peft_model is not None else self.base_model
        
        image = Image.open(image_path).convert("RGB")
        inputs = self.processor(
            images=image,
            return_tensors="pt"
        ).to(self.device)
        
        outputs = model.get_image_features(**inputs)
        embeddings = outputs / outputs.norm(dim=-1, keepdim=True)
        return embeddings.cpu().numpy().flatten()

    @torch.no_grad()
    def encode_multimodal(self, text: str = None, image_path: str = None) -> np.ndarray:
        if text is not None and image_path is not None:
            text_emb = self.encode_text(text)
            image_emb = self.encode_image(image_path)
            combined = (text_emb + image_emb) / 2
            return combined / np.linalg.norm(combined)
            return combined
        elif text is not None:
            return self.encode_text(text)
        elif image_path is not None:
            return self.encode_image(image_path)
        else:
            raise ValueError("At least one of text or image must be provided")
