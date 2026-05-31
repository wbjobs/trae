import os
from typing import List, Union
from pathlib import Path
import numpy as np
from PIL import Image
import torch
from transformers import CLIPProcessor, CLIPModel
from dotenv import load_dotenv

load_dotenv()

class CLIPService:
    _instance = None
    _model = None
    _processor = None
    _device = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._init_model()
        return cls._instance

    @classmethod
    def _init_model(cls):
        model_name = os.getenv("CLIP_MODEL_NAME", "openai/clip-vit-base-patch32")
        cls._device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading CLIP model: {model_name} on {cls._device}")
        cls._model = CLIPModel.from_pretrained(model_name).to(cls._device)
        cls._processor = CLIPProcessor.from_pretrained(model_name)
        cls._model.eval()
        print("CLIP model loaded successfully")

    @classmethod
    def get_embedding_dim(cls) -> int:
        return cls._model.config.projection_dim

    @torch.no_grad()
    def encode_text(self, text: str) -> np.ndarray:
        inputs = self._processor(
            text=text,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=77
        ).to(self._device)
        embeddings = self._model.get_text_features(**inputs)
        embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)
        return embeddings.cpu().numpy().flatten()

    @torch.no_grad()
    def encode_image(self, image: Union[str, Path, Image.Image]) -> np.ndarray:
        if isinstance(image, (str, Path)):
            image = Image.open(image).convert("RGB")
        
        inputs = self._processor(
            images=image,
            return_tensors="pt"
        ).to(self._device)
        embeddings = self._model.get_image_features(**inputs)
        embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)
        return embeddings.cpu().numpy().flatten()

    @torch.no_grad()
    def encode_texts(self, texts: List[str]) -> np.ndarray:
        inputs = self._processor(
            text=texts,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=77
        ).to(self._device)
        embeddings = self._model.get_text_features(**inputs)
        embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)
        return embeddings.cpu().numpy()

    @torch.no_grad()
    def encode_images(self, images: List[Union[str, Path, Image.Image]]) -> np.ndarray:
        pil_images = []
        for img in images:
            if isinstance(img, (str, Path)):
                pil_images.append(Image.open(img).convert("RGB"))
            else:
                pil_images.append(img.convert("RGB"))
        
        inputs = self._processor(
            images=pil_images,
            return_tensors="pt"
        ).to(self._device)
        embeddings = self._model.get_image_features(**inputs)
        embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)
        return embeddings.cpu().numpy()

    def encode_multimodal(self, text: str = None, image: Union[str, Path, Image.Image] = None) -> np.ndarray:
        if text is not None and image is not None:
            text_emb = self.encode_text(text)
            image_emb = self.encode_image(image)
            combined = (text_emb + image_emb) / 2
            return combined / np.linalg.norm(combined)
        elif text is not None:
            return self.encode_text(text)
        elif image is not None:
            return self.encode_image(image)
        else:
            raise ValueError("At least one of text or image must be provided")
