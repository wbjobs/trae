#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
主程序入口 - Main Entry Point
古籍异体字智能勘校AI应用系统
"""

import os
import sys
import argparse
from typing import Optional, List, Dict, Any

from .config import config
from .text_processing.importer import TextImporter, TextDocument
from .text_processing.sentence_splitter import SentenceSplitter
from .text_processing.grammar_checker import GrammarChecker
from .text_processing.style_classifier import AncientTextClassifier, StyleClassification, GenreClassification, LiteraryEra
from .character_matching.dictionary_loader import DictionaryLoader
from .character_matching.variant_converter import VariantConverter
from .character_matching.meaning_matcher import MeaningMatcher
from .character_matching.dialect_processor import DialectProcessor, DialectProcessingResult, DialectCharacter
from .result_export.formatter import TextFormatter, FormatConfig
from .result_export.exporter import ResultExporter, ExportConfig
from .result_export.review_module import ReviewManager, ReviewSession, ReviewComment, CorrectionRecord
from .ai_inference.lightweight_inference import LightweightInferenceEngine, ModelOptimizationConfig, AcceleratedModelClient


class AncientTextProofreader:
    """古籍异体字智能勘校系统主类"""

    def __init__(self, use_ai: bool = True):
        """
        初始化勘校系统

        Args:
            use_ai: 是否使用AI辅助处理
        """
        self.use_ai = use_ai
        self.dict_loader = DictionaryLoader()
        self.dict_loader.load_all()

        self.importer = TextImporter()
        self.variant_converter = VariantConverter(
            dictionary_loader=self.dict_loader,
            use_ai=use_ai
        )
        self.sentence_splitter = SentenceSplitter(use_ai=use_ai)
        self.grammar_checker = GrammarChecker(use_ai=use_ai)
        self.meaning_matcher = MeaningMatcher(
            dictionary_loader=self.dict_loader,
            use_ai=use_ai
        )
        self.formatter = TextFormatter()
        self.exporter = ResultExporter()

        self.dialect_processor = DialectProcessor(
            dictionary_loader=self.dict_loader,
            use_ai=use_ai
        )
        self.style_classifier = AncientTextClassifier(use_ai=use_ai)
        self.review_manager = ReviewManager()

        self.inference_config = ModelOptimizationConfig(
            enable_cache=True,
            cache_size=1000,
            cache_ttl=3600,
            enable_batching=True,
            max_batch_size=32,
            enable_quantization=False
        )
        self.inference_engine = LightweightInferenceEngine(self.inference_config)

        print("古籍异体字智能勘校AI应用系统已初始化完成")
        print(f"字库统计: {self.dict_loader.get_dictionary_stats()}")

    def process_text(self, text: str, title: str = "",
                      do_punctuation: bool = True,
                      do_variant_conversion: bool = True,
                      do_grammar_check: bool = True,
                      do_annotation: bool = True,
                      do_formatting: bool = True,
                      do_dialect_processing: bool = True,
                      do_style_classification: bool = True) -> Dict[str, Any]:
        """
        处理单个文本

        Args:
            text: 待处理文本
            title: 文本标题
            do_punctuation: 是否断句
            do_variant_conversion: 是否转换异体字
            do_grammar_check: 是否语法检查
            do_annotation: 是否添加注释
            do_formatting: 是否格式化
            do_dialect_processing: 是否处理方言用字
            do_style_classification: 是否进行文体分类

        Returns:
            处理结果字典
        """
        results = {
            "original_text": text,
            "title": title,
            "steps": []
        }

        print(f"\n开始处理文本: {len(text)} 字")

        if do_variant_conversion:
            print("步骤1: 异体字转换...")
            variant_result = self.variant_converter.convert_text(text, use_ai=self.use_ai)
            results["variant_result"] = variant_result
            results["steps"].append("variant_conversion")
            text = variant_result.converted_text
            print(f"  发现 {len(variant_result.variants)} 个异体字")

        if do_punctuation:
            print("步骤2: 古籍断句...")
            punctuation_result = self.sentence_splitter.split_text(text, use_ai=self.use_ai)
            results["punctuation_result"] = punctuation_result
            results["steps"].append("punctuation")
            text = punctuation_result.punctuated_text
            print(f"  分割为 {len(punctuation_result.sentences)} 个句子")

        if do_grammar_check:
            print("步骤3: 语法检查...")
            grammar_result = self.grammar_checker.check_text(text, use_ai=self.use_ai)
            results["grammar_result"] = grammar_result
            results["steps"].append("grammar_check")
            text = grammar_result.corrected_text
            print(f"  发现 {len(grammar_result.issues)} 个问题")

        if do_annotation:
            print("步骤4: 字义注释...")
            annotation_result = self.meaning_matcher.annotate_text(text, use_ai=self.use_ai)
            results["annotation_result"] = annotation_result
            results["steps"].append("annotation")
            print(f"  添加 {len(annotation_result.annotations)} 个注释")

        if do_formatting:
            print("步骤5: 排版格式化...")
            format_config = FormatConfig(
                page_width=config.PUNCTUATION["page_width"],
                indent_size=config.PUNCTUATION["indent_size"],
                use_vertical=config.PUNCTUATION["use_vertical"],
                add_page_numbers=config.PUNCTUATION["add_page_numbers"],
                header_text=title
            )
            formatted_result = self.formatter.format_text(text, format_config)
            results["formatted_result"] = formatted_result
            results["steps"].append("formatting")
            results["final_text"] = formatted_result.formatted_text

        if do_dialect_processing:
            print("步骤6: 方言用字处理...")
            dialect_result = self.dialect_processor.process_text(text, use_ai=self.use_ai)
            results["dialect_result"] = dialect_result
            results["steps"].append("dialect_processing")
            text = dialect_result.processed_text
            print(f"  发现 {len(dialect_result.dialect_chars)} 个方言用字")

        if do_style_classification:
            print("步骤7: 文体分类...")
            style_result = self.style_classifier.classify_text(text, use_ai=self.use_ai)
            results["style_result"] = style_result
            results["steps"].append("style_classification")
            print(f"  文体: {style_result['style'].primary_style}, 时代: {style_result['era'].era}")

        print("处理完成!")
        return results

    def process_file(self, file_path: str, **kwargs) -> Optional[Dict[str, Any]]:
        """
        处理单个文件

        Args:
            file_path: 文件路径
            **kwargs: 处理参数

        Returns:
            处理结果字典
        """
        doc = self.importer.import_file(file_path)
        if not doc:
            return None

        title = os.path.splitext(os.path.basename(file_path))[0]
        return self.process_text(doc.content, title=title, **kwargs)

    def process_directory(self, dir_path: str,
                       recursive: bool = True,
                       file_filter: Optional[List[str]] = None,
                       **kwargs) -> List[Dict[str, Any]]:
        """
        批量处理目录

        Args:
            dir_path: 目录路径
            recursive: 是否递归
            file_filter: 文件过滤
            **kwargs: 处理参数

        Returns:
            处理结果列表
        """
        docs = self.importer.import_directory(dir_path, recursive, file_filter)
        results = []

        for doc in docs:
            title = os.path.splitext(doc.file_name)[0]
            result = self.process_text(doc.content, title=title, **kwargs)
            results.append(result)

        return results

    def export_results(self, results: Dict[str, Any],
                      document_name: str = "document") -> Any:
        """
        导出处理结果

        Args:
            results: 处理结果
            document_name: 文档名称

        Returns:
            导出结果
        """
        return self.exporter.export_all(
            original_text=results.get("original_text"),
            punctuation_result=results.get("punctuation_result"),
            variant_result=results.get("variant_result"),
            annotation_result=results.get("annotation_result"),
            grammar_result=results.get("grammar_result"),
            formatted_result=results.get("formatted_result"),
            document_name=document_name,
            title=results.get("title", "")
        )

    def set_ai_config(self, endpoint: str = "", api_key: str = "", model_name: str = "") -> None:
        """设置AI配置"""
        self.variant_converter.ai_client.set_api_config(endpoint, api_key, model_name)
        self.sentence_splitter.ai_client.set_api_config(endpoint, api_key, model_name)
        self.grammar_checker.ai_client.set_api_config(endpoint, api_key, model_name)
        self.meaning_matcher.ai_client.set_api_config(endpoint, api_key, model_name)
        self.dialect_processor.ai_client.set_api_config(endpoint, api_key, model_name)

    def process_dialect(self, text: str, target_regions: Optional[List[str]] = None) -> DialectProcessingResult:
        """
        专门处理方言用字

        Args:
            text: 待处理文本
            target_regions: 目标方言区域列表

        Returns:
            方言处理结果
        """
        return self.dialect_processor.process_text(text, use_ai=self.use_ai, target_regions=target_regions)

    def classify_text_style(self, text: str) -> Dict[str, Any]:
        """
        对文本进行文体分类

        Args:
            text: 待分类文本

        Returns:
            分类结果（文体、题材、时代）
        """
        return self.style_classifier.classify_text(text, use_ai=self.use_ai)

    def create_review_session(self, document_id: str, document_title: str,
                               ai_results: Optional[Dict[str, Any]] = None,
                               reviewer: str = "") -> ReviewSession:
        """
        创建人工复核会话

        Args:
            document_id: 文档ID
            document_title: 文档标题
            ai_results: AI勘校结果
            reviewer: 复核人

        Returns:
            复核会话
        """
        return self.review_manager.create_session(document_id, document_title, ai_results, reviewer)

    def save_review_session(self, session: Optional[ReviewSession] = None) -> bool:
        """保存复核会话"""
        return self.review_manager.save_session(session)

    def generate_dialect_report(self, result: DialectProcessingResult) -> str:
        """生成方言分析报告"""
        return self.dialect_processor.generate_dialect_report(result)

    def generate_style_report(self, classification: Dict[str, Any]) -> str:
        """生成文体分类报告"""
        return self.style_classifier.generate_classification_report(classification)

    def generate_review_report(self, session: Optional[ReviewSession] = None) -> str:
        """生成复核报告"""
        return self.review_manager.generate_review_report(session)

    def get_inference_stats(self) -> Dict[str, Any]:
        """获取推理引擎性能统计"""
        return self.inference_engine.get_performance_stats()

    def list_dialect_regions(self) -> List[Dict[str, Any]]:
        """列出所有支持的方言区域"""
        return self.dialect_processor.list_all_regions()

    def list_supported_styles(self) -> List[Dict[str, Any]]:
        """列出所有支持的文体类型"""
        return self.style_classifier.list_supported_styles()


def main():
    """命令行主函数"""
    parser = argparse.ArgumentParser(
        description="古籍异体字智能勘校AI应用系统"
    )

    parser.add_argument(
        "-i", "--input",
        type=str,
        help="输入文件或目录路径"
    )

    parser.add_argument(
        "-o", "--output",
        type=str,
        default=config.get_output_dir(),
        help="输出目录"
    )

    parser.add_argument(
        "--no-ai",
        action="store_true",
        help="禁用AI辅助，仅使用本地规则"
    )

    parser.add_argument(
        "--export-format",
        type=str,
        default="txt",
        help="导出格式 (txt, md, html, json, csv)"
    )

    parser.add_argument(
        "--api-endpoint",
        type=str,
        default="",
        help="AI API端点"
    )

    parser.add_argument(
        "--api-key",
        type=str,
        default="",
        help="AI API密钥"
    )

    parser.add_argument(
        "--model-name",
        type=str,
        default="",
        help="AI模型名称"
    )

    parser.add_argument(
        "--demo",
        action="store_true",
        help="运行演示示例"
    )

    args = parser.parse_args()

    if args.demo:
        run_demo()
        return

    use_ai = not args.no_ai
    proofreader = AncientTextProofreader(use_ai=use_ai)

    if args.api_endpoint:
        proofreader.set_ai_config(args.api_endpoint, args.api_key, args.model_name)

    config.update_export_config(export_format=args.export_format)

    if not args.input:
        print("错误: 请指定输入文件或目录路径")
        parser.print_help()
        return

    if os.path.isfile(args.input):
        result = proofreader.process_file(args.input)
        if result:
            export_result = proofreader.export_results(
                result,
                document_name=os.path.splitext(os.path.basename(args.input))[0]
            )
            print(f"\n结果已导出到: {export_result.file_paths}")
    elif os.path.isdir(args.input):
        results = proofreader.process_directory(args.input)
        for i, result in enumerate(results):
            export_result = proofreader.export_results(
                result,
                document_name=f"document_{i}"
            )
            print(f"\n文档 {i} 结果已导出")


def run_demo():
    """运行演示示例"""
    print("=" * 60)
    print("古籍异体字智能勘校AI应用系统 - 演示示例")
    print("=" * 60)

    sample_text = """学而时习之不亦说乎有朋自远方来不亦乐乎人不知而不愠不亦君子乎
学而不思则罔思而不学则殆
知之为知之不知为不知是知也
三人行必有我师焉择其善者而从之其不善者而改之
温故而知新可以为师矣
学而不厌诲人不倦
知之者不如好之者好之者不如乐之者
逝者如斯夫不舍昼夜
三军可夺帅也匹夫不可夺志也
岁寒然后知松柏之后雕也"""

    print("\n【演示文本】:")
    print("-" * 40)
    print(sample_text)
    print("-" * 40)

    proofreader = AncientTextProofreader(use_ai=False)

    print("\n开始处理演示文本...")
    results = proofreader.process_text(
        sample_text,
        title="论语选段",
        do_punctuation=True,
        do_variant_conversion=True,
        do_grammar_check=True,
        do_annotation=True,
        do_formatting=True
    )

    print("\n" + "=" * 60)
    print("处理结果:")
    print("=" * 60)

    if "variant_result" in results:
        vr = results["variant_result"]
        print(f"\n异体字转换: 发现 {len(vr.variants)} 个异体字")

    if "punctuation_result" in results:
        pr = results["punctuation_result"]
        print(f"断句结果: {len(pr.sentences)} 个句子")
        print("\n断句后文本:")
        print("-" * 40)
        print(pr.punctuated_text)
        print("-" * 40)

    if "annotation_result" in results:
        ar = results["annotation_result"]
        print(f"\n字义注释: {len(ar.annotations)} 个注释")
        print("\n带注释文本:")
        print("-" * 40)
        print(ar.annotated_text)
        print("-" * 40)

    if "formatted_result" in results:
        fr = results["formatted_result"]
        print("\n排版结果:")
        print("-" * 40)
        print(fr.formatted_text)
        print("-" * 40)

    export_result = proofreader.export_results(results, document_name="demo")
    print(f"\n演示完成! 结果已导出到: {export_result.file_paths}")


if __name__ == "__main__":
    main()
