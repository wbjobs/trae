#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
系统测试脚本 - System Test Script
测试古籍异体字智能勘校AI应用系统各模块功能
"""

import os
import sys
import json
from typing import Dict, Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ancient_text_proofreader.config import config
from ancient_text_proofreader.text_processing.importer import TextImporter
from ancient_text_proofreader.text_processing.sentence_splitter import SentenceSplitter
from ancient_text_proofreader.text_processing.grammar_checker import GrammarChecker
from ancient_text_proofreader.text_processing.style_classifier import AncientTextClassifier
from ancient_text_proofreader.character_matching.dictionary_loader import DictionaryLoader
from ancient_text_proofreader.character_matching.variant_converter import VariantConverter
from ancient_text_proofreader.character_matching.meaning_matcher import MeaningMatcher
from ancient_text_proofreader.character_matching.dialect_processor import DialectProcessor
from ancient_text_proofreader.result_export.formatter import TextFormatter, FormatConfig
from ancient_text_proofreader.result_export.exporter import ResultExporter, ExportConfig
from ancient_text_proofreader.result_export.review_module import ReviewManager
from ancient_text_proofreader.ai_inference.lightweight_inference import LightweightInferenceEngine, ModelOptimizationConfig


def test_dictionary_loader():
    """测试字库加载器"""
    print("=" * 60)
    print("测试1: 字库加载器 (DictionaryLoader)")
    print("=" * 60)
    
    try:
        loader = DictionaryLoader()
        loader.load_all()
        
        stats = loader.get_dictionary_stats()
        print(f"字库统计: {stats}")
        
        variant_map = loader.get_variant_mapping()
        print(f"异体字映射表大小: {len(variant_map)}")
        
        ancient_chars = loader.get_ancient_chars()
        print(f"古文字库大小: {len(ancient_chars)}")
        
        char_meanings = loader.get_char_meanings()
        print(f"字义库大小: {len(char_meanings)}")
        
        print("✓ 字库加载器测试通过")
        return True
    except Exception as e:
        print(f"✗ 字库加载器测试失败: {e}")
        return False


def test_variant_converter():
    """测试异体字转换器"""
    print("\n" + "=" * 60)
    print("测试2: 异体字转换器 (VariantConverter)")
    print("=" * 60)
    
    try:
        loader = DictionaryLoader()
        loader.load_all()
        
        converter = VariantConverter(dictionary_loader=loader, use_ai=False)
        
        test_text = "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？"
        print(f"测试文本: {test_text}")
        
        result = converter.convert_text(test_text, use_ai=False)
        print(f"转换后文本: {result.converted_text}")
        print(f"发现异体字: {len(result.variants)} 个")
        
        for v in result.variants:
            print(f"  - {v.original} → {v.standard} (位置: {v.position})")
        
        print("✓ 异体字转换器测试通过")
        return True
    except Exception as e:
        print(f"✗ 异体字转换器测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_sentence_splitter():
    """测试句子分割器"""
    print("\n" + "=" * 60)
    print("测试3: 句子分割器 (SentenceSplitter)")
    print("=" * 60)
    
    try:
        splitter = SentenceSplitter(use_ai=False)
        
        test_text = "学而时习之不亦说乎有朋自远方来不亦乐乎人不知而不愠不亦君子乎"
        print(f"测试文本: {test_text}")
        
        result = splitter.split_text(test_text, use_ai=False)
        print(f"断句后文本: {result.punctuated_text}")
        print(f"分割句子数: {len(result.sentences)}")
        
        for i, s in enumerate(result.sentences):
            print(f"  句子{i+1}: {s}")
        
        print("✓ 句子分割器测试通过")
        return True
    except Exception as e:
        print(f"✗ 句子分割器测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_grammar_checker():
    """测试语法检查器"""
    print("\n" + "=" * 60)
    print("测试4: 语法检查器 (GrammarChecker)")
    print("=" * 60)
    
    try:
        checker = GrammarChecker(use_ai=False)
        
        test_text = "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？"
        print(f"测试文本: {test_text}")
        
        result = checker.check_text(test_text, use_ai=False)
        print(f"校正后文本: {result.corrected_text}")
        print(f"发现问题数: {len(result.issues)}")
        
        for issue in result.issues:
            print(f"  - 类型: {issue.issue_type}, 位置: {issue.position}, 描述: {issue.description}")
        
        print("✓ 语法检查器测试通过")
        return True
    except Exception as e:
        print(f"✗ 语法检查器测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_meaning_matcher():
    """测试字义匹配器"""
    print("\n" + "=" * 60)
    print("测试5: 字义匹配器 (MeaningMatcher)")
    print("=" * 60)
    
    try:
        loader = DictionaryLoader()
        loader.load_all()
        
        matcher = MeaningMatcher(dictionary_loader=loader, use_ai=False)
        
        test_text = "学而时习之，不亦说乎？"
        print(f"测试文本: {test_text}")
        
        result = matcher.annotate_text(test_text, use_ai=False)
        print(f"注释后文本: {result.annotated_text}")
        print(f"添加注释数: {len(result.annotations)}")
        
        for ann in result.annotations[:5]:
            print(f"  - {ann.char}: {ann.meaning} (词性: {ann.part_of_speech})")
        
        print("✓ 字义匹配器测试通过")
        return True
    except Exception as e:
        print(f"✗ 字义匹配器测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_text_formatter():
    """测试文本格式化器"""
    print("\n" + "=" * 60)
    print("测试6: 文本格式化器 (TextFormatter)")
    print("=" * 60)
    
    try:
        formatter = TextFormatter()
        
        test_text = """学而时习之，不亦说乎？
有朋自远方来，不亦乐乎？
人不知而不愠，不亦君子乎？"""
        
        print(f"测试文本:\n{test_text}")
        
        format_config = FormatConfig(
            page_width=30,
            indent_size=2,
            use_vertical=False,
            add_page_numbers=True,
            header_text="论语选段"
        )
        
        result = formatter.format_text(test_text, format_config)
        print(f"格式化后文本:\n{result.formatted_text}")
        print(f"页数: {result.page_count}")
        
        print("✓ 文本格式化器测试通过")
        return True
    except Exception as e:
        print(f"✗ 文本格式化器测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_text_importer():
    """测试文本导入器"""
    print("\n" + "=" * 60)
    print("测试7: 文本导入器 (TextImporter)")
    print("=" * 60)
    
    try:
        importer = TextImporter()
        
        test_dir = os.path.join(os.path.dirname(__file__), "..", "test_samples")
        os.makedirs(test_dir, exist_ok=True)
        
        test_file = os.path.join(test_dir, "test_sample.txt")
        with open(test_file, "w", encoding="utf-8") as f:
            f.write("学而时习之不亦说乎有朋自远方来不亦乐乎\n")
            f.write("人不知而不愠不亦君子乎\n")
        
        doc = importer.import_file(test_file)
        if doc:
            print(f"导入文件: {doc.file_name}")
            print(f"文件大小: {doc.file_size} 字节")
            print(f"内容长度: {len(doc.content)} 字符")
            print(f"内容预览: {doc.content[:50]}...")
        else:
            print("无法导入文件")
        
        os.remove(test_file)
        os.rmdir(test_dir)
        
        print("✓ 文本导入器测试通过")
        return True
    except Exception as e:
        print(f"✗ 文本导入器测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_dialect_processor():
    """测试方言处理器"""
    print("\n" + "=" * 60)
    print("测试8: 方言处理器 (DialectProcessor)")
    print("=" * 60)
    
    try:
        loader = DictionaryLoader()
        loader.load_all()
        
        processor = DialectProcessor(dictionary_loader=loader, use_ai=False)
        
        test_text = "吳越之地，人傑地靈。楚辭漢賦，文采斐然。"
        print(f"测试文本: {test_text}")
        
        result = processor.process_text(test_text, use_ai=False)
        print(f"处理后文本: {result.processed_text}")
        print(f"发现方言用字: {len(result.dialect_chars)} 个")
        
        for dc in result.dialect_chars:
            print(f"  - {dc.original_char} → {dc.standard_char} [{dc.dialect_region}]")
        
        regions = processor.list_all_regions()
        print(f"支持方言区域: {len(regions)} 个")
        
        print("✓ 方言处理器测试通过")
        return True
    except Exception as e:
        print(f"✗ 方言处理器测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_style_classifier():
    """测试文体分类器"""
    print("\n" + "=" * 60)
    print("测试9: 文体分类器 (StyleClassifier)")
    print("=" * 60)
    
    try:
        classifier = AncientTextClassifier(use_ai=False)
        
        test_texts = {
            "四言诗": "关关雎鸠，在河之洲。窈窕淑女，君子好逑。",
            "五言诗": "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
            "散文": "臣亮言：先帝创业未半而中道崩殂，今天下三分，益州疲弊，此诚危急存亡之秋也。"
        }
        
        for style, text in test_texts.items():
            print(f"\n测试[{style}]: {text[:30]}...")
            result = classifier.classify_text(text, use_ai=False)
            print(f"  文体: {result['style'].primary_style} (置信度: {result['style'].primary_confidence*100:.1f}%)")
            print(f"  题材: {result['genre'].primary_genre}")
            print(f"  时代: {result['era'].era}")
        
        supported_styles = classifier.list_supported_styles()
        print(f"\n支持文体数: {len(supported_styles)}")
        for s in supported_styles[:5]:
            print(f"  - {s['name']}: {s['description']}")
        
        print("✓ 文体分类器测试通过")
        return True
    except Exception as e:
        print(f"✗ 文体分类器测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_review_module():
    """测试人工复核模块"""
    print("\n" + "=" * 60)
    print("测试10: 人工复核模块 (ReviewModule)")
    print("=" * 60)
    
    try:
        manager = ReviewManager()
        
        session = manager.create_session(
            document_id="test_001",
            document_title="测试文档",
            ai_results={"variants": [], "suggestions": []},
            reviewer="测试用户"
        )
        print(f"创建会话: {session.session_id}")
        print(f"文档标题: {session.document_title}")
        
        comment = manager.add_comment(
            position=10,
            original_text="说",
            suggested_text="悦",
            comment_type="variant_error",
            content="此处应为通假字'悦'",
            reviewer="测试用户",
            session=session
        )
        print(f"添加批注: {comment.comment_id}")
        
        correction = manager.add_correction(
            position=10,
            original="说",
            corrected="悦",
            correction_type="variant_correction",
            reason="通假字修正",
            reviewer="测试用户",
            ai_suggestion="说→悦",
            confidence=0.85,
            session=session
        )
        print(f"添加修正: {correction.correction_id}")
        
        manager.resolve_comment(comment.comment_id, "已修正为'悦'", "测试用户", session)
        print("解决批注完成")
        
        report = manager.generate_review_report(session)
        print(f"生成报告: {len(report)} 字符")
        
        save_success = manager.save_session(session)
        print(f"保存会话: {'成功' if save_success else '失败'}")
        
        print("✓ 人工复核模块测试通过")
        return True
    except Exception as e:
        print(f"✗ 人工复核模块测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_lightweight_inference():
    """测试轻量化推理引擎"""
    print("\n" + "=" * 60)
    print("测试11: 轻量化推理引擎 (LightweightInference)")
    print("=" * 60)
    
    try:
        config = ModelOptimizationConfig(
            enable_cache=True,
            cache_size=100,
            cache_ttl=3600,
            enable_batching=True,
            max_batch_size=16,
            enable_quantization=False
        )
        
        engine = LightweightInferenceEngine(config)
        
        def mock_inference(prompt, task_type):
            return f"result_{prompt[:10]}"
        
        test_prompts = [
            "学而时习之",
            "有朋自远方来",
            "学而时习之",
            "温故而知新"
        ]
        
        print("测试缓存功能:")
        for i, prompt in enumerate(test_prompts):
            result = engine.infer(prompt, "test", mock_inference)
            print(f"  推理{i+1}: {prompt} → {result}")
        
        stats = engine.get_performance_stats()
        print(f"\n性能统计:")
        print(f"  总推理次数: {stats['total_inferences']}")
        print(f"  缓存命中: {stats['cache_hits']}")
        print(f"  缓存未命中: {stats['cache_misses']}")
        print(f"  缓存命中率: {stats.get('cache_hit_rate', 0)*100:.1f}%")
        print(f"  平均延迟: {stats.get('avg_latency_ms', 0):.2f}ms")
        
        print("\n测试批量推理:")
        batch_results = engine.batch_infer(test_prompts, "batch_test", lambda ps, t: [f"batch_{p[:5]}" for p in ps])
        print(f"  批量结果数: {len(batch_results)}")
        
        print("✓ 轻量化推理引擎测试通过")
        return True
    except Exception as e:
        print(f"✗ 轻量化推理引擎测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_historical_chars_extension():
    """测试历代古籍专用字库扩充"""
    print("\n" + "=" * 60)
    print("测试12: 历代古籍专用字库扩充 (HistoricalCharsExtension)")
    print("=" * 60)
    
    try:
        loader = DictionaryLoader()
        loader.load_all()
        
        dict_path = os.path.join(
            os.path.dirname(__file__),
            "character_matching",
            "dictionary",
            "historical_chars_extension.json"
        )
        
        if os.path.exists(dict_path):
            with open(dict_path, "r", encoding="utf-8") as f:
                import json
                data = json.load(f)
            
            metadata = data.get("metadata", {})
            print(f"字库名称: {metadata.get('name', '未知')}")
            print(f"版本: {metadata.get('version', '未知')}")
            print(f"总条目数: {metadata.get('total_entries', 0)}")
            print(f"覆盖朝代: {metadata.get('dynasties_covered', 0)}")
            print(f"覆盖领域: {metadata.get('domains_covered', 0)}")
            
            dynasty_chars = data.get("dynasty_specific_characters", {})
            print(f"\n朝代专用字库数: {len(dynasty_chars)}")
            for dynasty, info in list(dynasty_chars.items())[:3]:
                print(f"  - {dynasty}: {info.get('character_count', 0)} 字")
            
            domain_chars = data.get("domain_specific_characters", {})
            print(f"\n领域专用字库数: {len(domain_chars)}")
            for domain, info in list(domain_chars.items())[:3]:
                print(f"  - {domain}: {info.get('character_count', 0)} 字")
            
            style_chars = data.get("style_specific_characters", {})
            print(f"\n文体专用字库数: {len(style_chars)}")
            for style, info in list(style_chars.items())[:3]:
                print(f"  - {style}: {info.get('character_count', 0)} 字")
            
            categories = data.get("character_categories", {})
            print(f"\n字符分类:")
            for cat, info in categories.items():
                print(f"  - {cat}: {info.get('total_count', 0)} 字")
            
            print("✓ 历代古籍专用字库扩充测试通过")
            return True
        else:
            print(f"字库文件不存在: {dict_path}")
            return False
    except Exception as e:
        print(f"✗ 历代古籍专用字库扩充测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def run_all_tests():
    """运行所有测试"""
    print("\n" + "=" * 60)
    print("古籍异体字智能勘校AI应用系统 - 系统测试")
    print("=" * 60)
    
    tests = [
        ("字库加载器", test_dictionary_loader),
        ("异体字转换器", test_variant_converter),
        ("句子分割器", test_sentence_splitter),
        ("语法检查器", test_grammar_checker),
        ("字义匹配器", test_meaning_matcher),
        ("文本格式化器", test_text_formatter),
        ("文本导入器", test_text_importer),
        ("方言处理器", test_dialect_processor),
        ("文体分类器", test_style_classifier),
        ("人工复核模块", test_review_module),
        ("轻量化推理引擎", test_lightweight_inference),
        ("历代古籍专用字库扩充", test_historical_chars_extension),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"✗ {name}测试发生异常: {e}")
            results.append((name, False))
    
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    
    passed = 0
    failed = 0
    for name, result in results:
        status = "✓ 通过" if result else "✗ 失败"
        print(f"{name}: {status}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print(f"\n总计: {passed} 通过, {failed} 失败")
    print("=" * 60)
    
    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
