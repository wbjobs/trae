"""
异体字智能识别与转换模块 - Variant Converter
识别并转换古籍中的异体字、通假字、俗体字等
"""

import re
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, field

from .dictionary_loader import DictionaryLoader
from ..ai_inference.model_client import AncientTextModelClient, InferenceResult
from ..ai_inference.prompt_templates import PromptTemplates


@dataclass
class VariantCharacter:
    """异体字数据结构"""
    original_char: str
    standard_char: str
    variant_type: str
    position: int
    confidence: float
    source: str = ""


@dataclass
class ConversionResult:
    """转换结果"""
    original_text: str
    converted_text: str
    variants: List[VariantCharacter]
    method: str
    statistics: Dict[str, Any] = field(default_factory=dict)


class VariantConverter:
    """异体字转换器"""

    VARIANT_TYPES = {
        "variant": "异体字",
        "borrowing": "通假字",
        "vulgar": "俗体字",
        "ancient": "古体字",
        "simplified": "简体字",
        "traditional": "繁体字",
    }

    def __init__(self, dictionary_loader: Optional[DictionaryLoader] = None,
                 use_ai: bool = True,
                 ai_client: Optional[AncientTextModelClient] = None):
        """
        初始化异体字转换器

        Args:
            dictionary_loader: 字库加载器
            use_ai: 是否使用AI辅助识别
            ai_client: AI模型客户端
        """
        self.dict_loader = dictionary_loader or DictionaryLoader()
        self.dict_loader.load_variant_chars()

        self.use_ai = use_ai
        self.ai_client = ai_client or AncientTextModelClient()

        self.common_borrowings = {
            "蚤": "早",
            "畔": "叛",
            "匪": "非",
            "景": "影",
            "从": "纵",
            "衡": "横",
            "内": "纳",
            "反": "返",
            "责": "债",
            "见": "现",
            "说": "悦",
            "知": "智",
            "女": "汝",
            "矢": "誓",
            "曾": "增",
            "阙": "缺",
            "趣": "趋",
            "廪": "懔",
            "薄": "迫",
            "匪": "斐",
        }

    def convert_text(self, text: str, use_ai: Optional[bool] = None) -> ConversionResult:
        """
        转换文本中的异体字

        Args:
            text: 待转换文本
            use_ai: 是否使用AI（覆盖默认设置）

        Returns:
            转换结果
        """
        if not text or not isinstance(text, str):
            return ConversionResult(
                original_text=text or "",
                converted_text=text or "",
                variants=[],
                method="empty_input"
            )

        use_ai = use_ai if use_ai is not None else self.use_ai

        try:
            variants = self._dictionary_based_convert(text)

            if use_ai:
                try:
                    ai_variants = self._ai_based_recognize(text)
                    variants = self._merge_variants(variants, ai_variants)
                except Exception as e:
                    print(f"AI异体字识别失败，使用字典结果: {e}")

            converted_text = self._apply_conversion(text, variants)

            result = ConversionResult(
                original_text=text,
                converted_text=converted_text,
                variants=variants,
                method="ai_hybrid" if use_ai else "dictionary_based"
            )

            result.statistics = self._get_statistics(result)
            return result
        except Exception as e:
            print(f"异体字转换失败，返回原文本: {e}")
            return ConversionResult(
                original_text=text,
                converted_text=text,
                variants=[],
                method="failed",
                error=str(e)
            )

    def _dictionary_based_convert(self, text: str) -> List[VariantCharacter]:
        """基于字典的异体字转换"""
        variants = []

        if not text:
            return variants

        for i, char in enumerate(text):
            try:
                if not isinstance(char, str) or len(char) == 0:
                    continue

                standard_char = self.dict_loader.get_standard_char(char)

                if standard_char and standard_char != char:
                    variants.append(VariantCharacter(
                        original_char=char,
                        standard_char=standard_char,
                        variant_type="variant",
                        position=i,
                        confidence=0.9,
                        source="异体字映射表"
                    ))
                    continue

                if char in self.common_borrowings:
                    borrow_char = self.common_borrowings[char]
                    if borrow_char and borrow_char != char:
                        variants.append(VariantCharacter(
                            original_char=char,
                            standard_char=borrow_char,
                            variant_type="borrowing",
                            position=i,
                            confidence=0.7,
                            source="常见通假字表"
                        ))
            except Exception as e:
                print(f"处理字符 {repr(char)} (位置 {i}) 时出错: {e}")
                continue

        return variants

    def _ai_based_recognize(self, text: str) -> List[VariantCharacter]:
        """使用AI识别异体字"""
        prompt = PromptTemplates.get_variant_recognition_prompt(text)
        system_prompt = PromptTemplates.get_system_prompt()

        result = self.ai_client.infer(
            prompt=prompt,
            task_type="variant",
            system_prompt=system_prompt
        )

        if not result.success:
            print(f"AI异体字识别失败: {result.error}")
            return []

        return self._parse_ai_variant_result(result.content, text)

    def _parse_ai_variant_result(self, ai_content: str, original_text: str) -> List[VariantCharacter]:
        """解析AI返回的异体字识别结果"""
        variants = []

        lines = ai_content.strip().split("\n")
        in_result_section = False

        for line in lines:
            line = line.strip()

            if line.startswith("1. 异体字识别结果"):
                in_result_section = True
                continue
            elif line.startswith("2. 转换后的标准文本"):
                in_result_section = False
                continue

            if in_result_section and "->" in line:
                try:
                    parts = line.split("->")
                    if len(parts) >= 2:
                        original = parts[0].strip()
                        standard = parts[1].strip()

                        if len(original) == 1 and len(standard) == 1:
                            positions = [i for i, c in enumerate(original_text) if c == original]
                            for pos in positions:
                                variants.append(VariantCharacter(
                                    original_char=original,
                                    standard_char=standard,
                                    variant_type="AI识别",
                                    position=pos,
                                    confidence=0.75,
                                    source="AI识别"
                                ))
                except Exception as e:
                    print(f"解析AI异体字结果失败: {e}")

        return variants

    def _merge_variants(self, dict_variants: List[VariantCharacter],
                        ai_variants: List[VariantCharacter]) -> List[VariantCharacter]:
        """合并字典和AI识别的异体字"""
        try:
            seen = set()
            merged = []

            for v in dict_variants:
                try:
                    key = (v.position, v.original_char)
                    if key not in seen:
                        seen.add(key)
                        merged.append(v)
                except Exception as e:
                    print(f"处理字典异体字时出错: {e}")
                    continue

            for v in ai_variants:
                try:
                    key = (v.position, v.original_char)
                    if key not in seen:
                        seen.add(key)
                        merged.append(v)
                except Exception as e:
                    print(f"处理AI异体字时出错: {e}")
                    continue

            return sorted(merged, key=lambda x: x.position)
        except Exception as e:
            print(f"合并异体字时出错: {e}")
            return dict_variants

    def _apply_conversion(self, text: str, variants: List[VariantCharacter]) -> str:
        """应用转换"""
        try:
            if not text:
                return text

            chars = list(text)

            for variant in sorted(variants, key=lambda x: x.position, reverse=True):
                try:
                    if 0 <= variant.position < len(chars) and variant.standard_char:
                        chars[variant.position] = variant.standard_char
                except Exception as e:
                    print(f"应用转换时出错 (位置 {variant.position}): {e}")
                    continue

            return "".join(chars)
        except Exception as e:
            print(f"应用转换失败，返回原文本: {e}")
            return text

    def _get_statistics(self, result: ConversionResult) -> Dict[str, Any]:
        """获取统计信息"""
        try:
            type_counts = {}
            for v in result.variants:
                try:
                    type_counts[v.variant_type] = type_counts.get(v.variant_type, 0) + 1
                except Exception:
                    continue

            return {
                "total_variants": len(result.variants),
                "variant_types": type_counts,
                "original_length": len(result.original_text) if result.original_text else 0,
                "converted_length": len(result.converted_text) if result.converted_text else 0,
                "conversion_rate": len(result.variants) / max(1, len(result.original_text) if result.original_text else 1)
            }
        except Exception as e:
            print(f"获取统计信息时出错: {e}")
            return {
                "total_variants": len(result.variants) if result.variants else 0,
                "error": str(e)
            }

    def batch_convert(self, texts: List[str], use_ai: Optional[bool] = None) -> List[ConversionResult]:
        """
        批量转换异体字

        Args:
            texts: 文本列表
            use_ai: 是否使用AI

        Returns:
            转换结果列表
        """
        results = []
        for text in texts:
            result = self.convert_text(text, use_ai)
            results.append(result)
        return results

    def get_variant_info(self, char: str) -> Dict[str, Any]:
        """
        获取异体字详细信息

        Args:
            char: 异体字

        Returns:
            异体字信息
        """
        standard = self.dict_loader.get_standard_char(char)
        variants = self.dict_loader.get_variants(char)
        char_info = self.dict_loader.get_char_info(char)

        return {
            "char": char,
            "is_variant": standard != char,
            "standard_char": standard,
            "other_variants": variants,
            "char_info": char_info,
            "is_common_borrowing": char in self.common_borrowings,
            "borrowing_standard": self.common_borrowings.get(char)
        }

    def generate_variant_report(self, result: ConversionResult) -> str:
        """
        生成异体字转换报告

        Args:
            result: 转换结果

        Returns:
            报告文本
        """
        report = "【异体字转换报告】\n"
        report += f"转换方法：{result.method}\n"
        report += f"原文长度：{len(result.original_text)} 字\n"
        report += f"发现异体字：{len(result.variants)} 个\n\n"

        if result.variants:
            report += "异体字列表：\n"
            for i, v in enumerate(result.variants, 1):
                type_name = self.VARIANT_TYPES.get(v.variant_type, v.variant_type)
                report += f"{i}. 「{v.original_char}」 → 「{v.standard_char}」 "
                report += f"（{type_name}，位置：{v.position}，置信度：{v.confidence:.2f}）\n"
                if v.source:
                    report += f"   来源：{v.source}\n"
            report += "\n"

        report += "转换后文本：\n"
        report += result.converted_text + "\n"

        return report

    def highlight_variants(self, text: str, variants: List[VariantCharacter],
                           start_marker: str = "【", end_marker: str = "】") -> str:
        """
        高亮显示异体字

        Args:
            text: 原文
            variants: 异体字列表
            start_marker: 开始标记
            end_marker: 结束标记

        Returns:
            高亮后的文本
        """
        chars = list(text)
        offset = 0

        for variant in sorted(variants, key=lambda x: x.position):
            pos = variant.position + offset
            if 0 <= pos < len(chars):
                chars.insert(pos, start_marker)
                chars.insert(pos + 2, end_marker)
                offset += 2

        return "".join(chars)
