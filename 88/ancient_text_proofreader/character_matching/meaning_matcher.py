"""
古文字义溯源匹配模块 - Meaning Matcher
实现字义溯源和释义批量挂载
"""

import re
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, field

from .dictionary_loader import DictionaryLoader
from ..ai_inference.model_client import AncientTextModelClient, InferenceResult
from ..ai_inference.prompt_templates import PromptTemplates


@dataclass
class CharacterAnnotation:
    """汉字注释"""
    char: str
    position: int
    pinyin: str = ""
    meaning: str = ""
    part_of_speech: str = ""
    examples: List[str] = field(default_factory=list)
    etymology: str = ""
    era: str = ""
    confidence: float = 0.0
    source: str = ""


@dataclass
class AnnotationResult:
    """注释结果"""
    original_text: str
    annotations: List[CharacterAnnotation]
    annotated_text: str
    method: str
    statistics: Dict[str, Any] = field(default_factory=dict)


class MeaningMatcher:
    """字义匹配器"""

    def __init__(self, dictionary_loader: Optional[DictionaryLoader] = None,
                 use_ai: bool = True,
                 ai_client: Optional[AncientTextModelClient] = None):
        """
        初始化字义匹配器

        Args:
            dictionary_loader: 字库加载器
            use_ai: 是否使用AI辅助注释
            ai_client: AI模型客户端
        """
        self.dict_loader = dictionary_loader or DictionaryLoader()
        self.dict_loader.load_all()

        self.use_ai = use_ai
        self.ai_client = ai_client or AncientTextModelClient()

        self.common_classical_chars = set([
            "之", "乎", "者", "也", "矣", "焉", "哉", "耶", "欤", "耳",
            "而", "其", "以", "于", "为", "所", "被", "把", "将", "则",
            "不", "弗", "勿", "毋", "未", "非", "无", "莫", "岂", "宁",
            "盖", "夫", "惟", "维", "粤", "曰", "云", "言", "道", "德",
            "仁", "义", "礼", "智", "信", "忠", "孝", "节", "勇", "廉",
            "天", "地", "人", "心", "性", "命", "道", "理", "气", "数",
            "学", "习", "思", "行", "知", "言", "文", "章", "诗", "书",
        ])

    def annotate_text(self, text: str, target_chars: Optional[List[str]] = None,
                      use_ai: Optional[bool] = None,
                      min_distance: int = 3) -> AnnotationResult:
        """
        为文本添加注释

        Args:
            text: 待注释文本
            target_chars: 目标字列表，如果为空则注释所有常见字
            use_ai: 是否使用AI（覆盖默认设置）
            min_distance: 注释之间的最小距离（避免重叠）

        Returns:
            注释结果
        """
        if not text or not isinstance(text, str):
            return AnnotationResult(
                original_text=text or "",
                annotations=[],
                annotated_text=text or "",
                method="empty_input"
            )

        use_ai = use_ai if use_ai is not None else self.use_ai

        try:
            if target_chars is None:
                target_chars = self._extract_important_chars(text)

            annotations = self._dictionary_based_annotate(text, target_chars)

            if use_ai:
                try:
                    ai_annotations = self._ai_based_annotate(text, target_chars)
                    annotations = self._merge_annotations(annotations, ai_annotations)
                except Exception as e:
                    print(f"AI注释失败，使用字典注释: {e}")

            annotations = self._filter_overlapping_annotations(annotations, min_distance)

            annotated_text = self._generate_annotated_text(text, annotations)

            result = AnnotationResult(
                original_text=text,
                annotations=annotations,
                annotated_text=annotated_text,
                method="ai_hybrid" if use_ai else "dictionary_based"
            )

            result.statistics = self._get_statistics(result)
            return result
        except Exception as e:
            print(f"注释文本失败: {e}")
            return AnnotationResult(
                original_text=text,
                annotations=[],
                annotated_text=text,
                method="failed",
                statistics={"error": str(e)}
            )

    def _extract_important_chars(self, text: str) -> List[str]:
        """提取需要注释的重要字"""
        try:
            chars = []
            seen = set()

            for char in text:
                try:
                    if not isinstance(char, str) or len(char) == 0:
                        continue

                    if char in self.common_classical_chars and char not in seen:
                        chars.append(char)
                        seen.add(char)
                    elif char not in seen and self.dict_loader.has_char(char):
                        meanings = self.dict_loader.get_char_meanings(char)
                        if meanings and len(meanings) >= 2:
                            chars.append(char)
                            seen.add(char)
                except Exception:
                    continue

            return chars[:20]
        except Exception as e:
            print(f"提取重要字失败: {e}")
            return []

    def _filter_overlapping_annotations(self, annotations: List[CharacterAnnotation],
                                        min_distance: int = 3) -> List[CharacterAnnotation]:
        """
        过滤重叠的注释，避免排版混乱

        Args:
            annotations: 原始注释列表
            min_distance: 注释之间的最小距离

        Returns:
            过滤后的注释列表
        """
        if not annotations:
            return []

        try:
            sorted_annotations = sorted(annotations, key=lambda x: (x.position, -x.confidence))
            filtered = []
            last_position = -min_distance

            for ann in sorted_annotations:
                try:
                    if ann.position - last_position >= min_distance:
                        filtered.append(ann)
                        last_position = ann.position
                    else:
                        if filtered and filtered[-1].position == ann.position:
                            if ann.confidence > filtered[-1].confidence:
                                filtered[-1] = ann
                                last_position = ann.position
                except Exception:
                    continue

            return sorted(filtered, key=lambda x: x.position)
        except Exception as e:
            print(f"过滤重叠注释失败: {e}")
            return annotations

    def _dictionary_based_annotate(self, text: str, target_chars: List[str]) -> List[CharacterAnnotation]:
        """基于字典的字义注释"""
        annotations = []

        for target_char in target_chars:
            positions = [i for i, c in enumerate(text) if c == target_char]

            for pos in positions[:3]:
                char_info = self.dict_loader.get_char_info(target_char)
                meanings = self.dict_loader.get_char_meanings(target_char)

                annotation = CharacterAnnotation(
                    char=target_char,
                    position=pos,
                    confidence=0.8,
                    source="本地字库"
                )

                if char_info:
                    annotation.pinyin = char_info.get("pinyin", "")
                    annotation.era = char_info.get("era", "")
                    annotation.etymology = char_info.get("origin", "")

                if meanings:
                    primary_meaning = meanings[0]
                    annotation.meaning = primary_meaning.get("meaning", "")
                    annotation.part_of_speech = primary_meaning.get("part_of_speech", "")
                    annotation.examples = primary_meaning.get("examples", [])

                annotations.append(annotation)

        return annotations

    def _ai_based_annotate(self, text: str, target_chars: List[str]) -> List[CharacterAnnotation]:
        """使用AI进行字义注释"""
        prompt = PromptTemplates.get_meaning_annotation_prompt(text, target_chars)
        system_prompt = PromptTemplates.get_system_prompt()

        result = self.ai_client.infer(
            prompt=prompt,
            task_type="meaning",
            system_prompt=system_prompt
        )

        if not result.success:
            print(f"AI字义注释失败: {result.error}")
            return []

        return self._parse_ai_annotation_result(result.content, text)

    def _parse_ai_annotation_result(self, ai_content: str, original_text: str) -> List[CharacterAnnotation]:
        """解析AI返回的注释结果"""
        annotations = []

        lines = ai_content.strip().split("\n")
        current_char = None
        current_annotation = None

        for line in lines:
            line = line.strip()

            if line.startswith("【") and line.endswith("】"):
                if current_annotation and current_char:
                    positions = [i for i, c in enumerate(original_text) if c == current_char]
                    for pos in positions[:1]:
                        current_annotation.position = pos
                        annotations.append(current_annotation)

                current_char = line[1:-1]
                if len(current_char) == 1:
                    current_annotation = CharacterAnnotation(
                        char=current_char,
                        position=0,
                        confidence=0.7,
                        source="AI注释"
                    )
                else:
                    current_char = None
                    current_annotation = None

            elif current_annotation and line:
                if line.startswith("读音："):
                    current_annotation.pinyin = line[3:].strip()
                elif line.startswith("含义：") or line.startswith("意思："):
                    current_annotation.meaning = line[3:].strip()
                elif line.startswith("词性："):
                    current_annotation.part_of_speech = line[3:].strip()
                elif line.startswith("用例：") or line.startswith("例句："):
                    current_annotation.examples.append(line[3:].strip())
                elif line.startswith("字源：") or line.startswith("来源："):
                    current_annotation.etymology = line[3:].strip()

        if current_annotation and current_char:
            positions = [i for i, c in enumerate(original_text) if c == current_char]
            for pos in positions[:1]:
                current_annotation.position = pos
                annotations.append(current_annotation)

        return annotations

    def _merge_annotations(self, dict_annotations: List[CharacterAnnotation],
                           ai_annotations: List[CharacterAnnotation]) -> List[CharacterAnnotation]:
        """合并字典和AI的注释"""
        seen = set()
        merged = []

        for a in dict_annotations:
            key = (a.position, a.char)
            if key not in seen:
                seen.add(key)
                merged.append(a)

        for a in ai_annotations:
            key = (a.position, a.char)
            if key not in seen:
                seen.add(key)
                merged.append(a)
            else:
                for i, existing in enumerate(merged):
                    if existing.position == a.position and existing.char == a.char:
                        if a.meaning and not existing.meaning:
                            merged[i].meaning = a.meaning
                        if a.pinyin and not existing.pinyin:
                            merged[i].pinyin = a.pinyin
                        if a.examples and not existing.examples:
                            merged[i].examples = a.examples
                        break

        return sorted(merged, key=lambda x: x.position)

    def _generate_annotated_text(self, text: str, annotations: List[CharacterAnnotation]) -> str:
        """生成带注释的文本"""
        if not text or not annotations:
            return text

        try:
            text_length = len(text)
            insertions = []
            ann_positions = set()

            for annotation in annotations:
                try:
                    if annotation.position is None or not isinstance(annotation.position, int) or annotation.position < 0 or annotation.position >= text_length:
                        continue

                    if annotation.position in ann_positions:
                        continue

                    note_parts = []
                    if annotation.pinyin:
                        note_parts.append(annotation.pinyin)
                    if annotation.meaning:
                        note_parts.append(annotation.meaning)

                    if note_parts:
                        note = "(" + "：".join(note_parts) + ")"
                        insertions.append((annotation.position, note))
                        ann_positions.add(annotation.position)
                except Exception:
                    continue

            insertions.sort(key=lambda x: x[0], reverse=True)

            result = list(text)
            for pos, note in insertions:
                try:
                    if 0 <= pos + 1 <= len(result):
                        result.insert(pos + 1, note)
                except Exception:
                    continue

            return "".join(result)
        except Exception as e:
            print(f"生成注释文本失败: {e}")
            return text

    def _get_statistics(self, result: AnnotationResult) -> Dict[str, Any]:
        """获取统计信息"""
        chars_annotated = set(a.char for a in result.annotations)

        return {
            "total_annotations": len(result.annotations),
            "unique_chars": len(chars_annotated),
            "original_length": len(result.original_text),
            "annotated_length": len(result.annotated_text),
            "annotation_density": len(result.annotations) / max(1, len(result.original_text))
        }

    def batch_annotate(self, texts: List[str], target_chars: Optional[List[str]] = None,
                       use_ai: Optional[bool] = None) -> List[AnnotationResult]:
        """
        批量注释

        Args:
            texts: 文本列表
            target_chars: 目标字列表
            use_ai: 是否使用AI

        Returns:
            注释结果列表
        """
        results = []
        for text in texts:
            result = self.annotate_text(text, target_chars, use_ai)
            results.append(result)
        return results

    def get_char_complete_info(self, char: str) -> Dict[str, Any]:
        """
        获取汉字的完整信息

        Args:
            char: 汉字

        Returns:
            完整信息字典
        """
        char_info = self.dict_loader.get_char_info(char)
        meanings = self.dict_loader.get_char_meanings(char)
        variants = self.dict_loader.get_variants(char)
        standard = self.dict_loader.get_standard_char(char)

        return {
            "char": char,
            "is_variant": standard != char,
            "standard_char": standard,
            "variants": variants,
            "basic_info": char_info,
            "meanings": meanings,
            "has_info": self.dict_loader.has_char(char)
        }

    def generate_glossary(self, annotations: List[CharacterAnnotation]) -> str:
        """
        生成词汇表

        Args:
            annotations: 注释列表

        Returns:
            词汇表文本
        """
        glossary = "【词汇表】\n\n"

        unique_chars = {}
        for a in annotations:
            if a.char not in unique_chars:
                unique_chars[a.char] = a

        for char, annotation in sorted(unique_chars.items()):
            glossary += f"【{char}】"
            if annotation.pinyin:
                glossary += f" {annotation.pinyin}"
            glossary += "\n"
            if annotation.part_of_speech:
                glossary += f"  词性：{annotation.part_of_speech}\n"
            if annotation.meaning:
                glossary += f"  释义：{annotation.meaning}\n"
            if annotation.etymology:
                glossary += f"  字源：{annotation.etymology}\n"
            if annotation.examples:
                glossary += f"  用例：{annotation.examples[0]}\n"
            glossary += "\n"

        return glossary
