#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
古籍方言用字专项勘校模块 - Dialect Character Processor
专门处理古籍中的方言用字、地域用字、俗体字
"""

import json
import os
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field

from .dictionary_loader import DictionaryLoader
from ..ai_inference.model_client import AncientTextModelClient
from ..ai_inference.prompt_templates import PromptTemplates


@dataclass
class DialectCharacter:
    """方言字数据结构"""
    original_char: str
    standard_char: str
    dialect_region: str
    dialect_type: str
    usage_examples: List[str] = field(default_factory=list)
    historical_notes: str = ""
    confidence: float = 0.0
    source: str = ""


@dataclass
class DialectProcessingResult:
    """方言处理结果"""
    original_text: str
    processed_text: str
    dialect_chars: List[DialectCharacter]
    regional_distribution: Dict[str, int]
    method: str
    statistics: Dict[str, Any] = field(default_factory=dict)


class DialectProcessor:
    """古籍方言用字处理器"""

    def __init__(self, dictionary_loader: Optional[DictionaryLoader] = None,
                 use_ai: bool = False,
                 ai_client: Optional[AncientTextModelClient] = None,
                 dialect_data_dir: Optional[str] = None):
        """
        初始化方言处理器

        Args:
            dictionary_loader: 字库加载器
            use_ai: 是否使用AI辅助识别
            ai_client: AI模型客户端
            dialect_data_dir: 方言数据目录
        """
        self.dict_loader = dictionary_loader or DictionaryLoader()
        self.use_ai = use_ai
        self.ai_client = ai_client or AncientTextModelClient()

        if dialect_data_dir is None:
            dialect_data_dir = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "dictionary",
                "dialect"
            )
        self.dialect_data_dir = dialect_data_dir

        self.dialect_mapping = self._load_dialect_mapping()
        self.regional_chars = self._load_regional_characters()
        self.dialect_patterns = self._compile_dialect_patterns()

        self.dialect_regions = {
            "wuyue": "吴越方言",
            "minnan": "闽南语",
            "yue": "粤语",
            "chu": "楚语",
            "shu": "蜀语",
            "guanzhong": "关中语",
            "zhongyuan": "中原语",
            "shandong": "山东语",
            "hebei": "河北语",
            "shanxi": "山西语",
            "hunan": "湖南语",
            "jiangxi": "江西语",
            "kejia": "客家语",
            "chaoshan": "潮汕语",
            "fujian": "福建语",
        }

    def _load_dialect_mapping(self) -> Dict[str, Dict[str, Any]]:
        """加载方言字映射表"""
        mapping_file = os.path.join(self.dialect_data_dir, "dialect_mapping.json")
        if os.path.exists(mapping_file):
            try:
                with open(mapping_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"加载方言映射表失败: {e}")
        return self._get_default_dialect_mapping()

    def _get_default_dialect_mapping(self) -> Dict[str, Dict[str, Any]]:
        """获取默认方言映射表"""
        return {
            "方言字映射": {
                "吳": {"standard": "吴", "region": "wuyue", "type": "地域用字"},
                "越": {"standard": "越", "region": "wuyue", "type": "地域用字"},
                "閩": {"standard": "闽", "region": "minnan", "type": "地域用字"},
                "粵": {"standard": "粤", "region": "yue", "type": "地域用字"},
                "楚": {"standard": "楚", "region": "chu", "type": "地域用字"},
                "蜀": {"standard": "蜀", "region": "shu", "type": "地域用字"},
                "隴": {"standard": "陇", "region": "guanzhong", "type": "地域用字"},
                "豫": {"standard": "豫", "region": "zhongyuan", "type": "地域用字"},
                "魯": {"standard": "鲁", "region": "shandong", "type": "地域用字"},
                "齊": {"standard": "齐", "region": "shandong", "type": "地域用字"},
                "燕": {"standard": "燕", "region": "hebei", "type": "地域用字"},
                "晉": {"standard": "晋", "region": "shanxi", "type": "地域用字"},
                "湘": {"standard": "湘", "region": "hunan", "type": "地域用字"},
                "贛": {"standard": "赣", "region": "jiangxi", "type": "地域用字"},
                "客": {"standard": "客", "region": "kejia", "type": "地域用字"},
                "潮": {"standard": "潮", "region": "chaoshan", "type": "地域用字"},
                "甌": {"standard": "瓯", "region": "wuyue", "type": "地域用字"},
                "歙": {"standard": "歙", "region": "wuyue", "type": "地域用字"},
                "婺": {"standard": "婺", "region": "wuyue", "type": "地域用字"},
                "衢": {"standard": "衢", "region": "wuyue", "type": "地域用字"},
                "溫": {"standard": "温", "region": "wuyue", "type": "地域用字"},
                "台": {"standard": "台", "region": "wuyue", "type": "地域用字"},
                "福": {"standard": "福", "region": "fujian", "type": "地域用字"},
                "漳": {"standard": "漳", "region": "minnan", "type": "地域用字"},
                "泉": {"standard": "泉", "region": "minnan", "type": "地域用字"},
                "廈": {"standard": "厦", "region": "minnan", "type": "地域用字"},
                "廣": {"standard": "广", "region": "yue", "type": "地域用字"},
                "穗": {"standard": "穗", "region": "yue", "type": "地域用字"},
                "莞": {"standard": "莞", "region": "yue", "type": "地域用字"},
                "澳": {"standard": "澳", "region": "yue", "type": "地域用字"},
                "港": {"standard": "港", "region": "yue", "type": "地域用字"},
            }
        }

    def _load_regional_characters(self) -> Dict[str, List[str]]:
        """加载地域用字列表"""
        return {
            "wuyue": ["吳", "越", "甌", "歙", "婺", "衢", "溫", "台", "杭", "甬", "紹", "寧"],
            "minnan": ["閩", "漳", "泉", "廈", "福", "莆", "仙", "龍", "巖"],
            "yue": ["粵", "廣", "穗", "莞", "澳", "港", "珠", "深", "佛"],
            "chu": ["楚", "鄂", "湘", "郢", "荊", "襄", "衡", "郴"],
            "shu": ["蜀", "巴", "渝", "蓉", "錦", "劍", "閬", "夔"],
            "guanzhong": ["隴", "秦", "咸", "潼", "渭", "涇", "霸", "滻"],
            "zhongyuan": ["豫", "洛", "汴", "鄴", "許", "汝", "潁", "蔡"],
            "shandong": ["魯", "齊", "淄", "博", "青", "兗", "濟", "泰"],
            "hebei": ["燕", "趙", "邯", "鄴", "薊", "涿", "滄", "瀛"],
            "shanxi": ["晉", "汾", "絳", "蒲", "晉", "代", "朔", "雲"],
            "hunan": ["湘", "衡", "郴", "潭", "岳", "澧", "朗", "永"],
            "jiangxi": ["贛", "洪", "饒", "信", "撫", "吉", "袁", "虔"],
            "kejia": ["客", "嘉", "應", "惠", "循", "梅", "汀", "贛"],
            "chaoshan": ["潮", "汕", "揭", "饒", "澄", "潮", "普", "惠"],
            "fujian": ["福", "建", "泉", "漳", "汀", "邵", "興", "延"],
        }

    def _compile_dialect_patterns(self) -> Dict[str, Any]:
        """编译方言识别模式"""
        return {
            "地域后缀": ["人", "氏", "語", "音", "腔", "調", "言", "話"],
            "方言特征词": {
                "wuyue": ["儂", "阿拉", "伲", "吾", "唔", "佢", "係", "嘅", "咁", "哋"],
                "minnan": ["阮", "恁", "伊", "佮", "莫", "免", "敢", "會", "欲", "卜"],
                "yue": ["嘅", "咗", "喺", "嚟", "嘅", "哋", "乜", "點", "邊", "邊個"],
                "chu": ["些", "個", "麼", "呢", "嗎", "哩", "羅", "唦", "啵", "耶"],
                "shu": ["噻", "嗦", "哈", "啥", "咋", "哦", "咧", "嘛", "哩", "啰"],
            },
            "方言助词": {
                "wuyue": ["哉", "個", "呀", "哦", "喏", "嘜", "嗄", "嘅"],
                "minnan": ["啊", "啦", "咧", "喔", "嘍", "唷", "嘿", "喏"],
                "yue": ["㗎", "囉", "喎", "嘅", "嘞", "咩", "嗻", "嘛"],
                "zhongyuan": ["哩", "也", "呵", "呀", "哇", "哪", "呢", "吧"],
            },
        }

    def process_text(self, text: str, use_ai: Optional[bool] = None,
                     target_regions: Optional[List[str]] = None) -> DialectProcessingResult:
        """
        处理文本中的方言用字

        Args:
            text: 待处理文本
            use_ai: 是否使用AI（覆盖默认设置）
            target_regions: 目标方言区域列表，为空则处理所有区域

        Returns:
            方言处理结果
        """
        if not text or not isinstance(text, str):
            return DialectProcessingResult(
                original_text=text or "",
                processed_text=text or "",
                dialect_chars=[],
                regional_distribution={},
                method="empty_input"
            )

        use_ai = use_ai if use_ai is not None else self.use_ai

        try:
            dialect_chars = self._rule_based_dialect_detection(text, target_regions)

            if use_ai:
                try:
                    ai_dialects = self._ai_based_dialect_detection(text)
                    dialect_chars = self._merge_dialect_results(dialect_chars, ai_dialects)
                except Exception as e:
                    print(f"AI方言识别失败，使用规则结果: {e}")

            processed_text = self._apply_dialect_conversion(text, dialect_chars)
            regional_distribution = self._analyze_regional_distribution(dialect_chars)

            result = DialectProcessingResult(
                original_text=text,
                processed_text=processed_text,
                dialect_chars=dialect_chars,
                regional_distribution=regional_distribution,
                method="ai_hybrid" if use_ai else "rule_based"
            )

            result.statistics = self._get_statistics(result)
            return result

        except Exception as e:
            print(f"方言处理失败: {e}")
            return DialectProcessingResult(
                original_text=text,
                processed_text=text,
                dialect_chars=[],
                regional_distribution={},
                method="failed",
                statistics={"error": str(e)}
            )

    def _rule_based_dialect_detection(self, text: str,
                                       target_regions: Optional[List[str]]) -> List[DialectCharacter]:
        """基于规则的方言字检测"""
        dialect_chars = []
        detected_positions = set()

        for char in text:
            if char in detected_positions:
                continue

            if char in self.dialect_mapping.get("方言字映射", {}):
                dialect_info = self.dialect_mapping["方言字映射"][char]

                if target_regions and dialect_info.get("region") not in target_regions:
                    continue

                positions = [i for i, c in enumerate(text) if c == char]
                for pos in positions[:3]:
                    dialect_char = DialectCharacter(
                        original_char=char,
                        standard_char=dialect_info.get("standard", char),
                        dialect_region=dialect_info.get("region", ""),
                        dialect_type=dialect_info.get("type", "方言用字"),
                        usage_examples=dialect_info.get("examples", []),
                        historical_notes=dialect_info.get("notes", ""),
                        confidence=0.8,
                        source="方言映射表"
                    )
                    dialect_chars.append(dialect_char)
                    detected_positions.add(pos)

        for region, chars in self.regional_chars.items():
            if target_regions and region not in target_regions:
                continue

            for char in chars:
                if char in text and char not in [c.original_char for c in dialect_chars]:
                    positions = [i for i, c in enumerate(text) if c == char]
                    for pos in positions[:2]:
                        if pos not in detected_positions:
                            dialect_char = DialectCharacter(
                                original_char=char,
                                standard_char=char,
                                dialect_region=region,
                                dialect_type="地域用字",
                                confidence=0.6,
                                source="地域用字库"
                            )
                            dialect_chars.append(dialect_char)
                            detected_positions.add(pos)

        return dialect_chars

    def _ai_based_dialect_detection(self, text: str) -> List[DialectCharacter]:
        """使用AI识别方言用字"""
        prompt = PromptTemplates.get_dialect_detection_prompt(text)
        system_prompt = PromptTemplates.get_system_prompt()

        result = self.ai_client.infer(
            prompt=prompt,
            task_type="dialect_detection",
            system_prompt=system_prompt
        )

        if not result.success:
            print(f"AI方言识别失败: {result.error}")
            return []

        return self._parse_ai_dialect_result(result.content, text)

    def _parse_ai_dialect_result(self, ai_content: str, original_text: str) -> List[DialectCharacter]:
        """解析AI返回的方言识别结果"""
        dialect_chars = []

        lines = ai_content.strip().split("\n")
        current_char = None
        current_info = {}

        for line in lines:
            line = line.strip()

            if line.startswith("【") and "】" in line:
                if current_char and current_info:
                    positions = [i for i, c in enumerate(original_text) if c == current_char]
                    for pos in positions[:1]:
                        dialect_char = DialectCharacter(
                            original_char=current_char,
                            standard_char=current_info.get("standard", current_char),
                            dialect_region=current_info.get("region", ""),
                            dialect_type=current_info.get("type", "方言用字"),
                            usage_examples=current_info.get("examples", []),
                            historical_notes=current_info.get("notes", ""),
                            confidence=0.75,
                            source="AI识别"
                        )
                        dialect_chars.append(dialect_char)

                char_end = line.find("】")
                current_char = line[1:char_end]
                current_info = {}
            elif current_char and "：" in line:
                key, value = line.split("：", 1)
                key = key.strip()
                value = value.strip()

                if key in ["标准字", "对应字"]:
                    current_info["standard"] = value
                elif key in ["地区", "方言区"]:
                    current_info["region"] = value
                elif key in ["类型", "类别"]:
                    current_info["type"] = value
                elif key in ["例", "用例", "示例"]:
                    current_info["examples"] = [v.strip() for v in value.split("、")]
                elif key in ["注", "注释", "说明"]:
                    current_info["notes"] = value

        if current_char and current_info:
            positions = [i for i, c in enumerate(original_text) if c == current_char]
            for pos in positions[:1]:
                dialect_char = DialectCharacter(
                    original_char=current_char,
                    standard_char=current_info.get("standard", current_char),
                    dialect_region=current_info.get("region", ""),
                    dialect_type=current_info.get("type", "方言用字"),
                    usage_examples=current_info.get("examples", []),
                    historical_notes=current_info.get("notes", ""),
                    confidence=0.75,
                    source="AI识别"
                )
                dialect_chars.append(dialect_char)

        return dialect_chars

    def _merge_dialect_results(self, rule_chars: List[DialectCharacter],
                               ai_chars: List[DialectCharacter]) -> List[DialectCharacter]:
        """合并规则和AI的方言识别结果"""
        merged = {}

        for dc in rule_chars:
            key = (dc.original_char, dc.dialect_region)
            merged[key] = dc

        for dc in ai_chars:
            key = (dc.original_char, dc.dialect_region)
            if key in merged:
                existing = merged[key]
                if dc.confidence > existing.confidence:
                    merged[key] = dc
                else:
                    if dc.historical_notes and not existing.historical_notes:
                        existing.historical_notes = dc.historical_notes
                    if dc.usage_examples and not existing.usage_examples:
                        existing.usage_examples = dc.usage_examples
            else:
                merged[key] = dc

        return sorted(merged.values(), key=lambda x: (x.dialect_region, x.original_char))

    def _apply_dialect_conversion(self, text: str, dialect_chars: List[DialectCharacter]) -> str:
        """应用方言字转换"""
        if not dialect_chars:
            return text

        chars = list(text)
        conversion_map = {}

        for dc in dialect_chars:
            if dc.standard_char and dc.standard_char != dc.original_char:
                conversion_map[dc.original_char] = dc.standard_char

        for i, char in enumerate(chars):
            if char in conversion_map:
                chars[i] = conversion_map[char]

        return "".join(chars)

    def _analyze_regional_distribution(self, dialect_chars: List[DialectCharacter]) -> Dict[str, int]:
        """分析方言区域分布"""
        distribution = {}

        for dc in dialect_chars:
            region = dc.dialect_region or "unknown"
            distribution[region] = distribution.get(region, 0) + 1

        return dict(sorted(distribution.items(), key=lambda x: x[1], reverse=True))

    def _get_statistics(self, result: DialectProcessingResult) -> Dict[str, Any]:
        """获取统计信息"""
        try:
            regions = set(dc.dialect_region for dc in result.dialect_chars if dc.dialect_region)
            types = set(dc.dialect_type for dc in result.dialect_chars if dc.dialect_type)

            return {
                "total_dialect_chars": len(result.dialect_chars),
                "unique_chars": len(set(dc.original_char for dc in result.dialect_chars)),
                "regions_involved": len(regions),
                "region_list": list(regions),
                "types_involved": len(types),
                "type_list": list(types),
                "regional_distribution": result.regional_distribution,
                "original_length": len(result.original_text),
                "processed_length": len(result.processed_text),
            }
        except Exception as e:
            return {"error": str(e)}

    def get_dialect_region_info(self, region_code: str) -> Dict[str, Any]:
        """
        获取方言区域信息

        Args:
            region_code: 区域代码

        Returns:
            区域信息字典
        """
        region_name = self.dialect_regions.get(region_code, "未知区域")
        chars = self.regional_chars.get(region_code, [])

        return {
            "code": region_code,
            "name": region_name,
            "character_count": len(chars),
            "example_chars": chars[:10],
            "all_chars": chars,
        }

    def list_all_regions(self) -> List[Dict[str, Any]]:
        """列出所有支持的方言区域"""
        return [
            self.get_dialect_region_info(code)
            for code in self.dialect_regions.keys()
        ]

    def generate_dialect_report(self, result: DialectProcessingResult) -> str:
        """
        生成方言分析报告

        Args:
            result: 方言处理结果

        Returns:
            报告文本
        """
        report = "【古籍方言用字分析报告】\n\n"
        report += f"处理方法: {result.method}\n"
        report += f"发现方言用字: {len(result.dialect_chars)}个\n\n"

        if result.regional_distribution:
            report += "【区域分布】\n"
            for region, count in result.regional_distribution.items():
                region_name = self.dialect_regions.get(region, region)
                report += f"  {region_name} ({region}): {count}个\n"
            report += "\n"

        if result.dialect_chars:
            report += "【详细标注】\n"
            current_region = None
            for dc in sorted(result.dialect_chars, key=lambda x: (x.dialect_region or "", x.original_char)):
                if dc.dialect_region != current_region:
                    region_name = self.dialect_regions.get(dc.dialect_region, dc.dialect_region or "未知")
                    report += f"\n[{region_name}]\n"
                    current_region = dc.dialect_region

                report += f"  {dc.original_char}"
                if dc.standard_char != dc.original_char:
                    report += f" → {dc.standard_char}"
                report += f"  [{dc.dialect_type}]"
                if dc.historical_notes:
                    report += f"  注: {dc.historical_notes}"
                report += "\n"

        return report

    def batch_process(self, texts: List[str], use_ai: Optional[bool] = None,
                      target_regions: Optional[List[str]] = None) -> List[DialectProcessingResult]:
        """
        批量处理方言用字

        Args:
            texts: 文本列表
            use_ai: 是否使用AI
            target_regions: 目标方言区域

        Returns:
            处理结果列表
        """
        results = []
        for text in texts:
            result = self.process_text(text, use_ai, target_regions)
            results.append(result)
        return results
