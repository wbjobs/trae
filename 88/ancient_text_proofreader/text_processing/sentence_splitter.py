"""
古籍断句模块 - Sentence Splitter
实现无标点古籍的智能断句和标点添加
"""

import re
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, field

from ..ai_inference.model_client import AncientTextModelClient, InferenceResult
from ..ai_inference.prompt_templates import PromptTemplates


@dataclass
class Sentence:
    """句子数据结构"""
    text: str
    start_pos: int
    end_pos: int
    punctuation: str = ""
    is_complete: bool = False
    confidence: float = 0.0


@dataclass
class PunctuationResult:
    """断句结果"""
    original_text: str
    punctuated_text: str
    sentences: List[Sentence]
    method: str
    confidence: float = 0.0
    ai_result: Optional[InferenceResult] = None


class SentenceSplitter:
    """古籍断句器"""

    def __init__(self, use_ai: bool = True, ai_client: Optional[AncientTextModelClient] = None):
        """
        初始化断句器

        Args:
            use_ai: 是否使用AI辅助断句
            ai_client: AI模型客户端
        """
        self.use_ai = use_ai
        self.ai_client = ai_client or AncientTextModelClient()

        self.classical_particles = {
            "sentence_end": ["也", "矣", "焉", "耳", "哉", "耶", "欤", "乎", "邪", "夫"],
            "sentence_mid": ["之", "而", "以", "于", "其", "为", "则", "乃", "且", "然"],
            "question": ["乎", "耶", "欤", "哉", "邪"],
            "exclamation": ["哉", "夫", "也"],
            "pause": ["者", "也", "矣", "焉"],
        }

        self.punctuation_map = {
            "。": ["也", "矣", "焉", "耳"],
            "，": ["之", "而", "以", "于"],
            "？": ["乎", "耶", "欤"],
            "！": ["哉", "夫"],
            "；": ["者", "则"],
            "：": ["曰", "云", "言"],
        }

        self.quote_patterns = [
            ("「", "」"),
            ("『", "』"),
            ("\"", "\""),
            ("'", "'"),
        ]

        self.max_segment_length = 500
        self.context_overlap = 30
        self.min_sentence_length = 3

    def split_text(self, text: str, use_ai: Optional[bool] = None) -> PunctuationResult:
        """
        对文本进行断句和标点添加

        Args:
            text: 无标点文本
            use_ai: 是否使用AI（覆盖默认设置）

        Returns:
            断句结果
        """
        if not text or not isinstance(text, str):
            return PunctuationResult(
                original_text=text or "",
                punctuated_text=text or "",
                sentences=[],
                method="empty_input",
                confidence=1.0
            )

        use_ai = use_ai if use_ai is not None else self.use_ai

        try:
            if len(text) > self.max_segment_length:
                return self._split_long_text(text, use_ai)

            if use_ai:
                try:
                    result = self._ai_split(text)
                    if result and result.sentences:
                        return result
                except Exception as e:
                    print(f"AI断句失败，使用规则断句: {e}")

            return self._rule_based_split(text)
        except Exception as e:
            print(f"断句失败，返回原文本: {e}")
            sentences = []
            if text:
                sentences.append(Sentence(
                    text=text,
                    start_pos=0,
                    end_pos=len(text),
                    punctuation="。",
                    is_complete=True,
                    confidence=0.5
                ))
            return PunctuationResult(
                original_text=text,
                punctuated_text=text + "。",
                sentences=sentences,
                method="failed",
                confidence=0.5
            )

    def _split_long_text(self, text: str, use_ai: bool) -> PunctuationResult:
        """
        分段处理长文本

        Args:
            text: 长文本
            use_ai: 是否使用AI

        Returns:
            断句结果
        """
        segments = self._segment_text(text)
        all_sentences = []
        all_punctuated_parts = []
        total_confidence = 0.0
        segment_count = 0

        for i, segment in enumerate(segments):
            try:
                if use_ai:
                    result = self._ai_split(segment)
                    if not result or not result.sentences:
                        result = self._rule_based_split(segment)
                else:
                    result = self._rule_based_split(segment)

                if result.sentences:
                    adjusted_sentences = self._adjust_sentence_positions(
                        result.sentences,
                        segments[i][0] if isinstance(segments[i], tuple) else 0
                    )

                    if i > 0 and all_sentences and adjusted_sentences:
                        merged = self._merge_overlapping_sentences(
                            all_sentences[-1],
                            adjusted_sentences[0]
                        )
                        if merged:
                            all_sentences[-1] = merged
                            adjusted_sentences = adjusted_sentences[1:]

                    all_sentences.extend(adjusted_sentences)
                    all_punctuated_parts.append(result.punctuated_text)
                    total_confidence += result.confidence
                    segment_count += 1
            except Exception as e:
                print(f"处理分段 {i} 时出错: {e}")
                all_sentences.append(Sentence(
                    text=segment[1] if isinstance(segment, tuple) else segment,
                    start_pos=segment[0] if isinstance(segment, tuple) else 0,
                    end_pos=(segment[0] if isinstance(segment, tuple) else 0) + len(segment),
                    punctuation="。",
                    is_complete=True,
                    confidence=0.5
                ))
                all_punctuated_parts.append(segment[1] if isinstance(segment, tuple) else segment + "。")

        all_sentences = self._clean_sentences(all_sentences)
        punctuated_text = "".join(all_punctuated_parts)
        avg_confidence = total_confidence / max(1, segment_count) if segment_count > 0 else 0.6

        return PunctuationResult(
            original_text=text,
            punctuated_text=punctuated_text,
            sentences=all_sentences,
            method="segmented_" + ("ai" if use_ai else "rule_based"),
            confidence=avg_confidence
        )

    def _segment_text(self, text: str) -> List[Tuple[int, str]]:
        """
        将长文本分割成有重叠的分段

        Args:
            text: 原始文本

        Returns:
            分段列表，每个元素为(起始位置, 文本内容)
        """
        segments = []
        text_length = len(text)

        if text_length <= self.max_segment_length:
            return [(0, text)]

        start = 0
        while start < text_length:
            end = min(start + self.max_segment_length, text_length)

            if end < text_length:
                segment_end = self._find_segment_boundary(text, start, end)
                if segment_end > start:
                    end = segment_end

            segments.append((start, text[start:end]))
            start = end - self.context_overlap

            if start < 0:
                start = 0

        return segments

    def _find_segment_boundary(self, text: str, start: int, end: int) -> int:
        """
        在指定位置附近寻找合适的分段边界

        Args:
            text: 文本
            start: 分段起始位置
            end: 期望的分段结束位置

        Returns:
            实际的分段结束位置
        """
        search_range = min(80, end - start - 20)

        for i in range(end, max(start + 20, end - search_range), -1):
            if text[i] in "\n\r。；！？":
                return i + 1

        for i in range(end, max(start + 20, end - search_range), -1):
            if text[i] in "，、、":
                return i + 1

        for i in range(end, max(start + 20, end - search_range), -1):
            if text[i] in self.classical_particles["sentence_end"]:
                return i + 1

        return end

    def _adjust_sentence_positions(self, sentences: List[Sentence], offset: int) -> List[Sentence]:
        """
        调整句子的位置偏移

        Args:
            sentences: 句子列表
            offset: 偏移量

        Returns:
            调整后的句子列表
        """
        adjusted = []
        for sent in sentences:
            adjusted.append(Sentence(
                text=sent.text,
                start_pos=sent.start_pos + offset,
                end_pos=sent.end_pos + offset,
                punctuation=sent.punctuation,
                is_complete=sent.is_complete,
                confidence=sent.confidence
            ))
        return adjusted

    def _merge_overlapping_sentences(self, sent1: Sentence, sent2: Sentence) -> Optional[Sentence]:
        """
        合并重叠的句子

        Args:
            sent1: 第一个句子
            sent2: 第二个句子

        Returns:
            合并后的句子，如果不需要合并则返回None
        """
        if not sent1 or not sent2:
            return None

        overlap = sent1.end_pos - sent2.start_pos
        if overlap <= 0:
            return None

        overlap_text = sent1.text[-overlap:]
        if overlap_text == sent2.text[:overlap]:
            merged_text = sent1.text + sent2.text[overlap:]
            return Sentence(
                text=merged_text,
                start_pos=sent1.start_pos,
                end_pos=sent2.end_pos,
                punctuation=sent2.punctuation or sent1.punctuation,
                is_complete=sent2.is_complete or sent1.is_complete,
                confidence=(sent1.confidence + sent2.confidence) / 2
            )

        return None

    def _clean_sentences(self, sentences: List[Sentence]) -> List[Sentence]:
        """
        清理和规范化句子列表

        Args:
            sentences: 原始句子列表

        Returns:
            清理后的句子列表
        """
        cleaned = []
        for sent in sentences:
            if not sent or not sent.text:
                continue

            sent_text = sent.text.strip()
            if not sent_text:
                continue

            if len(sent_text) < self.min_sentence_length and cleaned:
                prev = cleaned[-1]
                merged = Sentence(
                    text=prev.text + sent_text,
                    start_pos=prev.start_pos,
                    end_pos=sent.end_pos,
                    punctuation=sent.punctuation or prev.punctuation,
                    is_complete=sent.is_complete or prev.is_complete,
                    confidence=(prev.confidence + sent.confidence) / 2
                )
                cleaned[-1] = merged
                continue

            cleaned.append(sent)

        return cleaned

    def _ai_split(self, text: str) -> PunctuationResult:
        """使用AI进行断句"""
        try:
            if isinstance(text, tuple):
                text = text[1]

            if not text or not isinstance(text, str):
                return self._rule_based_split(text)

            prompt = PromptTemplates.get_punctuation_prompt(text)
            system_prompt = PromptTemplates.get_system_prompt()

            result = self.ai_client.infer(
                prompt=prompt,
                task_type="punctuation",
                system_prompt=system_prompt
            )

            if result.success:
                punctuated_text = self._extract_punctuated_text(result.content, text)
                sentences = self._extract_sentences(punctuated_text)

                return PunctuationResult(
                    original_text=text,
                    punctuated_text=punctuated_text,
                    sentences=sentences,
                    method="ai",
                    confidence=0.85,
                    ai_result=result
                )
            else:
                print(f"AI断句失败，回退到规则断句: {result.error}")
                return self._rule_based_split(text)
        except Exception as e:
            print(f"AI断句异常，回退到规则断句: {e}")
            return self._rule_based_split(text)

    def _rule_based_split(self, text: str) -> PunctuationResult:
        """基于规则的断句"""
        try:
            if isinstance(text, tuple):
                text = text[1]

            if not text or not isinstance(text, str):
                return PunctuationResult(
                    original_text=text or "",
                    punctuated_text=text or "",
                    sentences=[],
                    method="empty_input",
                    confidence=1.0
                )

            chars = list(text)
            result_chars = []
            sentences = []
            current_sentence_start = 0

            for i, char in enumerate(chars):
                result_chars.append(char)

                if i < len(chars) - 1:
                    next_char = chars[i + 1]

                    if char in self.classical_particles["sentence_end"]:
                        if next_char not in self.classical_particles["sentence_end"] and \
                           next_char not in ["」", "』", "）", "】"]:
                            if char in self.classical_particles["question"] and i > 2:
                                prev_chars = "".join(chars[max(0, i-5):i])
                                if any(q in prev_chars for q in ["何", "安", "焉", "胡", "奚", "岂", "宁"]):
                                    result_chars.append("？")
                                else:
                                    result_chars.append("。")
                            elif char in self.classical_particles["exclamation"]:
                                result_chars.append("！")
                            else:
                                result_chars.append("。")

                            sentence_text = "".join(chars[current_sentence_start:i+1])
                            sentences.append(Sentence(
                                text=sentence_text,
                                start_pos=current_sentence_start,
                                end_pos=i+1,
                                punctuation=result_chars[-1],
                                is_complete=True,
                                confidence=0.6
                            ))
                            current_sentence_start = i + 1

                    elif char in self.classical_particles["sentence_mid"]:
                        if next_char not in self.classical_particles["sentence_mid"] and \
                           next_char not in self.classical_particles["sentence_end"]:
                            if char == "之" and i > 0 and i < len(chars) - 2:
                                prev_char = chars[i-1]
                                next_next_char = chars[i+2] if i+2 < len(chars) else ""
                                if prev_char in self.classical_particles["sentence_mid"] or \
                                   next_next_char in self.classical_particles["sentence_end"]:
                                    pass
                                else:
                                    pass
                            elif char in ["而", "以", "于"]:
                                pass

                    elif char in ["曰", "云", "言"]:
                        if i > 0 and chars[i-1] not in ["」", "』"]:
                            result_chars.append("：")

            if current_sentence_start < len(chars):
                remaining = "".join(chars[current_sentence_start:])
                if remaining.strip():
                    sentences.append(Sentence(
                        text=remaining,
                        start_pos=current_sentence_start,
                        end_pos=len(chars),
                        punctuation="。",
                        is_complete=True,
                        confidence=0.5
                    ))
                    result_chars.append("。")

            punctuated_text = "".join(result_chars)
            punctuated_text = self._post_process_punctuation(punctuated_text)

            return PunctuationResult(
                original_text=text,
                punctuated_text=punctuated_text,
                sentences=sentences,
                method="rule_based",
                confidence=0.6
            )
        except Exception as e:
            print(f"规则断句失败: {e}")
            sentences = []
            if text:
                sentences.append(Sentence(
                    text=text,
                    start_pos=0,
                    end_pos=len(text),
                    punctuation="。",
                    is_complete=True,
                    confidence=0.5
                ))
            return PunctuationResult(
                original_text=text,
                punctuated_text=text + "。" if text else "",
                sentences=sentences,
                method="rule_based_failed",
                confidence=0.5
            )

    def _extract_punctuated_text(self, ai_content: str, original_text: str) -> str:
        """从AI返回内容中提取标点后的文本"""
        lines = ai_content.strip().split("\n")

        for i, line in enumerate(lines):
            line = line.strip()
            if line and not line.startswith("1.") and not line.startswith("2.") and \
               not line.startswith("原文") and not line.startswith("请输出"):
                if len(line) > len(original_text) * 0.5:
                    return line

        if len(lines) >= 2:
            return lines[-1].strip()

        return original_text

    def _extract_sentences(self, punctuated_text: str) -> List[Sentence]:
        """从标点文本中提取句子"""
        sentences = []
        current_pos = 0
        current_text = []

        for i, char in enumerate(punctuated_text):
            if char in ["。", "！", "？", "；"]:
                current_text.append(char)
                sentence_text = "".join(current_text)
                sentences.append(Sentence(
                    text=sentence_text,
                    start_pos=current_pos,
                    end_pos=i+1,
                    punctuation=char,
                    is_complete=True,
                    confidence=0.7
                ))
                current_pos = i + 1
                current_text = []
            elif char in ["，", "、", "："]:
                current_text.append(char)
            else:
                current_text.append(char)

        if current_text:
            remaining = "".join(current_text)
            if remaining.strip():
                sentences.append(Sentence(
                    text=remaining,
                    start_pos=current_pos,
                    end_pos=len(punctuated_text),
                    punctuation="",
                    is_complete=False,
                    confidence=0.5
                ))

        return sentences

    def _post_process_punctuation(self, text: str) -> str:
        """后处理标点"""
        text = re.sub(r"[。！？；，、：]{2,}", lambda m: m.group(0)[0], text)
        text = re.sub(r"。，", "。", text)
        text = re.sub(r"，。", "。", text)
        text = re.sub(r"([。！？])，", r"\1", text)

        for open_q, close_q in self.quote_patterns:
            text = re.sub(rf"{open_q}\s*{close_q}", "", text)

        return text

    def batch_split(self, texts: List[str], use_ai: Optional[bool] = None) -> List[PunctuationResult]:
        """
        批量断句

        Args:
            texts: 文本列表
            use_ai: 是否使用AI

        Returns:
            断句结果列表
        """
        results = []
        for text in texts:
            result = self.split_text(text, use_ai)
            results.append(result)
        return results

    def extract_sentence_with_context(self, text: str, target_sentence: str,
                                       context_chars: int = 50) -> Dict[str, Any]:
        """
        提取句子及其上下文

        Args:
            text: 完整文本
            target_sentence: 目标句子
            context_chars: 上下文字符数

        Returns:
            包含上下文的句子信息
        """
        pos = text.find(target_sentence)
        if pos == -1:
            return {"found": False}

        start = max(0, pos - context_chars)
        end = min(len(text), pos + len(target_sentence) + context_chars)

        return {
            "found": True,
            "sentence": target_sentence,
            "position": pos,
            "context_before": text[start:pos],
            "context_after": text[pos + len(target_sentence):end],
            "full_context": text[start:end]
        }

    def get_statistics(self, result: PunctuationResult) -> Dict[str, Any]:
        """
        获取断句统计信息

        Args:
            result: 断句结果

        Returns:
            统计信息
        """
        return {
            "original_length": len(result.original_text),
            "punctuated_length": len(result.punctuated_text),
            "sentence_count": len(result.sentences),
            "complete_sentences": sum(1 for s in result.sentences if s.is_complete),
            "average_sentence_length": sum(len(s.text) for s in result.sentences) / max(1, len(result.sentences)),
            "method": result.method,
            "confidence": result.confidence
        }
