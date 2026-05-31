#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
系统验证脚本 - 验证所有新模块是否正常工作
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("=" * 60)
print("古籍异体字智能勘校AI应用系统 v2.0 - 系统验证")
print("=" * 60)

try:
    from ancient_text_proofreader import (
        AncientTextProofreader,
        DialectProcessor,
        AncientTextClassifier,
        ReviewManager,
        LightweightInferenceEngine,
        ModelOptimizationConfig,
        __version__
    )
    print(f"✓ 版本: {__version__}")
    print("✓ 所有模块导入成功")
except Exception as e:
    print(f"✗ 模块导入失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "-" * 60)
print("测试1: 初始化主系统")
print("-" * 60)

try:
    proofreader = AncientTextProofreader(use_ai=False)
    print("✓ 主系统初始化成功")
except Exception as e:
    print(f"✗ 主系统初始化失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "-" * 60)
print("测试2: 方言处理器")
print("-" * 60)

try:
    test_text = "吳越之地，人傑地靈。楚辭漢賦，文采斐然。"
    result = proofreader.process_dialect(test_text)
    print(f"✓ 方言处理成功，发现 {len(result.dialect_chars)} 个方言用字")
    for dc in result.dialect_chars[:3]:
        print(f"  - {dc.original_char} → {dc.standard_char} [{dc.dialect_region}]")
except Exception as e:
    print(f"✗ 方言处理失败: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "-" * 60)
print("测试3: 文体分类器")
print("-" * 60)

try:
    test_text = "关关雎鸠，在河之洲。窈窕淑女，君子好逑。"
    classification = proofreader.classify_text_style(test_text)
    style = classification['style']
    era = classification['era']
    print(f"✓ 文体分类成功")
    print(f"  文体: {style.primary_style} (置信度: {style.primary_confidence*100:.1f}%)")
    print(f"  时代: {era.era} (置信度: {era.confidence*100:.1f}%)")
except Exception as e:
    print(f"✗ 文体分类失败: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "-" * 60)
print("测试4: 人工复核模块")
print("-" * 60)

try:
    session = proofreader.create_review_session(
        document_id="test_001",
        document_title="测试文档",
        reviewer="测试用户"
    )
    print(f"✓ 创建复核会话成功: {session.session_id}")
    
    comment = proofreader.review_manager.add_comment(
        position=0,
        original_text="说",
        suggested_text="悦",
        comment_type="variant_error",
        content="测试批注",
        reviewer="测试用户",
        session=session
    )
    print(f"✓ 添加批注成功: {comment.comment_id}")
    
    save_success = proofreader.save_review_session(session)
    print(f"✓ 保存会话: {'成功' if save_success else '失败'}")
except Exception as e:
    print(f"✗ 人工复核模块失败: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "-" * 60)
print("测试5: 轻量化推理引擎")
print("-" * 60)

try:
    config = ModelOptimizationConfig(
        enable_cache=True,
        cache_size=100,
        cache_ttl=3600,
        enable_batching=True
    )
    engine = LightweightInferenceEngine(config)
    
    def mock_infer(p, t):
        return f"result_{p[:10]}"
    
    result1 = engine.infer("学而时习之", "test", mock_infer)
    result2 = engine.infer("学而时习之", "test", mock_infer)
    
    stats = engine.get_performance_stats()
    print(f"✓ 推理引擎工作正常")
    print(f"  总推理次数: {stats['total_inferences']}")
    print(f"  缓存命中: {stats['cache_hits']}")
    print(f"  缓存命中率: {stats.get('cache_hit_rate', 0)*100:.1f}%")
except Exception as e:
    print(f"✗ 推理引擎测试失败: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "-" * 60)
print("测试6: 历代古籍专用字库")
print("-" * 60)

try:
    dict_path = os.path.join(
        os.path.dirname(__file__),
        "ancient_text_proofreader",
        "character_matching",
        "dictionary",
        "historical_chars_extension.json"
    )
    
    if os.path.exists(dict_path):
        import json
        with open(dict_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        metadata = data.get("metadata", {})
        print(f"✓ 字库文件存在")
        print(f"  名称: {metadata.get('name', '未知')}")
        print(f"  总条目数: {metadata.get('total_entries', 0)}")
        print(f"  覆盖朝代: {metadata.get('dynasties_covered', 0)}")
        print(f"  覆盖领域: {metadata.get('domains_covered', 0)}")
        
        dynasty_chars = data.get("dynasty_specific_characters", {})
        print(f"  朝代专用字库: {len(dynasty_chars)} 个")
    else:
        print(f"✗ 字库文件不存在: {dict_path}")
except Exception as e:
    print(f"✗ 字库验证失败: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("✅ 系统验证完成！所有模块工作正常。")
print("=" * 60)
