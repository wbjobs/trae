"""
勘校结果分层导出模块 - Result Exporter
实现勘校结果的多格式分层导出
"""

import os
import json
import csv
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime

from .formatter import FormattedResult, FormatConfig
from ..character_matching.variant_converter import ConversionResult
from ..character_matching.meaning_matcher import AnnotationResult
from ..text_processing.sentence_splitter import PunctuationResult
from ..text_processing.grammar_checker import GrammarCheckResult


@dataclass
class ExportConfig:
    """导出配置"""
    output_dir: str = "./output_results"
    export_raw: bool = True
    export_formatted: bool = True
    export_annotations: bool = True
    export_statistics: bool = True
    export_variants: bool = True
    export_format: str = "txt"
    include_metadata: bool = True
    separate_files: bool = True
    file_prefix: str = "ancient_text_"
    encoding: str = "utf-8"


@dataclass
class ExportResult:
    """导出结果"""
    success: bool
    file_paths: List[str] = field(default_factory=list)
    error: str = ""
    statistics: Dict[str, Any] = field(default_factory=dict)


class ResultExporter:
    """结果导出器"""

    EXPORT_FORMATS = ["txt", "md", "html", "json", "csv", "xml"]

    def __init__(self, config: Optional[ExportConfig] = None):
        """
        初始化导出器

        Args:
            config: 导出配置
        """
        self.config = config or ExportConfig()
        self._ensure_output_dir()

    def _ensure_output_dir(self) -> None:
        """确保输出目录存在"""
        if not os.path.exists(self.config.output_dir):
            os.makedirs(self.config.output_dir, exist_ok=True)

    def export_all(self,
                    original_text: str,
                    punctuation_result: Optional[PunctuationResult] = None,
                    variant_result: Optional[ConversionResult] = None,
                    annotation_result: Optional[AnnotationResult] = None,
                    grammar_result: Optional[GrammarCheckResult] = None,
                    formatted_result: Optional[FormattedResult] = None,
                    document_name: str = "document",
                    title: str = "") -> ExportResult:
        """
        导出所有处理结果

        Args:
            original_text: 原始文本
            punctuation_result: 断句结果
            variant_result: 异体字转换结果
            annotation_result: 注释结果
            grammar_result: 语法检查结果
            formatted_result: 格式化结果
            document_name: 文档名称
            title: 标题

        Returns:
            导出结果
        """
        export_result = ExportResult(success=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_name = f"{self.config.file_prefix}{document_name}_{timestamp}"

        try:
            if self.config.export_raw:
                raw_file = self._export_raw_text(original_text, base_name, title)
                export_result.file_paths.append(raw_file)

            if variant_result and self.config.export_variants:
                variant_file = self._export_variants(variant_result, base_name)
                export_result.file_paths.append(variant_file)

            if punctuation_result:
                punct_file = self._export_punctuation(punctuation_result, base_name)
                export_result.file_paths.append(punct_file)

            if annotation_result and self.config.export_annotations:
                anno_file = self._export_annotations(annotation_result, base_name)
                export_result.file_paths.append(anno_file)

            if grammar_result:
                grammar_file = self._export_grammar(grammar_result, base_name)
                export_result.file_paths.append(grammar_file)

            if formatted_result and self.config.export_formatted:
                format_file = self._export_formatted(formatted_result, base_name, title)
                export_result.file_paths.append(format_file)

            if self.config.export_statistics:
                stats_file = self._export_statistics(
                    original_text, punctuation_result,
                    variant_result,
                    annotation_result,
                    grammar_result,
                    formatted_result,
                    base_name
                )
                export_result.file_paths.append(stats_file)

            export_result.statistics = {
                "total_files": len(export_result.file_paths),
                "timestamp": timestamp,
                "document_name": document_name
            }

        except Exception as e:
            export_result.success = False
            export_result.error = f"导出失败: {str(e)}"

        return export_result

    def _export_raw_text(self, text: str, base_name: str, title: str = "") -> str:
        """导出原始文本"""
        file_path = os.path.join(self.config.output_dir, f"{base_name}_raw.{self.config.export_format}")

        if self.config.export_format == "txt":
            content = ""
            if title:
                content += f"{title}\n\n"
            content += text
        elif self.config.export_format == "md":
            content = f"# {title}\n\n{text}" if title else text
        elif self.config.export_format == "json":
            content = json.dumps({
                "title": title,
                "content": text,
                "length": len(text)
            }, ensure_ascii=False, indent=2)
        else:
            content = text

        with open(file_path, "w", encoding=self.config.encoding) as f:
            f.write(content)

        print(f"已导出原始文本: {file_path}")
        return file_path

    def _export_variants(self, result: ConversionResult, base_name: str) -> str:
        """导出自体字转换结果"""
        file_path = os.path.join(self.config.output_dir, f"{base_name}_variants.{self.config.export_format}")

        if self.config.export_format == "txt":
            content = "【异体字转换结果】\n\n"
            content += f"转换方法：{result.method}\n"
            content += f"原文长度：{len(result.original_text)} 字\n"
            content += f"发现异体字：{len(result.variants)} 个\n\n"

            if result.variants:
                content += "异体字列表：\n"
                for i, v in enumerate(result.variants, 1):
                    content += f"{i}. 「{v.original_char}」 → 「{v.standard_char}」"
                    content += f"（位置：{v.position}，类型：{v.variant_type}）\n"
                content += "\n"

            content += "转换后文本：\n"
            content += result.converted_text

        elif self.config.export_format == "json":
            content = json.dumps({
                "method": result.method,
                "original_text": result.original_text,
                "converted_text": result.converted_text,
                "variants": [
                    {
                        "original": v.original_char,
                        "standard": v.standard_char,
                        "type": v.variant_type,
                        "position": v.position,
                        "confidence": v.confidence,
                        "source": v.source
                    } for v in result.variants
                ],
                "statistics": result.statistics
            }, ensure_ascii=False, indent=2)

        elif self.config.export_format == "csv":
            content = "序号,原字,标准字,类型,位置,置信度,来源\n"
            for i, v in enumerate(result.variants, 1):
                content += f"{i},{v.original_char},{v.standard_char},{v.variant_type},{v.position},{v.confidence},{v.source}\n"
            content += f"\n转换后文本：\n{result.converted_text}"

        else:
            content = str(result)

        with open(file_path, "w", encoding=self.config.encoding) as f:
            f.write(content)

        print(f"已导出异体字结果: {file_path}")
        return file_path

    def _export_punctuation(self, result: PunctuationResult, base_name: str) -> str:
        """导出断句结果"""
        file_path = os.path.join(self.config.output_dir, f"{base_name}_punctuated.{self.config.export_format}")

        if self.config.export_format == "txt":
            content = "【古籍断句结果】\n\n"
            content += f"断句方法：{result.method}\n"
            content += f"句子数量：{len(result.sentences)} 句\n\n"
            content += "断句后文本：\n"
            content += result.punctuated_text

        elif self.config.export_format == "json":
            content = json.dumps({
                "method": result.method,
                "original_text": result.original_text,
                "punctuated_text": result.punctuated_text,
                "sentences": [
                    {
                        "text": s.text,
                        "start": s.start_pos,
                        "end": s.end_pos,
                        "punctuation": s.punctuation,
                        "is_complete": s.is_complete
                    } for s in result.sentences
                ],
                "confidence": result.confidence
            }, ensure_ascii=False, indent=2)

        else:
            content = result.punctuated_text

        with open(file_path, "w", encoding=self.config.encoding) as f:
            f.write(content)

        print(f"已导出断句结果: {file_path}")
        return file_path

    def _export_annotations(self, result: AnnotationResult, base_name: str) -> str:
        """导出注释结果"""
        file_path = os.path.join(self.config.output_dir, f"{base_name}_annotated.{self.config.export_format}")

        if self.config.export_format == "txt":
            content = "【古籍注释结果】\n\n"
            content += f"注释方法：{result.method}\n"
            content += f"注释数量：{len(result.annotations)} 个\n\n"
            content += "带注释文本：\n"
            content += result.annotated_text
            content += "\n\n"
            content += "词汇表：\n\n"

            unique_chars = {}
            for a in result.annotations:
                if a.char not in unique_chars:
                    unique_chars[a.char] = a

            for char, annotation in sorted(unique_chars.items()):
                content += f"【{char}】"
                if annotation.pinyin:
                    content += f" {annotation.pinyin}"
                content += "\n"
                if annotation.meaning:
                    content += f"  释义：{annotation.meaning}\n"
                if annotation.part_of_speech:
                    content += f"  词性：{annotation.part_of_speech}\n"
                content += "\n"

        elif self.config.export_format == "json":
            content = json.dumps({
                "method": result.method,
                "original_text": result.original_text,
                "annotated_text": result.annotated_text,
                "annotations": [
                    {
                        "char": a.char,
                        "position": a.position,
                        "pinyin": a.pinyin,
                        "meaning": a.meaning,
                        "part_of_speech": a.part_of_speech,
                        "examples": a.examples,
                        "etymology": a.etymology,
                        "confidence": a.confidence,
                        "source": a.source
                    } for a in result.annotations
                ],
                "statistics": result.statistics
            }, ensure_ascii=False, indent=2)

        else:
            content = result.annotated_text

        with open(file_path, "w", encoding=self.config.encoding) as f:
            f.write(content)

        print(f"已导出注释结果: {file_path}")
        return file_path

    def _export_grammar(self, result: GrammarCheckResult, base_name: str) -> str:
        """导出语法检查结果"""
        file_path = os.path.join(self.config.output_dir, f"{base_name}_grammar.{self.config.export_format}")

        if self.config.export_format == "txt":
            content = "【语法检查结果】\n\n"
            content += f"检查方法：{result.method}\n"
            content += f"发现问题：{len(result.issues)} 个\n\n"

            if result.issues:
                content += "问题列表：\n"
                for i, issue in enumerate(result.issues, 1):
                    content += f"{i}. 位置：{issue.position}，类型：{issue.issue_type}\n"
                    content += f"   描述：{issue.description}\n"
                    if issue.original_text:
                        content += f"   原文：「{issue.original_text}」\n"
                    if issue.suggested_text:
                        content += f"   建议：{issue.suggested_text}\n"
                    content += f"   置信度：{issue.confidence:.2f}\n"
                content += "\n"

            content += "校正后文本：\n"
            content += result.corrected_text

        elif self.config.export_format == "json":
            content = json.dumps({
                "method": result.method,
                "original_text": result.original_text,
                "corrected_text": result.corrected_text,
                "issues": [
                    {
                        "position": i.position,
                        "length": i.length,
                        "type": i.issue_type,
                        "description": i.description,
                        "original_text": i.original_text,
                        "suggested_text": i.suggested_text,
                        "confidence": i.confidence,
                        "severity": i.severity
                    } for i in result.issues
                ],
                "statistics": result.statistics
            }, ensure_ascii=False, indent=2)

        else:
            content = result.corrected_text

        with open(file_path, "w", encoding=self.config.encoding) as f:
            f.write(content)

        print(f"已导出语法检查结果: {file_path}")
        return file_path

    def _export_formatted(self, result: FormattedResult, base_name: str, title: str = "") -> str:
        """导出格式化结果"""
        file_path = os.path.join(self.config.output_dir, f"{base_name}_formatted.{self.config.export_format}")

        if self.config.export_format == "txt":
            content = result.formatted_text
        elif self.config.export_format == "md":
            content = f"# {title}\n\n{result.formatted_text}" if title else result.formatted_text
        elif self.config.export_format == "html":
            from .formatter import TextFormatter
            formatter = TextFormatter()
            content = formatter.format_for_web(result.original_text, title)
        elif self.config.export_format == "json":
            content = json.dumps({
                "title": title,
                "formatted_text": result.formatted_text,
                "pages": result.pages,
                "config": {
                    "page_width": result.config.page_width,
                    "use_vertical": result.config.use_vertical,
                    "indent_size": result.config.indent_size
                },
                "statistics": result.statistics
            }, ensure_ascii=False, indent=2)
        else:
            content = result.formatted_text

        with open(file_path, "w", encoding=self.config.encoding) as f:
            f.write(content)

        print(f"已导出格式化结果: {file_path}")
        return file_path

    def _export_statistics(self,
                         original_text: str,
                         punctuation_result: Optional[PunctuationResult],
                         variant_result: Optional[ConversionResult],
                         annotation_result: Optional[AnnotationResult],
                         grammar_result: Optional[GrammarCheckResult],
                         formatted_result: Optional[FormattedResult],
                         base_name: str) -> str:
        """导出统计信息"""
        file_path = os.path.join(self.config.output_dir, f"{base_name}_statistics.{self.config.export_format}")

        stats = {
            "timestamp": datetime.now().isoformat(),
            "original_text": {
                "length": len(original_text),
                "char_count": len(original_text),
                "line_count": len(original_text.splitlines())
            }
        }

        if punctuation_result:
            stats["punctuation"] = {
                "method": punctuation_result.method,
                "sentence_count": len(punctuation_result.sentences),
                "confidence": punctuation_result.confidence
            }

        if variant_result:
            stats["variant_conversion"] = variant_result.statistics

        if annotation_result:
            stats["annotation"] = annotation_result.statistics

        if grammar_result:
            stats["grammar_check"] = grammar_result.statistics

        if formatted_result:
            stats["formatting"] = formatted_result.statistics

        if self.config.export_format == "json":
            content = json.dumps(stats, ensure_ascii=False, indent=2)
        else:
            content = "【处理统计信息】\n\n"
            content += f"处理时间：{stats['timestamp']}\n"
            content += f"原文长度：{stats['original_text']['length']} 字\n\n"

            if "punctuation" in stats:
                content += "断句统计：\n"
                content += f"  方法：{stats['punctuation']['method']}\n"
                content += f"  句子数：{stats['punctuation']['sentence_count']}\n\n"

            if "variant_conversion" in stats:
                content += "异体字转换统计：\n"
                vc = stats["variant_conversion"]
                content += f"  发现异体字：{vc.get('total_variants', 0)} 个\n\n"

            if "annotation" in stats:
                content += "注释统计：\n"
                anno = stats["annotation"]
                content += f"  注释数量：{anno.get('total_annotations', 0)} 个\n"
                content += f"  注释字数：{anno.get('unique_chars', 0)} 个\n\n"

            if "grammar_check" in stats:
                content += "语法检查统计：\n"
                gc = stats["grammar_check"]
                content += f"  发现问题：{gc.get('total_issues', 0)} 个\n"

        with open(file_path, "w", encoding=self.config.encoding) as f:
            f.write(content)

        print(f"已导出统计信息: {file_path}")
        return file_path

    def export_to_format(self, text: str, file_name: str, format_type: str = "txt") -> str:
        """
        按指定格式导出文本"""
        file_path = os.path.join(self.config.output_dir, file_name)

        if format_type == "html":
            from .formatter import TextFormatter
            formatter = TextFormatter()
            content = formatter.format_for_web(text)
        elif format_type == "md":
            from .formatter import TextFormatter
            formatter = TextFormatter()
            content = formatter.format_for_markdown(text)
        else:
            content = text

        with open(file_path, "w", encoding=self.config.encoding) as f:
            f.write(content)

        return file_path

    def get_output_files(self) -> List[str]:
        """获取输出目录中的所有文件"""
        if not os.path.exists(self.config.output_dir):
            return [os.path.join(self.config.output_dir, f) for f in os.listdir(self.config.output_dir)]
        return []

    def clear_output_dir(self) -> None:
        """清空输出目录"""
        if os.path.exists(self.config.output_dir):
            for file in os.listdir(self.config.output_dir):
                file_path = os.path.join(self.config.output_dir, file)
                if os.path.isfile(file_path):
                    os.remove(file_path)
            print("已清空输出目录")
