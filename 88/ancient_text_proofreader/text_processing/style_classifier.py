#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
古籍篇目文体自动分类模块 - Ancient Text Style Classifier
自动识别古籍文体类型（经、史、子、集、诗、词、赋、散文、骈文等）
"""

import json
import os
import re
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field


@dataclass
class StyleClassification:
    """文体分类结果"""
    primary_style: str
    primary_confidence: float
    secondary_styles: List[Tuple[str, float]]
    style_features: Dict[str, Any]
    method: str
    text_length: int = 0


@dataclass
class GenreClassification:
    """题材分类结果"""
    primary_genre: str
    primary_confidence: float
    secondary_genres: List[Tuple[str, float]]
    genre_keywords: List[str]
    method: str


@dataclass
class LiteraryEra:
    """文学时代判断"""
    era: str
    confidence: float
    era_features: Dict[str, Any]
    key_indicators: List[str]


class StyleFeatureExtractor:
    """文体特征提取器"""

    def __init__(self):
        """初始化特征提取器"""
        self.feature_patterns = {
            "parallel_prosody": self._detect_parallel_prosody,
            "rhythm_pattern": self._detect_rhythm_pattern,
            "rhyme_scheme": self._detect_rhyme_scheme,
            "sentence_length_distribution": self._analyze_sentence_length,
            "function_word_frequency": self._analyze_function_words,
            "literary_quotations": self._detect_literary_quotations,
        }

        self.function_words = {
            "classical": ["之", "乎", "者", "也", "矣", "焉", "哉", "耶", "与", "邪", "欤"],
            "poetic": ["兮", "夫", "惟", "维", "伊", "其", "且", "然", "则", "故"],
            "narrative": ["乃", "遂", "于是", "然后", "继而", "卒", "终", "始"],
            "argumentative": ["盖", "凡", "大抵", "故曰", "是以", "是故", "然则"],
            "descriptive": ["其", "如", "似", "若", "仿佛", "依稀", "宛若"],
        }

        self.era_indicators = {
            "pre_qin": ["诗曰", "书云", "礼曰", "易曰", "春秋"],
            "han_dynasty": ["汉", "西汉", "东汉", "史记", "汉书"],
            "wei_jin": ["魏", "晋", "建安", "正始", "竹林"],
            "tang_dynasty": ["唐", "贞观", "开元", "天宝", "李杜"],
            "song_dynasty": ["宋", "北宋", "南宋", "理学", "程朱"],
            "ming_dynasty": ["明", "永乐", "万历", "阳明", "心学"],
            "qing_dynasty": ["清", "康熙", "乾隆", "考据", "朴学"],
        }

    def _detect_parallel_prosody(self, text: str) -> Dict[str, Any]:
        """检测骈文特征"""
        sentences = re.split(r"[。！？；\n]", text)
        sentences = [s.strip() for s in sentences if s.strip()]

        parallel_count = 0
        for i in range(len(sentences) - 1):
            s1, s2 = sentences[i], sentences[i + 1]
            if 3 <= len(s1) <= 8 and 3 <= len(s2) <= 8:
                if abs(len(s1) - len(s2)) <= 1:
                    parallel_count += 1

        parallel_ratio = parallel_count / max(1, len(sentences)) if sentences else 0

        return {
            "parallel_count": parallel_count,
            "total_sentences": len(sentences),
            "parallel_ratio": parallel_ratio,
            "is_parallel": parallel_ratio > 0.3
        }

    def _detect_rhythm_pattern(self, text: str) -> Dict[str, Any]:
        """检测诗词格律特征"""
        cleaned_text = re.sub(r"[，。！？；、\s]", "", text)
        total_chars = len(cleaned_text)

        patterns = {
            "five_char": 0,
            "seven_char": 0,
            "four_char": 0,
            "six_char": 0,
            "other": 0,
        }

        sentences = re.split(r"[。！？；\n]", text)
        for s in sentences:
            s = re.sub(r"[，、\s]", "", s).strip()
            if len(s) == 5:
                patterns["five_char"] += 1
            elif len(s) == 7:
                patterns["seven_char"] += 1
            elif len(s) == 4:
                patterns["four_char"] += 1
            elif len(s) == 6:
                patterns["six_char"] += 1
            elif len(s) > 0:
                patterns["other"] += 1

        total_patterns = sum(patterns.values())
        if total_patterns > 0:
            for k in patterns:
                patterns[k] = patterns[k] / total_patterns

        return {
            "patterns": patterns,
            "total_chars": total_chars,
            "dominant_pattern": max(patterns, key=patterns.get) if total_patterns > 0 else "none"
        }

    def _detect_rhyme_scheme(self, text: str) -> Dict[str, Any]:
        """检测押韵特征"""
        rhyme_chars = []
        sentences = re.split(r"[。！？\n]", text)

        for s in sentences:
            s = s.strip()
            if s and s[-1] not in "，。！？；、":
                rhyme_chars.append(s[-1])

        rhyme_freq = {}
        for char in rhyme_chars:
            rhyme_freq[char] = rhyme_freq.get(char, 0) + 1

        rhyming_pairs = sum(1 for count in rhyme_freq.values() if count >= 2)

        return {
            "total_sentences": len(sentences),
            "rhyme_chars": len(rhyme_chars),
            "rhyming_pairs": rhyming_pairs,
            "unique_rhymes": len(rhyme_freq),
            "rhyme_density": rhyming_pairs / max(1, len(rhyme_chars)) if rhyme_chars else 0
        }

    def _analyze_sentence_length(self, text: str) -> Dict[str, Any]:
        """分析句子长度分布"""
        sentences = re.split(r"[。！？；\n]", text)
        sentences = [len(re.sub(r"[，、\s]", "", s)) for s in sentences if s.strip()]

        if not sentences:
            return {"avg_length": 0, "variance": 0, "distribution": {}}

        avg_length = sum(sentences) / len(sentences)
        variance = sum((x - avg_length) ** 2 for x in sentences) / len(sentences)

        distribution = {
            "short_1_4": sum(1 for l in sentences if 1 <= l <= 4),
            "medium_5_8": sum(1 for l in sentences if 5 <= l <= 8),
            "long_9_15": sum(1 for l in sentences if 9 <= l <= 15),
            "very_long_16plus": sum(1 for l in sentences if l >= 16),
        }

        for k in distribution:
            distribution[k] = distribution[k] / len(sentences)

        return {
            "avg_length": avg_length,
            "variance": variance,
            "std_dev": variance ** 0.5,
            "distribution": distribution,
            "min_length": min(sentences),
            "max_length": max(sentences)
        }

    def _analyze_function_words(self, text: str) -> Dict[str, Any]:
        """分析虚词使用频率"""
        word_counts = {}
        total_chars = len(re.sub(r"[，。！？；、\s]", "", text))

        for category, words in self.function_words.items():
            count = 0
            for word in words:
                count += text.count(word)
            word_counts[category] = count

        for k in word_counts:
            word_counts[k] = word_counts[k] / max(1, total_chars)

        dominant_category = max(word_counts, key=word_counts.get) if word_counts else "none"

        return {
            "frequency": word_counts,
            "dominant_category": dominant_category,
            "total_chars": total_chars
        }

    def _detect_literary_quotations(self, text: str) -> Dict[str, Any]:
        """检测文学用典"""
        quotations = []
        indicators = []

        for era, keywords in self.era_indicators.items():
            for keyword in keywords:
                if keyword in text:
                    quotations.append(keyword)
                    indicators.append(era)

        return {
            "quotation_count": len(quotations),
            "quotations": quotations,
            "era_indicators": list(set(indicators))
        }

    def extract_features(self, text: str) -> Dict[str, Any]:
        """
        提取所有文体特征

        Args:
            text: 输入文本

        Returns:
            特征字典
        """
        features = {}
        for name, extractor in self.feature_patterns.items():
            try:
                features[name] = extractor(text)
            except Exception as e:
                print(f"提取特征 {name} 失败: {e}")
                features[name] = {}

        return features


class AncientTextClassifier:
    """古籍文体分类器"""

    def __init__(self, use_ai: bool = False, ai_client: Optional[Any] = None):
        """
        初始化分类器

        Args:
            use_ai: 是否使用AI辅助分类
            ai_client: AI模型客户端
        """
        self.use_ai = use_ai
        self.ai_client = ai_client
        self.feature_extractor = StyleFeatureExtractor()

        self.style_definitions = {
            "四言诗": {
                "description": "四字一句的诗歌形式，盛行于先秦",
                "features": ["four_char", "rhyme_scheme", "short_sentences"],
                "examples": ["诗经", "乐府"],
                "weight": 0.8
            },
            "五言诗": {
                "description": "五字一句的诗歌形式，盛行于汉魏",
                "features": ["five_char", "rhyme_scheme", "parallelism"],
                "examples": ["古诗十九首", "建安文学"],
                "weight": 0.85
            },
            "七言诗": {
                "description": "七字一句的诗歌形式，盛行于唐代",
                "features": ["seven_char", "rhyme_scheme", "parallelism"],
                "examples": ["唐诗", "近体诗"],
                "weight": 0.85
            },
            "词": {
                "description": "长短句配合音乐的文学形式，盛行于宋代",
                "features": ["mixed_length", "rhyme_scheme", "tune_patterns"],
                "examples": ["宋词", "曲子词"],
                "weight": 0.8
            },
            "赋": {
                "description": "铺陈辞藻的韵文形式，盛行于汉代",
                "features": ["parallel_prosody", "descriptive", "rhythm"],
                "examples": ["汉赋", "骈赋"],
                "weight": 0.75
            },
            "骈文": {
                "description": "对偶工整的文体形式，盛行于六朝",
                "features": ["parallel_prosody", "four_six_pattern", "ornate"],
                "examples": ["六朝骈文", "四六文"],
                "weight": 0.8
            },
            "散文": {
                "description": "不拘格律的散体文",
                "features": ["mixed_length", "no_rhyme", "function_words"],
                "examples": ["古文运动", "唐宋八大家"],
                "weight": 0.7
            },
            "史传": {
                "description": "历史传记类文体",
                "features": ["narrative", "chronological", "proper_names"],
                "examples": ["史记", "资治通鉴"],
                "weight": 0.75
            },
            "论说": {
                "description": "议论说理类文体",
                "features": ["argumentative", "logical", "function_words"],
                "examples": ["诸子散文", "论说文"],
                "weight": 0.75
            },
            "笔记": {
                "description": "随笔记录类文体",
                "features": ["short_sections", "anecdotal", "informal"],
                "examples": ["世说新语", "梦溪笔谈"],
                "weight": 0.7
            },
            "小说": {
                "description": "叙事虚构类文体",
                "features": ["plot", "characters", "dialogue"],
                "examples": ["传奇", "话本"],
                "weight": 0.7
            },
            "戏曲": {
                "description": "舞台表演的文学形式",
                "features": ["dialogue", "songs", "stage_directions"],
                "examples": ["元曲", "杂剧"],
                "weight": 0.75
            },
        }

        self.genre_definitions = {
            "经部": ["易", "书", "诗", "礼", "春秋", "论语", "孟子", "大学", "中庸"],
            "史部": ["史记", "汉书", "后汉书", "三国志", "资治通鉴", "通鉴"],
            "子部": ["诸子", "儒家", "道家", "法家", "墨家", "兵家", "农家"],
            "集部": ["文集", "诗集", "词集", "曲集", "赋集", "骈文"],
            "哲学": ["道", "理", "心", "性", "太极", "阴阳", "五行"],
            "历史": ["帝", "王", "侯", "将", "相", "列传", "世家", "本纪"],
            "文学": ["诗", "词", "赋", "曲", "文", "小说", "传奇"],
            "政治": ["治国", "为政", "君臣", "民本", "仁政", "法治"],
            "军事": ["兵", "战", "攻", "守", "谋", "略", "阵"],
            "经济": ["农", "商", "税", "赋", "币", "财"],
            "文化": ["礼", "乐", "祭", "祀", "婚", "丧", "冠"],
        }

        self.era_definitions = {
            "先秦": {
                "keywords": ["诗经", "尚书", "礼记", "周易", "春秋", "论语", "孟子", "荀子", "老子", "庄子"],
                "start_year": -221,
                "end_year": -221,
                "weight": 0.9
            },
            "汉代": {
                "keywords": ["汉", "西汉", "东汉", "史记", "汉书", "赋", "乐府", "建安"],
                "start_year": -206,
                "end_year": 220,
                "weight": 0.85
            },
            "魏晋南北朝": {
                "keywords": ["魏", "晋", "南朝", "北朝", "建安", "正始", "竹林", "骈文", "世说"],
                "start_year": 220,
                "end_year": 589,
                "weight": 0.85
            },
            "唐代": {
                "keywords": ["唐", "贞观", "开元", "天宝", "唐诗", "近体诗", "古文运动", "韩愈", "柳宗元"],
                "start_year": 618,
                "end_year": 907,
                "weight": 0.9
            },
            "宋代": {
                "keywords": ["宋", "北宋", "南宋", "宋词", "理学", "程朱", "苏轼", "王安石"],
                "start_year": 960,
                "end_year": 1279,
                "weight": 0.9
            },
            "元代": {
                "keywords": ["元", "元曲", "杂剧", "散曲", "关汉卿", "马致远"],
                "start_year": 1271,
                "end_year": 1368,
                "weight": 0.85
            },
            "明代": {
                "keywords": ["明", "永乐", "万历", "阳明", "心学", "小说", "传奇", "西游记", "三国演义"],
                "start_year": 1368,
                "end_year": 1644,
                "weight": 0.85
            },
            "清代": {
                "keywords": ["清", "康熙", "乾隆", "考据", "朴学", "红楼梦", "儒林外史", "聊斋"],
                "start_year": 1644,
                "end_year": 1912,
                "weight": 0.85
            },
        }

    def classify_style(self, text: str, use_ai: Optional[bool] = None) -> StyleClassification:
        """
        分类文体

        Args:
            text: 输入文本
            use_ai: 是否使用AI（覆盖默认设置）

        Returns:
            文体分类结果
        """
        if not text or not isinstance(text, str):
            return StyleClassification(
                primary_style="unknown",
                primary_confidence=0.0,
                secondary_styles=[],
                style_features={},
                method="empty_input",
                text_length=0
            )

        use_ai = use_ai if use_ai is not None else self.use_ai

        try:
            features = self.feature_extractor.extract_features(text)
            scores = self._calculate_style_scores(text, features)

            sorted_styles = sorted(scores.items(), key=lambda x: x[1], reverse=True)

            primary_style = sorted_styles[0][0] if sorted_styles else "unknown"
            primary_confidence = sorted_styles[0][1] if sorted_styles else 0.0
            secondary_styles = [(s, c) for s, c in sorted_styles[1:4] if c > 0.3]

            return StyleClassification(
                primary_style=primary_style,
                primary_confidence=primary_confidence,
                secondary_styles=secondary_styles,
                style_features=features,
                method="ai_hybrid" if use_ai else "rule_based",
                text_length=len(text)
            )
        except Exception as e:
            print(f"文体分类失败: {e}")
            return StyleClassification(
                primary_style="unknown",
                primary_confidence=0.0,
                secondary_styles=[],
                style_features={},
                method="failed",
                text_length=len(text) if text else 0
            )

    def _calculate_style_scores(self, text: str, features: Dict[str, Any]) -> Dict[str, float]:
        """计算各文体的得分"""
        scores = {}
        rhythm = features.get("rhythm_pattern", {})
        parallel = features.get("parallel_prosody", {})
        sentence_len = features.get("sentence_length_distribution", {})
        function_words = features.get("function_word_frequency", {})
        rhyme = features.get("rhyme_scheme", {})

        for style, definition in self.style_definitions.items():
            score = 0.0
            weight = definition.get("weight", 0.5)

            if "four_char" in definition["features"]:
                score += rhythm.get("patterns", {}).get("four_char", 0) * 2
            if "five_char" in definition["features"]:
                score += rhythm.get("patterns", {}).get("five_char", 0) * 2
            if "seven_char" in definition["features"]:
                score += rhythm.get("patterns", {}).get("seven_char", 0) * 2
            if "parallel_prosody" in definition["features"]:
                score += parallel.get("parallel_ratio", 0) * 1.5
            if "rhyme_scheme" in definition["features"]:
                score += rhyme.get("rhyme_density", 0) * 1.5
            if "short_sentences" in definition["features"]:
                score += sentence_len.get("distribution", {}).get("short_1_4", 0)

            freq = function_words.get("frequency", {})
            if "poetic" in definition["features"]:
                score += freq.get("poetic", 0)
            if "narrative" in definition["features"]:
                score += freq.get("narrative", 0)
            if "argumentative" in definition["features"]:
                score += freq.get("argumentative", 0)
            if "function_words" in definition["features"]:
                score += freq.get("classical", 0) * 0.5

            scores[style] = min(score * weight, 1.0)

        return scores

    def classify_genre(self, text: str) -> GenreClassification:
        """
        分类题材

        Args:
            text: 输入文本

        Returns:
            题材分类结果
        """
        if not text or not isinstance(text, str):
            return GenreClassification(
                primary_genre="unknown",
                primary_confidence=0.0,
                secondary_genres=[],
                genre_keywords=[],
                method="empty_input"
            )

        try:
            genre_scores = {}
            found_keywords = []

            for genre, keywords in self.genre_definitions.items():
                score = 0.0
                for keyword in keywords:
                    count = text.count(keyword)
                    if count > 0:
                        score += count
                        found_keywords.append(keyword)
                genre_scores[genre] = score

            sorted_genres = sorted(genre_scores.items(), key=lambda x: x[1], reverse=True)
            total_score = sum(genre_scores.values())

            if total_score > 0:
                primary_genre = sorted_genres[0][0]
                primary_confidence = sorted_genres[0][1] / total_score
                secondary_genres = [
                    (g, s / total_score)
                    for g, s in sorted_genres[1:3]
                    if s / total_score > 0.1
                ]
            else:
                primary_genre = "unknown"
                primary_confidence = 0.0
                secondary_genres = []

            return GenreClassification(
                primary_genre=primary_genre,
                primary_confidence=primary_confidence,
                secondary_genres=secondary_genres,
                genre_keywords=list(set(found_keywords)),
                method="keyword_based"
            )
        except Exception as e:
            print(f"题材分类失败: {e}")
            return GenreClassification(
                primary_genre="unknown",
                primary_confidence=0.0,
                secondary_genres=[],
                genre_keywords=[],
                method="failed"
            )

    def classify_era(self, text: str) -> LiteraryEra:
        """
        判断文学时代

        Args:
            text: 输入文本

        Returns:
            文学时代判断结果
        """
        if not text or not isinstance(text, str):
            return LiteraryEra(
                era="unknown",
                confidence=0.0,
                era_features={},
                key_indicators=[]
            )

        try:
            era_scores = {}
            indicators = []

            for era, definition in self.era_definitions.items():
                score = 0.0
                for keyword in definition["keywords"]:
                    count = text.count(keyword)
                    if count > 0:
                        score += count * definition.get("weight", 0.5)
                        indicators.append(keyword)
                era_scores[era] = score

            sorted_eras = sorted(era_scores.items(), key=lambda x: x[1], reverse=True)
            total_score = sum(era_scores.values())

            if total_score > 0:
                era = sorted_eras[0][0]
                confidence = sorted_eras[0][1] / total_score
            else:
                era = "unknown"
                confidence = 0.0

            return LiteraryEra(
                era=era,
                confidence=confidence,
                era_features={
                    "scores": era_scores,
                    "sorted_eras": sorted_eras[:3]
                },
                key_indicators=list(set(indicators))
            )
        except Exception as e:
            print(f"时代判断失败: {e}")
            return LiteraryEra(
                era="unknown",
                confidence=0.0,
                era_features={},
                key_indicators=[]
            )

    def classify_text(self, text: str, use_ai: Optional[bool] = None) -> Dict[str, Any]:
        """
        综合分类（文体+题材+时代）

        Args:
            text: 输入文本
            use_ai: 是否使用AI

        Returns:
            综合分类结果
        """
        style_result = self.classify_style(text, use_ai)
        genre_result = self.classify_genre(text)
        era_result = self.classify_era(text)

        return {
            "style": style_result,
            "genre": genre_result,
            "era": era_result,
            "text_length": len(text) if text else 0
        }

    def generate_classification_report(self, classification: Dict[str, Any]) -> str:
        """
        生成分类报告

        Args:
            classification: 分类结果

        Returns:
            报告文本
        """
        style: StyleClassification = classification.get("style")
        genre: GenreClassification = classification.get("genre")
        era: LiteraryEra = classification.get("era")

        report = "=" * 60 + "\n"
        report += "【古籍篇目文体分类报告】\n"
        report += "=" * 60 + "\n\n"

        report += f"文本长度: {classification.get('text_length', 0)}字\n\n"

        if style:
            report += "【文体分类】\n"
            report += f"  主文体: {style.primary_style}\n"
            report += f"  置信度: {style.primary_confidence * 100:.1f}%\n"
            if style.secondary_styles:
                report += "  次文体:\n"
                for s, c in style.secondary_styles:
                    report += f"    {s}: {c * 100:.1f}%\n"
            report += f"  分类方法: {style.method}\n\n"

        if genre:
            report += "【题材分类】\n"
            report += f"  主题材: {genre.primary_genre}\n"
            report += f"  置信度: {genre.primary_confidence * 100:.1f}%\n"
            if genre.secondary_genres:
                report += "  次题材:\n"
                for g, c in genre.secondary_genres:
                    report += f"    {g}: {c * 100:.1f}%\n"
            if genre.genre_keywords:
                report += f"  关键词: {', '.join(genre.genre_keywords[:10])}\n"
            report += f"  分类方法: {genre.method}\n\n"

        if era:
            report += "【时代判断】\n"
            report += f"  文学时代: {era.era}\n"
            report += f"  置信度: {era.confidence * 100:.1f}%\n"
            if era.key_indicators:
                report += f"  关键指标: {', '.join(era.key_indicators[:10])}\n"

        return report

    def list_supported_styles(self) -> List[Dict[str, Any]]:
        """列出支持的文体类型"""
        return [
            {
                "name": name,
                "description": info["description"],
                "examples": info["examples"]
            }
            for name, info in self.style_definitions.items()
        ]

    def list_supported_genres(self) -> List[str]:
        """列出支持的题材类型"""
        return list(self.genre_definitions.keys())

    def list_supported_eras(self) -> List[str]:
        """列出支持的文学时代"""
        return list(self.era_definitions.keys())
