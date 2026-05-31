"""
字库匹配模块 - Character Matching Module
异体字识别转换、古文字义溯源匹配
"""

from .variant_converter import VariantConverter
from .meaning_matcher import MeaningMatcher
from .dictionary_loader import DictionaryLoader

__all__ = ["VariantConverter", "MeaningMatcher", "DictionaryLoader"]
