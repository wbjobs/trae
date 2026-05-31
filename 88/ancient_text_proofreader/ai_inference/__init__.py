"""
AI推理调用模块 - AI Inference Module
封装古文语义大模型推理接口
"""

from .model_client import AncientTextModelClient
from .prompt_templates import PromptTemplates

__all__ = ["AncientTextModelClient", "PromptTemplates"]
