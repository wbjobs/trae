import json
import re
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field, asdict
from datetime import datetime

logger = logging.getLogger(__name__)


class TextSanitizer:
    @staticmethod
    def sanitize_for_markdown(text: str, max_length: int = 200) -> str:
        if not text:
            return ""
        text = str(text).strip()
        text = text.replace("|", "\\|")
        text = text.replace("\n", " ")
        text = text.replace("\r", " ")
        text = text.replace("\t", " ")
        text = re.sub(r"\s+", " ", text)
        if max_length and len(text) > max_length:
            text = text[:max_length] + "..."
        return text

    @staticmethod
    def sanitize_for_json(text: str) -> str:
        if not text:
            return ""
        text = str(text)
        text = text.replace("\x00", "")
        text = re.sub(r"[\x01-\x1f\x7f]", "", text)
        return text

    @staticmethod
    def sanitize_for_excel(text: str) -> str:
        if not text:
            return ""
        text = str(text)
        if len(text) > 32767:
            text = text[:32767]
        if text.startswith(("=", "+", "-", "@")):
            text = "'" + text
        return text

    @staticmethod
    def format_number(value: Any, decimal_places: int = 2) -> str:
        try:
            num = float(value)
            return f"{num:.{decimal_places}f}"
        except (ValueError, TypeError):
            return str(value)

    @staticmethod
    def clean_multiline_text(text: str, max_lines: int = 10) -> str:
        if not text:
            return ""
        lines = text.split("\n")
        lines = [line.strip() for line in lines if line.strip()]
        if len(lines) > max_lines:
            lines = lines[:max_lines]
            lines.append("...")
        return "\n".join(lines)


@dataclass
class StructuredResult:
    document_id: str
    document_name: str
    file_type: str
    file_path: str
    extraction_results: Dict[str, Any] = field(default_factory=dict)
    summary: str = ""
    key_points: List[str] = field(default_factory=list)
    entities: List[Dict[str, Any]] = field(default_factory=list)
    relations: List[Dict[str, Any]] = field(default_factory=list)
    tables: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    confidence: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ResultFormatter:
    @staticmethod
    def format_json(result: StructuredResult, indent: int = 2) -> str:
        sanitizer = TextSanitizer()
        result_dict = result.to_dict()
        cleaned_dict = ResultFormatter._sanitize_dict(result_dict, sanitizer)
        return json.dumps(cleaned_dict, ensure_ascii=False, indent=indent)

    @staticmethod
    def _sanitize_dict(data: Any, sanitizer: TextSanitizer) -> Any:
        if isinstance(data, dict):
            return {k: ResultFormatter._sanitize_dict(v, sanitizer) for k, v in data.items()}
        elif isinstance(data, list):
            return [ResultFormatter._sanitize_dict(item, sanitizer) for item in data]
        elif isinstance(data, str):
            return sanitizer.sanitize_for_json(data)
        else:
            return data

    @staticmethod
    def format_markdown(result: StructuredResult) -> str:
        lines = []
        sanitizer = TextSanitizer()

        lines.append(f"# {sanitizer.sanitize_for_markdown(result.document_name, max_length=100)}")
        lines.append("")
        lines.append(f"- **文件类型**: `{result.file_type}`")
        lines.append(f"- **文件路径**: `{result.file_path}`")
        lines.append(f"- **处理时间**: {result.created_at}")
        lines.append(f"- **置信度**: {result.confidence:.2f}")
        lines.append("")

        if result.summary:
            lines.append("## 📄 文档摘要")
            lines.append("")
            cleaned_summary = sanitizer.clean_multiline_text(result.summary, max_lines=20)
            lines.append(cleaned_summary)
            lines.append("")

        if result.key_points:
            lines.append("## 🎯 核心要点")
            lines.append("")
            for i, point in enumerate(result.key_points, 1):
                cleaned_point = sanitizer.sanitize_for_markdown(point, max_length=300)
                lines.append(f"{i}. {cleaned_point}")
            lines.append("")

        if result.entities:
            lines.append("## 🏷️ 抽取的实体")
            lines.append("")
            entity_groups: Dict[str, List[Dict[str, Any]]] = {}
            for entity in result.entities:
                type_ = entity.get("type", "未分类")
                if type_ not in entity_groups:
                    entity_groups[type_] = []
                entity_groups[type_].append(entity)

            for type_, entities in entity_groups.items():
                lines.append(f"### {type_}")
                lines.append("")
                lines.append("| 实体文本 | 置信度 |")
                lines.append("| --- | --- |")
                for entity in entities:
                    text = sanitizer.sanitize_for_markdown(entity.get("text", ""), max_length=100)
                    conf = entity.get("confidence", 0.0)
                    conf_str = "✅ 高" if conf >= 0.8 else "⚠️ 中" if conf >= 0.5 else "❌ 低"
                    lines.append(f"| {text} | {conf_str} ({conf:.2f}) |")
                lines.append("")

        if result.relations:
            lines.append("## 🔗 实体关系")
            lines.append("")
            lines.append("| 序号 | 主体 | 关系 | 客体 | 置信度 |")
            lines.append("| --- | --- | --- | --- | --- |")
            for i, rel in enumerate(result.relations, 1):
                subj = sanitizer.sanitize_for_markdown(rel.get("subject", ""), max_length=50)
                pred = sanitizer.sanitize_for_markdown(rel.get("predicate", ""), max_length=30)
                obj = sanitizer.sanitize_for_markdown(rel.get("object", ""), max_length=50)
                conf = rel.get("confidence", 0.0)
                lines.append(f"| {i} | {subj} | {pred} | {obj} | {conf:.2f} |")
            lines.append("")

        if result.tables:
            lines.append("## 📊 表格数据")
            lines.append("")
            for i, table in enumerate(result.tables):
                lines.append(f"### 表格 {i + 1}")
                lines.append("")

                table_rows = []
                if "table_markdown" in table:
                    table_rows.append(table["table_markdown"])
                elif "raw_data" in table and table["raw_data"]:
                    raw_data = table["raw_data"]
                    if raw_data:
                        headers = [sanitizer.sanitize_for_markdown(str(h), max_length=30) for h in raw_data[0]]
                        table_rows.append("| " + " | ".join(headers) + " |")
                        table_rows.append("| " + " | ".join(["---"] * len(headers)) + " |")
                        for row in raw_data[1:]:
                            cells = [sanitizer.sanitize_for_markdown(str(c), max_length=50) for c in row]
                            table_rows.append("| " + " | ".join(cells) + " |")
                elif "headers" in table and "data" in table:
                    headers = [sanitizer.sanitize_for_markdown(str(h), max_length=30) for h in table["headers"]]
                    table_rows.append("| " + " | ".join(headers) + " |")
                    table_rows.append("| " + " | ".join(["---"] * len(headers)) + " |")
                    for row in table["data"]:
                        cells = [sanitizer.sanitize_for_markdown(str(c), max_length=50) for c in row]
                        table_rows.append("| " + " | ".join(cells) + " |")

                if table_rows:
                    lines.extend(table_rows)
                else:
                    lines.append("*表格数据为空或格式不支持*")
                lines.append("")

        if result.extraction_results:
            lines.append("## 📋 抽取结果详情")
            lines.append("")
            for task_type, data in result.extraction_results.items():
                lines.append(f"### {task_type}")
                lines.append("")
                try:
                    json_str = json.dumps(data, ensure_ascii=False, indent=2)
                    if len(json_str) > 5000:
                        json_str = json_str[:5000] + "\n... (内容过长已截断)"
                    lines.append("```json")
                    lines.append(json_str)
                    lines.append("```")
                except Exception as e:
                    lines.append(f"*无法序列化JSON: {e}*")
                lines.append("")

        if result.metadata:
            lines.append("## ℹ️ 元数据")
            lines.append("")
            lines.append("| 字段 | 值 |")
            lines.append("| --- | --- |")
            for key, value in result.metadata.items():
                key_str = sanitizer.sanitize_for_markdown(str(key), max_length=30)
                value_str = sanitizer.sanitize_for_markdown(str(value), max_length=100)
                lines.append(f"| {key_str} | {value_str} |")
            lines.append("")

        lines.append("---")
        lines.append("")
        lines.append(f"*生成时间: {datetime.now().isoformat()}*")

        return "\n".join(lines)

    @staticmethod
    def format_excel(result: StructuredResult) -> Dict[str, Any]:
        sanitizer = TextSanitizer()
        excel_data = {}

        doc_info = [
            ["字段", "值"],
            ["文档ID", sanitizer.sanitize_for_excel(result.document_id)],
            ["文档名称", sanitizer.sanitize_for_excel(result.document_name)],
            ["文件类型", sanitizer.sanitize_for_excel(result.file_type)],
            ["文件路径", sanitizer.sanitize_for_excel(result.file_path)],
            ["处理时间", sanitizer.sanitize_for_excel(result.created_at)],
            ["置信度", result.confidence],
        ]
        if result.summary:
            doc_info.append(["文档摘要", sanitizer.sanitize_for_excel(result.summary)])
        excel_data["文档信息"] = doc_info

        if result.entities:
            entity_data = [["实体文本", "实体类型", "置信度", "置信度等级"]]
            for entity in result.entities:
                text = sanitizer.sanitize_for_excel(entity.get("text", ""))
                type_ = sanitizer.sanitize_for_excel(entity.get("type", ""))
                conf = entity.get("confidence", 0.0)
                conf_level = "高" if conf >= 0.8 else "中" if conf >= 0.5 else "低"
                entity_data.append([text, type_, conf, conf_level])
            excel_data["实体抽取"] = entity_data

        if result.relations:
            relation_data = [["序号", "主体", "关系", "客体", "置信度"]]
            for i, rel in enumerate(result.relations, 1):
                relation_data.append([
                    i,
                    sanitizer.sanitize_for_excel(rel.get("subject", "")),
                    sanitizer.sanitize_for_excel(rel.get("predicate", "")),
                    sanitizer.sanitize_for_excel(rel.get("object", "")),
                    rel.get("confidence", 0.0),
                ])
            excel_data["关系抽取"] = relation_data

        if result.tables:
            for i, table in enumerate(result.tables):
                sheet_name = f"表格_{i + 1}"
                table_data = []

                if "raw_data" in table and table["raw_data"]:
                    raw_data = table["raw_data"]
                    if raw_data:
                        for row in raw_data:
                            cleaned_row = [sanitizer.sanitize_for_excel(str(cell)) for cell in row]
                            table_data.append(cleaned_row)
                elif "headers" in table and "data" in table:
                    headers = [sanitizer.sanitize_for_excel(str(h)) for h in table["headers"]]
                    table_data.append(headers)
                    for row in table["data"]:
                        cleaned_row = [sanitizer.sanitize_for_excel(str(cell)) for cell in row]
                        table_data.append(cleaned_row)

                if table_data:
                    excel_data[sheet_name] = table_data

        if result.key_points:
            kp_data = [["序号", "核心要点"]]
            for i, point in enumerate(result.key_points, 1):
                kp_data.append([i, sanitizer.sanitize_for_excel(point)])
            excel_data["核心要点"] = kp_data

        if result.metadata:
            meta_data = [["字段", "值"]]
            for key, value in result.metadata.items():
                meta_data.append([
                    sanitizer.sanitize_for_excel(str(key)),
                    sanitizer.sanitize_for_excel(str(value)),
                ])
            excel_data["元数据"] = meta_data

        return excel_data

    @staticmethod
    def merge_results(results: List[StructuredResult]) -> StructuredResult:
        if not results:
            raise ValueError("No results to merge")

        first = results[0]
        merged = StructuredResult(
            document_id=first.document_id,
            document_name=first.document_name,
            file_type=first.file_type,
            file_path=first.file_path,
            metadata={**first.metadata},
        )

        all_entities = []
        all_relations = []
        all_tables = []
        total_confidence = 0.0

        for result in results:
            all_entities.extend(result.entities)
            all_relations.extend(result.relations)
            all_tables.extend(result.tables)
            total_confidence += result.confidence
            merged.extraction_results.update(result.extraction_results)

            if result.summary and not merged.summary:
                merged.summary = result.summary
            if result.key_points and not merged.key_points:
                merged.key_points = result.key_points

        unique_entities = ResultFormatter._deduplicate_entities(all_entities)
        merged.entities = unique_entities
        merged.relations = all_relations
        merged.tables = all_tables
        merged.confidence = total_confidence / len(results) if results else 0.0

        return merged

    @staticmethod
    def _deduplicate_entities(entities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen = set()
        unique = []
        for entity in entities:
            key = (entity.get("text", ""), entity.get("type", ""))
            if key not in seen:
                seen.add(key)
                unique.append(entity)
        return unique

    @staticmethod
    def validate_result(result: StructuredResult) -> bool:
        required_fields = ["document_id", "document_name", "file_type", "file_path"]
        result_dict = result.to_dict()

        for field in required_fields:
            if not result_dict.get(field):
                logger.warning(f"Missing required field: {field}")
                return False

        return True


class ResultAggregator:
    def __init__(self):
        self.results: List[StructuredResult] = []

    def add_result(self, result: StructuredResult) -> None:
        self.results.append(result)

    def add_results(self, results: List[StructuredResult]) -> None:
        self.results.extend(results)

    def get_all(self) -> List[StructuredResult]:
        return self.results

    def get_by_document_id(self, doc_id: str) -> Optional[StructuredResult]:
        for result in self.results:
            if result.document_id == doc_id:
                return result
        return None

    def get_by_file_type(self, file_type: str) -> List[StructuredResult]:
        return [r for r in self.results if r.file_type == file_type]

    def get_by_confidence(self, min_confidence: float) -> List[StructuredResult]:
        return [r for r in self.results if r.confidence >= min_confidence]

    def to_json_list(self) -> str:
        return json.dumps([r.to_dict() for r in self.results], ensure_ascii=False, indent=2)

    def clear(self) -> None:
        self.results = []

    def __len__(self) -> int:
        return len(self.results)
