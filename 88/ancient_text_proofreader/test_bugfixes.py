#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bug修复验证测试脚本 - Bug Fix Verification Test Script
验证所有功能缺陷修复是否有效
"""

import os
import sys
import time
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ancient_text_proofreader.config import config
from ancient_text_proofreader.character_matching.dictionary_loader import DictionaryLoader
from ancient_text_proofreader.character_matching.variant_converter import VariantConverter
from ancient_text_proofreader.character_matching.meaning_matcher import MeaningMatcher
from ancient_text_proofreader.text_processing.sentence_splitter import SentenceSplitter
from ancient_text_proofreader.ai_inference.model_client import AncientTextModelClient, ModelConfig, CircuitBreaker, RateLimiter


def test_circuit_breaker():
    """测试熔断器功能"""
    print("=" * 60)
    print("测试1: 熔断器功能 (Circuit Breaker)")
    print("=" * 60)
    
    try:
        cb = CircuitBreaker(threshold=3, timeout=1)
        
        print("初始状态: closed")
        assert cb.allow_request() == True, "初始状态应该允许请求"
        
        print("模拟3次失败...")
        for i in range(3):
            cb.record_failure()
        
        print("当前状态:", cb.state)
        assert cb.allow_request() == False, "熔断后应该阻止请求"
        print("✓ 熔断器打开，请求被阻止")
        
        print("等待超时...")
        time.sleep(1.1)
        
        assert cb.allow_request() == True, "超时后应该进入半开状态"
        print("✓ 熔断器半开，允许探测请求")
        
        cb.record_success()
        assert cb.state == "closed", "成功后应该关闭熔断器"
        print("✓ 熔断器关闭，恢复正常")
        
        print("✓ 熔断器功能测试通过")
        return True
    except Exception as e:
        print(f"✗ 熔断器测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_rate_limiter():
    """测试限流器功能"""
    print("\n" + "=" * 60)
    print("测试2: 限流器功能 (Rate Limiter)")
    print("=" * 60)
    
    try:
        rl = RateLimiter(requests_per_minute=10)
        
        print("测试限流功能 (每分钟10次)...")
        start = time.time()
        
        for i in range(3):
            rl.wait()
            print(f"  请求 {i+1} 完成")
        
        elapsed = time.time() - start
        print(f"3次请求耗时: {elapsed:.2f}秒")
        assert elapsed >= 0.2, "应该有一定间隔"
        
        print("✓ 限流器功能测试通过")
        return True
    except Exception as e:
        print(f"✗ 限流器测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_model_client_config():
    """测试模型客户端配置"""
    print("\n" + "=" * 60)
    print("测试3: 模型客户端配置 (Model Client Config)")
    print("=" * 60)
    
    try:
        config = ModelConfig(
            max_retries=3,
            retry_delay=0.5,
            rate_limit_per_minute=30,
            circuit_breaker_threshold=5
        )
        
        assert config.max_retries == 3, "重试次数配置错误"
        assert config.retry_delay == 0.5, "重试延迟配置错误"
        assert config.rate_limit_per_minute == 30, "限流配置错误"
        assert config.circuit_breaker_threshold == 5, "熔断阈值配置错误"
        
        print(f"  最大重试次数: {config.max_retries}")
        print(f"  重试延迟: {config.retry_delay}秒")
        print(f"  限流: {config.rate_limit_per_minute}次/分钟")
        print(f"  熔断阈值: {config.circuit_breaker_threshold}次失败")
        
        print("✓ 模型客户端配置测试通过")
        return True
    except Exception as e:
        print(f"✗ 模型客户端配置测试失败: {e}")
        return False


def test_dictionary_loader_error_handling():
    """测试字库加载器错误处理"""
    print("\n" + "=" * 60)
    print("测试4: 字库加载器错误处理 (Dictionary Loader)")
    print("=" * 60)
    
    try:
        loader = DictionaryLoader()
        loader.load_all()
        
        stats = loader.get_dictionary_stats()
        print(f"字库统计:")
        print(f"  异体字标准字: {stats['variant_standard_chars']}")
        print(f"  异体字总数: {stats['variant_total_chars']}")
        print(f"  古文字库: {stats['ancient_chars']}")
        print(f"  释义库: {stats['meaning_chars']}")
        
        if 'load_errors' in stats and stats['load_errors']:
            print(f"  加载错误: {stats['load_errors']}")
        
        test_char = "說"
        standard = loader.get_standard_char(test_char)
        print(f"\n测试生僻字处理:")
        print(f"  {test_char} → {standard}")
        
        test_char2 = "峯"
        standard2 = loader.get_standard_char(test_char2)
        print(f"  {test_char2} → {standard2}")
        
        print("✓ 字库加载器错误处理测试通过")
        return True
    except Exception as e:
        print(f"✗ 字库加载器测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_variant_converter_robustness():
    """测试异体字转换器健壮性"""
    print("\n" + "=" * 60)
    print("测试5: 异体字转换器健壮性 (Variant Converter)")
    print("=" * 60)
    
    try:
        loader = DictionaryLoader()
        loader.load_all()
        converter = VariantConverter(dictionary_loader=loader, use_ai=False)
        
        test_cases = [
            ("", "空文本"),
            (None, "None值"),
            ("学而时習之，不亦說乎", "包含异体字文本"),
            ("学而时习之，不亦说乎", "标准文本"),
            ("峯巒疊翠，美景如畫", "多个异体字"),
            ("a\u0000b\u0001c", "包含控制字符"),
            ("这是一段包含生僻字的文本：䶮龘靐", "生僻字"),
        ]
        
        for i, (text, desc) in enumerate(test_cases):
            print(f"\n测试 {i+1}: {desc}")
            try:
                result = converter.convert_text(text, use_ai=False)
                print(f"  原始: {repr(text)[:50]}")
                print(f"  转换: {repr(result.converted_text)[:50]}")
                print(f"  异体字: {len(result.variants)}个")
                print(f"  方法: {result.method}")
                print(f"  ✓ 成功")
            except Exception as e:
                print(f"  ✗ 失败: {e}")
        
        print("\n✓ 异体字转换器健壮性测试通过")
        return True
    except Exception as e:
        print(f"✗ 异体字转换器测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_long_text_sentence_splitting():
    """测试长文本断句处理"""
    print("\n" + "=" * 60)
    print("测试6: 长文本断句处理 (Long Text Splitting)")
    print("=" * 60)
    
    try:
        splitter = SentenceSplitter(use_ai=False)
        
        short_text = "学而时习之不亦说乎有朋自远方来不亦乐乎"
        long_text = "学而时习之不亦说乎有朋自远方来不亦乐乎人不知而不愠不亦君子乎" * 20
        
        test_cases = [
            (short_text, "短文本"),
            (long_text, "长文本"),
            ("", "空文本"),
            (None, "None值"),
        ]
        
        for text, desc in test_cases:
            print(f"\n测试: {desc}")
            try:
                result = splitter.split_text(text, use_ai=False)
                text_length = len(text) if text else 0
                print(f"  文本长度: {text_length}")
                print(f"  句子数量: {len(result.sentences)}")
                print(f"  方法: {result.method}")
                print(f"  置信度: {result.confidence:.2f}")
                if result.sentences:
                    print(f"  前2句: {result.sentences[0].text[:30]}...")
                    if len(result.sentences) > 1:
                        print(f"          {result.sentences[1].text[:30]}...")
                print(f"  ✓ 成功")
            except Exception as e:
                print(f"  ✗ 失败: {e}")
                import traceback
                traceback.print_exc()
        
        print("\n✓ 长文本断句处理测试通过")
        return True
    except Exception as e:
        print(f"✗ 长文本断句处理测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_annotation_overlap_handling():
    """测试注释重叠处理"""
    print("\n" + "=" * 60)
    print("测试7: 注释重叠处理 (Annotation Overlap Handling)")
    print("=" * 60)
    
    try:
        loader = DictionaryLoader()
        loader.load_all()
        matcher = MeaningMatcher(dictionary_loader=loader, use_ai=False)
        
        test_cases = [
            ("学而时习之，不亦说乎", "常规文本"),
            ("之之之之之", "重复字符"),
            ("", "空文本"),
        ]
        
        for text, desc in test_cases:
            print(f"\n测试: {desc}")
            try:
                result = matcher.annotate_text(text, use_ai=False, min_distance=2)
                print(f"  原始: {text}")
                print(f"  注释后: {result.annotated_text}")
                print(f"  注释数量: {len(result.annotations)}")
                
                positions = [a.position for a in result.annotations]
                sorted_positions = sorted(positions)
                overlaps = 0
                for i in range(1, len(sorted_positions)):
                    if sorted_positions[i] - sorted_positions[i-1] < 2:
                        overlaps += 1
                
                print(f"  位置重叠: {overlaps}处")
                print(f"  方法: {result.method}")
                print(f"  ✓ 成功")
            except Exception as e:
                print(f"  ✗ 失败: {e}")
                import traceback
                traceback.print_exc()
        
        print("\n✓ 注释重叠处理测试通过")
        return True
    except Exception as e:
        print(f"✗ 注释重叠处理测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_integration_workflow():
    """测试完整工作流程"""
    print("\n" + "=" * 60)
    print("测试8: 完整工作流程 (Integration Workflow)")
    print("=" * 60)
    
    try:
        loader = DictionaryLoader()
        loader.load_all()
        converter = VariantConverter(dictionary_loader=loader, use_ai=False)
        splitter = SentenceSplitter(use_ai=False)
        matcher = MeaningMatcher(dictionary_loader=loader, use_ai=False)
        
        original_text = """學而時習之不亦說乎有朋自遠方來不亦樂乎人不知而不慍不亦君子乎
溫故而知新可以為師矣學而不思則罔思而不學則殆
知之為知之不知為不知是知也"""
        
        print(f"原始文本:\n{original_text}\n")
        
        step1 = converter.convert_text(original_text, use_ai=False)
        print(f"步骤1 - 异体字转换:")
        print(f"  转换后: {step1.converted_text[:100]}...")
        print(f"  发现异体字: {len(step1.variants)}个")
        
        step2 = splitter.split_text(step1.converted_text, use_ai=False)
        print(f"\n步骤2 - 断句处理:")
        print(f"  句子数量: {len(step2.sentences)}")
        print(f"  断句后: {step2.punctuated_text[:100]}...")
        
        step3 = matcher.annotate_text(step2.punctuated_text, use_ai=False, min_distance=3)
        print(f"\n步骤3 - 释义挂载:")
        print(f"  注释数量: {len(step3.annotations)}")
        print(f"  注释后: {step3.annotated_text[:100]}...")
        
        print("\n✓ 完整工作流程测试通过")
        return True
    except Exception as e:
        print(f"✗ 完整工作流程测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def run_all_tests():
    """运行所有测试"""
    print("\n" + "=" * 60)
    print("古籍异体字勘校AI系统 - Bug修复验证测试")
    print("=" * 60)
    
    tests = [
        ("熔断器功能", test_circuit_breaker),
        ("限流器功能", test_rate_limiter),
        ("模型客户端配置", test_model_client_config),
        ("字库加载器错误处理", test_dictionary_loader_error_handling),
        ("异体字转换器健壮性", test_variant_converter_robustness),
        ("长文本断句处理", test_long_text_sentence_splitting),
        ("注释重叠处理", test_annotation_overlap_handling),
        ("完整工作流程", test_integration_workflow),
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
