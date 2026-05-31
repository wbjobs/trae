"""
古籍异体字智能勘校AI应用系统
Ancient Text Variant Character Proofreading AI System

版本 2.0.0 新增功能:
- 古籍方言用字专项勘校功能
- AI勘校人工复核批注模块
- 轻量化模型本地推理加速
- 古籍篇目文体自动分类
- 历代古籍专用字库扩充
"""

__version__ = "2.0.0"
__author__ = "AI Research Team"

from .main import AncientTextProofreader
from .config import config

from .character_matching.dialect_processor import (
    DialectProcessor,
    DialectCharacter,
    DialectProcessingResult
)

from .text_processing.style_classifier import (
    AncientTextClassifier,
    StyleClassification,
    GenreClassification,
    LiteraryEra
)

from .result_export.review_module import (
    ReviewManager,
    ReviewSession,
    ReviewComment,
    CorrectionRecord
)

from .ai_inference.lightweight_inference import (
    LightweightInferenceEngine,
    ModelOptimizationConfig,
    AcceleratedModelClient,
    InferenceCache,
    BatchInferenceProcessor,
    ModelQuantizer
)

__all__ = [
    "AncientTextProofreader",
    "config",
    "DialectProcessor",
    "DialectCharacter",
    "DialectProcessingResult",
    "AncientTextClassifier",
    "StyleClassification",
    "GenreClassification",
    "LiteraryEra",
    "ReviewManager",
    "ReviewSession",
    "ReviewComment",
    "CorrectionRecord",
    "LightweightInferenceEngine",
    "ModelOptimizationConfig",
    "AcceleratedModelClient",
    "InferenceCache",
    "BatchInferenceProcessor",
    "ModelQuantizer",
]
