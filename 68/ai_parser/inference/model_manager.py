import os
import logging
from typing import Optional, Dict, Any, List
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ModelInfo:
    name: str
    path: str
    type: str
    size: str = ""
    quantization: str = "none"
    max_tokens: int = 2048
    supported_tasks: List[str] = field(default_factory=list)


class BaseModelBackend(ABC):
    def __init__(self, config: Any = None):
        self.config = config
        self.model = None
        self.tokenizer = None
        self.is_loaded = False

    @abstractmethod
    def load(self) -> bool:
        pass

    @abstractmethod
    def generate(self, prompt: str, **kwargs) -> str:
        pass

    @abstractmethod
    def unload(self) -> None:
        pass


class TransformersBackend(BaseModelBackend):
    def load(self) -> bool:
        try:
            from transformers import AutoTokenizer, AutoModelForCausalLM
            import torch

            model_path = getattr(self.config, "model_path", "./models/")
            model_name = getattr(self.config, "model_name", "qwen2-7b-instruct")
            device = getattr(self.config, "device", "cpu")
            use_gpu = getattr(self.config, "use_gpu", False)

            full_model_path = os.path.join(model_path, model_name)

            logger.info(f"Loading model from {full_model_path}")

            self.tokenizer = AutoTokenizer.from_pretrained(
                full_model_path,
                trust_remote_code=True,
                local_files_only=getattr(self.config, "offline_mode", True),
            )

            model_kwargs = {
                "trust_remote_code": True,
                "local_files_only": getattr(self.config, "offline_mode", True),
            }

            if use_gpu and torch.cuda.is_available():
                model_kwargs["device_map"] = "auto"
                model_kwargs["torch_dtype"] = torch.float16

            self.model = AutoModelForCausalLM.from_pretrained(
                full_model_path,
                **model_kwargs,
            )

            self.is_loaded = True
            logger.info(f"Model {model_name} loaded successfully")
            return True

        except ImportError as e:
            logger.error(f"Transformers not available: {e}")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
        return False

    def generate(self, prompt: str, **kwargs) -> str:
        if not self.is_loaded or not self.model or not self.tokenizer:
            raise RuntimeError("Model not loaded")

        try:
            import torch

            max_tokens = kwargs.get("max_tokens", getattr(self.config, "max_tokens", 2048))
            temperature = kwargs.get("temperature", getattr(self.config, "temperature", 0.1))
            top_p = kwargs.get("top_p", getattr(self.config, "top_p", 0.9))

            messages = [{"role": "user", "content": prompt}]

            text = self.tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )

            model_inputs = self.tokenizer([text], return_tensors="pt")

            if getattr(self.config, "use_gpu", False) and torch.cuda.is_available():
                model_inputs = model_inputs.to("cuda")

            generated_ids = self.model.generate(
                **model_inputs,
                max_new_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                do_sample=temperature > 0,
                pad_token_id=self.tokenizer.eos_token_id,
            )

            generated_ids = [
                output_ids[len(input_ids):]
                for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)
            ]

            response = self.tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
            return response

        except Exception as e:
            logger.error(f"Generation failed: {e}")
            raise

    def unload(self) -> None:
        if self.model is not None:
            del self.model
            self.model = None
        if self.tokenizer is not None:
            del self.tokenizer
            self.tokenizer = None
        self.is_loaded = False
        logger.info("Model unloaded")


class LlamaCppBackend(BaseModelBackend):
    def load(self) -> bool:
        try:
            from llama_cpp import Llama

            model_path = getattr(self.config, "model_path", "./models/")
            model_name = getattr(self.config, "model_name", "qwen2-7b-instruct.gguf")
            n_ctx = getattr(self.config, "max_tokens", 2048)
            n_gpu_layers = -1 if getattr(self.config, "use_gpu", False) else 0

            full_model_path = os.path.join(model_path, model_name)

            logger.info(f"Loading LlamaCpp model from {full_model_path}")

            self.model = Llama(
                model_path=full_model_path,
                n_ctx=n_ctx,
                n_gpu_layers=n_gpu_layers,
                verbose=False,
            )

            self.is_loaded = True
            logger.info(f"Model {model_name} loaded successfully")
            return True

        except ImportError as e:
            logger.error(f"llama-cpp-python not available: {e}")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
        return False

    def generate(self, prompt: str, **kwargs) -> str:
        if not self.is_loaded or not self.model:
            raise RuntimeError("Model not loaded")

        try:
            max_tokens = kwargs.get("max_tokens", getattr(self.config, "max_tokens", 2048))
            temperature = kwargs.get("temperature", getattr(self.config, "temperature", 0.1))
            top_p = kwargs.get("top_p", getattr(self.config, "top_p", 0.9))

            output = self.model(
                prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                stop=["</s>"],
                echo=False,
            )

            response = output["choices"][0]["text"].strip()
            return response

        except Exception as e:
            logger.error(f"Generation failed: {e}")
            raise

    def unload(self) -> None:
        if self.model is not None:
            del self.model
            self.model = None
        self.is_loaded = False
        logger.info("Model unloaded")


class OllamaBackend(BaseModelBackend):
    def load(self) -> bool:
        try:
            import requests

            base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
            model_name = getattr(self.config, "model_name", "qwen2:7b")

            response = requests.get(f"{base_url}/api/tags", timeout=5)
            response.raise_for_status()

            models = response.json().get("models", [])
            model_exists = any(m["name"] == model_name for m in models)

            if not model_exists:
                logger.warning(f"Model {model_name} not found in Ollama")

            self.model = {"base_url": base_url, "model_name": model_name}
            self.is_loaded = True
            logger.info(f"Ollama backend initialized for model {model_name}")
            return True

        except ImportError as e:
            logger.error(f"requests not available: {e}")
        except Exception as e:
            logger.error(f"Failed to connect to Ollama: {e}")
        return False

    def generate(self, prompt: str, **kwargs) -> str:
        if not self.is_loaded or not self.model:
            raise RuntimeError("Ollama backend not initialized")

        try:
            import requests

            max_tokens = kwargs.get("max_tokens", getattr(self.config, "max_tokens", 2048))
            temperature = kwargs.get("temperature", getattr(self.config, "temperature", 0.1))

            base_url = self.model["base_url"]
            model_name = self.model["model_name"]

            payload = {
                "model": model_name,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_predict": max_tokens,
                    "temperature": temperature,
                },
            }

            response = requests.post(
                f"{base_url}/api/generate",
                json=payload,
                timeout=getattr(self.config, "timeout", 300),
            )
            response.raise_for_status()

            result = response.json()
            return result.get("response", "")

        except Exception as e:
            logger.error(f"Generation failed: {e}")
            raise

    def unload(self) -> None:
        self.model = None
        self.is_loaded = False
        logger.info("Ollama backend disconnected")


class MockBackend(BaseModelBackend):
    def load(self) -> bool:
        self.is_loaded = True
        logger.info("Mock backend loaded")
        return True

    def generate(self, prompt: str, **kwargs) -> str:
        if not self.is_loaded:
            raise RuntimeError("Mock backend not loaded")

        mock_responses = {
            "entity_extraction": '''{
  "entities": [
    {"text": "张三", "type": "person", "start_index": 0, "end_index": 2, "confidence": 0.95},
    {"text": "科技有限公司", "type": "organization", "start_index": 5, "end_index": 12, "confidence": 0.9}
  ]
}''',
            "key_info_extraction": '''{
  "extracted_info": {
    "项目名称": "智能文档解析系统",
    "合同金额": "100万元",
    "签订日期": "2024年1月15日"
  },
  "missing_fields": ["项目负责人"]
}''',
            "document_summarization": '''{
  "summary": "本文档介绍了智能文档解析系统的设计方案，包括系统架构、核心功能模块和技术实现路线。",
  "key_points": ["系统架构设计", "核心功能模块", "技术实现路线"],
  "summary_length": 50
}''',
        }

        for key in mock_responses:
            if key in prompt.lower():
                return mock_responses[key]

        return '''{
  "result": "Mock response for testing",
  "confidence": 0.85
}'''

    def unload(self) -> None:
        self.is_loaded = False
        logger.info("Mock backend unloaded")


class ModelManager:
    def __init__(self, config: Any = None):
        self.config = config
        self.backend: Optional[BaseModelBackend] = None
        self.available_backends: Dict[str, type] = {
            "transformers": TransformersBackend,
            "llama_cpp": LlamaCppBackend,
            "ollama": OllamaBackend,
            "mock": MockBackend,
        }

    def initialize_backend(self, backend_type: str = "mock") -> bool:
        backend_class = self.available_backends.get(backend_type)
        if not backend_class:
            logger.error(f"Unknown backend type: {backend_type}")
            return False

        self.backend = backend_class(self.config)
        return self.backend.load()

    def generate(self, prompt: str, **kwargs) -> str:
        if not self.backend or not self.backend.is_loaded:
            raise RuntimeError("No backend loaded. Call initialize_backend() first.")
        return self.backend.generate(prompt, **kwargs)

    def unload(self) -> None:
        if self.backend:
            self.backend.unload()
            self.backend = None

    def is_ready(self) -> bool:
        return self.backend is not None and self.backend.is_loaded

    def list_available_backends(self) -> List[str]:
        return list(self.available_backends.keys())
