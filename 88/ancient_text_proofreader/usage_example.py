#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
使用示例 - Usage Example
古籍异体字智能勘校AI应用系统使用指南
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ancient_text_proofreader import (
    AncientTextProofreader,
    DialectProcessor,
    AncientTextClassifier,
    ReviewManager,
    LightweightInferenceEngine,
    ModelOptimizationConfig
)


def example_basic_usage():
    """基础使用示例"""
    print("=" * 60)
    print("示例1: 基础文本处理")
    print("=" * 60)
    
    proofreader = AncientTextProofreader(use_ai=False)
    
    text = """学而时习之不亦说乎有朋自远方来不亦乐乎
人不知而不愠不亦君子乎
学而不思则罔思而不学则殆
知之为知之不知为不知是知也"""
    
    results = proofreader.process_text(
        text,
        title="论语选段",
        do_punctuation=True,
        do_variant_conversion=True,
        do_grammar_check=True,
        do_annotation=True,
        do_formatting=True
    )
    
    print("\n处理结果:")
    print("-" * 40)
    if "punctuation_result" in results:
        print("断句后文本:")
        print(results["punctuation_result"].punctuated_text)
    
    if "variant_result" in results:
        print(f"\n发现异体字: {len(results['variant_result'].variants)} 个")
    
    if "annotation_result" in results:
        print(f"添加注释: {len(results['annotation_result'].annotations)} 个")
    
    return results


def example_batch_processing():
    """批量处理示例"""
    print("\n" + "=" * 60)
    print("示例2: 批量处理目录")
    print("=" * 60)
    
    proofreader = AncientTextProofreader(use_ai=False)
    
    input_dir = "./input_samples"
    if os.path.exists(input_dir):
        results = proofreader.process_directory(
            input_dir,
            recursive=True,
            file_filter=[".txt", ".md"]
        )
        print(f"共处理 {len(results)} 个文件")
    else:
        print(f"输入目录 {input_dir} 不存在，请先创建并放入古籍文本文件")


def example_export_results():
    """导出结果示例"""
    print("\n" + "=" * 60)
    print("示例3: 导出处理结果")
    print("=" * 60)
    
    proofreader = AncientTextProofreader(use_ai=False)
    
    text = "三人行必有我师焉择其善者而从之其不善者而改之"
    
    results = proofreader.process_text(
        text,
        title="论语述而",
        do_punctuation=True,
        do_variant_conversion=True,
        do_grammar_check=True,
        do_annotation=True,
        do_formatting=True
    )
    
    export_result = proofreader.export_results(results, document_name="lunyu_shuer")
    print(f"结果已导出到: {export_result.file_paths}")
    
    return export_result


def example_with_ai():
    """使用AI辅助处理示例"""
    print("\n" + "=" * 60)
    print("示例4: 使用AI辅助处理（需要配置API）")
    print("=" * 60)
    
    print("注意: 使用AI功能需要先配置AI API接口")
    print("配置方式:")
    print("  1. 通过命令行参数: --api-endpoint, --api-key, --model-name")
    print("  2. 通过代码调用: proofreader.set_ai_config(endpoint, api_key, model_name)")
    print("  3. 修改 config.py 中的 AI_CONFIG 配置")
    
    # 示例代码（需要实际API才能运行）:
    # proofreader = AncientTextProofreader(use_ai=True)
    # proofreader.set_ai_config(
    #     endpoint="http://your-api-endpoint/v1/chat/completions",
    #     api_key="your-api-key",
    #     model_name="ancient-text-lite-v1"
    # )
    # results = proofreader.process_text(text, use_ai=True)


def example_custom_config():
    """自定义配置示例"""
    print("\n" + "=" * 60)
    print("示例5: 自定义处理配置")
    print("=" * 60)
    
    from ancient_text_proofreader.config import config
    
    # 修改导出配置
    config.update_export_config(
        export_format="md",
        export_raw=True,
        export_formatted=True,
        export_annotations=True,
        export_statistics=True,
        separate_files=True
    )
    
    # 修改AI配置
    config.update_ai_config(
        max_tokens=8192,
        temperature=0.5,
        timeout=120
    )
    
    print("自定义配置已更新")
    print(f"导出格式: {config.EXPORT_CONFIG['export_format']}")
    print(f"AI温度参数: {config.AI_CONFIG['temperature']}")


def example_dialect_processing():
    """方言用字处理示例"""
    print("\n" + "=" * 60)
    print("示例6: 古籍方言用字专项勘校")
    print("=" * 60)
    
    proofreader = AncientTextProofreader(use_ai=False)
    
    # 包含方言用字的文本
    text = """吳越之地，人傑地靈。楚辭漢賦，文采斐然。
粵語傳承古音，閩南語存唐韻。
蜀道之難，難於上青天。
關中古風猶在，中原禮樂不衰。"""
    
    print(f"原始文本:\n{text}")
    
    # 处理方言用字
    dialect_result = proofreader.process_dialect(text)
    
    print(f"\n处理后文本:\n{dialect_result.processed_text}")
    print(f"\n发现方言用字: {len(dialect_result.dialect_chars)} 个")
    
    for dc in dialect_result.dialect_chars:
        region_name = proofreader.dialect_processor.dialect_regions.get(dc.dialect_region, dc.dialect_region)
        print(f"  [{region_name}] {dc.original_char} → {dc.standard_char} ({dc.dialect_type})")
    
    # 生成方言分析报告
    report = proofreader.generate_dialect_report(dialect_result)
    print(f"\n方言分析报告:\n{report}")
    
    # 查看支持的方言区域
    regions = proofreader.list_dialect_regions()
    print(f"\n支持的方言区域: {len(regions)} 个")
    for r in regions[:5]:
        print(f"  {r['code']}: {r['name']} ({r['character_count']}字)")
    
    return dialect_result


def example_style_classification():
    """文体分类示例"""
    print("\n" + "=" * 60)
    print("示例7: 古籍篇目文体自动分类")
    print("=" * 60)
    
    proofreader = AncientTextProofreader(use_ai=False)
    
    # 不同文体的测试文本
    test_texts = {
        "四言诗": "关关雎鸠，在河之洲。窈窕淑女，君子好逑。参差荇菜，左右流之。窈窕淑女，寤寐求之。",
        "五言诗": "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
        "七言诗": "故人西辞黄鹤楼，烟花三月下扬州。孤帆远影碧空尽，唯见长江天际流。",
        "散文": "臣亮言：先帝创业未半而中道崩殂，今天下三分，益州疲弊，此诚危急存亡之秋也。然侍卫之臣不懈于内，忠志之士忘身于外者，盖追先帝之殊遇，欲报之于陛下也。",
        "骈文": "落霞与孤鹜齐飞，秋水共长天一色。渔舟唱晚，响穷彭蠡之滨；雁阵惊寒，声断衡阳之浦。",
        "史传": "初，郑武公娶于申，曰武姜，生庄公及共叔段。庄公寤生，惊姜氏，故名曰寤生，遂恶之。爱共叔段，欲立之。亟请于武公，公弗许。"
    }
    
    for style_name, text in test_texts.items():
        print(f"\n【{style_name}】")
        print(f"文本: {text[:40]}...")
        
        classification = proofreader.classify_text_style(text)
        
        style = classification['style']
        genre = classification['genre']
        era = classification['era']
        
        print(f"  文体: {style.primary_style} (置信度: {style.primary_confidence*100:.1f}%)")
        if style.secondary_styles:
            for s, c in style.secondary_styles[:2]:
                print(f"    次文体: {s} ({c*100:.1f}%)")
        print(f"  题材: {genre.primary_genre} (置信度: {genre.primary_confidence*100:.1f}%)")
        print(f"  时代: {era.era} (置信度: {era.confidence*100:.1f}%)")
    
    # 生成分类报告
    sample_text = test_texts["四言诗"]
    classification = proofreader.classify_text_style(sample_text)
    report = proofreader.generate_style_report(classification)
    print(f"\n分类报告示例:\n{report}")
    
    # 查看支持的文体类型
    styles = proofreader.list_supported_styles()
    print(f"\n支持的文体类型: {len(styles)} 种")
    for s in styles[:5]:
        print(f"  {s['name']}: {s['description']}")


def example_review_workflow():
    """人工复核批注示例"""
    print("\n" + "=" * 60)
    print("示例8: AI勘校人工复核批注")
    print("=" * 60)
    
    proofreader = AncientTextProofreader(use_ai=False)
    
    # 先处理文本获得AI勘校结果
    text = """学而时习之不亦说乎有朋自远方来不亦乐乎
知之为知之不知为不知是知也"""
    
    results = proofreader.process_text(
        text,
        title="论语选段",
        do_punctuation=True,
        do_variant_conversion=True,
        do_grammar_check=True,
        do_annotation=True,
        do_formatting=False
    )
    
    # 创建复核会话
    session = proofreader.create_review_session(
        document_id="lunyu_001",
        document_title="论语·学而篇",
        ai_results=results,
        reviewer="张教授"
    )
    print(f"创建复核会话: {session.session_id}")
    print(f"文档: {session.document_title}")
    print(f"复核人: {session.reviewer}")
    
    # 添加批注
    comment1 = proofreader.review_manager.add_comment(
        position=6,
        original_text="说",
        suggested_text="悦",
        comment_type="variant_error",
        content="此处'说'为通假字，应读'yuè'，同'悦'，表示高兴、愉悦。",
        reviewer="张教授",
        session=session
    )
    print(f"\n添加批注: {comment1.comment_id}")
    print(f"  位置: {comment1.position}")
    print(f"  原文: {comment1.original_text} → 建议: {comment1.suggested_text}")
    print(f"  批注: {comment1.content}")
    
    # 添加修正记录
    correction1 = proofreader.review_manager.add_correction(
        position=6,
        original="说",
        corrected="悦",
        correction_type="variant_correction",
        reason="通假字修正，'说'通'悦'",
        reviewer="张教授",
        ai_suggestion="说→悦（通假字）",
        confidence=0.92,
        session=session
    )
    print(f"\n添加修正: {correction1.correction_id}")
    print(f"  {correction1.original} → {correction1.corrected}")
    print(f"  原因: {correction1.reason}")
    
    # 解决批注
    proofreader.review_manager.resolve_comment(
        comment1.comment_id,
        "已采纳建议，修正为'悦'",
        "张教授",
        session
    )
    print(f"\n解决批注: {comment1.comment_id} → {comment1.status}")
    
    # 更新会话状态
    proofreader.review_manager.update_session_status("reviewing", session)
    print(f"会话状态: {session.status}")
    
    # 保存会话
    save_success = proofreader.save_review_session(session)
    print(f"保存会话: {'成功' if save_success else '失败'}")
    
    # 生成复核报告
    review_report = proofreader.generate_review_report(session)
    print(f"\n复核报告:\n{review_report}")
    
    # 应用修正到文本
    corrected_text = proofreader.review_manager.apply_corrections_to_text(text, session)
    print(f"\n应用修正后的文本:\n{corrected_text}")
    
    return session


def example_inference_optimization():
    """轻量化推理加速示例"""
    print("\n" + "=" * 60)
    print("示例9: 轻量化模型本地推理加速")
    print("=" * 60)
    
    # 创建优化配置
    config = ModelOptimizationConfig(
        enable_cache=True,
        cache_size=1000,
        cache_ttl=3600,
        enable_batching=True,
        max_batch_size=32,
        batch_timeout=0.1,
        enable_quantization=False,
        enable_parallel=False
    )
    
    engine = LightweightInferenceEngine(config)
    
    print("推理引擎配置:")
    print(f"  缓存启用: {config.enable_cache}")
    print(f"  缓存大小: {config.cache_size}")
    print(f"  缓存TTL: {config.cache_ttl}秒")
    print(f"  批处理启用: {config.enable_batching}")
    print(f"  最大批大小: {config.max_batch_size}")
    print(f"  量化启用: {config.enable_quantization}")
    
    # 模拟推理函数
    def mock_llm_inference(prompt: str, task_type: str) -> str:
        """模拟大模型推理"""
        import time
        time.sleep(0.01)  # 模拟推理延迟
        return f"[{task_type}] 处理结果: {prompt[:20]}..."
    
    # 测试缓存功能
    print("\n测试缓存功能:")
    test_prompts = [
        "学而时习之，不亦说乎？",
        "有朋自远方来，不亦乐乎？",
        "学而时习之，不亦说乎？",  # 重复，应命中缓存
        "温故而知新，可以为师矣。",
        "有朋自远方来，不亦乐乎？"   # 重复，应命中缓存
    ]
    
    for i, prompt in enumerate(test_prompts):
        result = engine.infer(prompt, "variant_conversion", mock_llm_inference)
        print(f"  推理{i+1}: {prompt[:15]}... → {result}")
    
    # 查看性能统计
    stats = engine.get_performance_stats()
    print(f"\n性能统计:")
    print(f"  总推理次数: {stats['total_inferences']}")
    print(f"  缓存命中: {stats['cache_hits']}")
    print(f"  缓存未命中: {stats['cache_misses']}")
    print(f"  缓存命中率: {stats.get('cache_hit_rate', 0)*100:.1f}%")
    print(f"  平均延迟: {stats.get('avg_latency_ms', 0):.2f}ms")
    
    # 测试批量推理
    print("\n测试批量推理:")
    batch_prompts = [
        "文本1: 学而不思则罔",
        "文本2: 思而不学则殆",
        "文本3: 三人行必有我师焉",
        "文本4: 择其善者而从之"
    ]
    
    def mock_batch_inference(prompts, task_type):
        return [f"批量处理[{i}]: {p[:15]}" for i, p in enumerate(prompts)]
    
    batch_results = engine.batch_infer(batch_prompts, "batch_processing", mock_batch_inference)
    print(f"  批量处理 {len(batch_results)} 个请求")
    for i, r in enumerate(batch_results[:2]):
        print(f"    结果{i+1}: {r}")
    
    # 测试缓存统计
    if engine.cache:
        cache_stats = engine.cache.get_stats()
        print(f"\n缓存详情:")
        print(f"  缓存条目: {cache_stats['total_entries']}/{cache_stats['max_size']}")
        print(f"  总访问次数: {cache_stats['total_accesses']}")
        print(f"  命中率: {cache_stats['hit_rate']*100:.1f}%")
    
    return engine


def example_integrated_workflow():
    """集成工作流示例"""
    print("\n" + "=" * 60)
    print("示例10: 完整古籍处理工作流")
    print("=" * 60)
    
    proofreader = AncientTextProofreader(use_ai=False)
    
    # 原始古籍文本
    ancient_text = """吳王夫差敗越於夫椒，報槜李也。遂入越。越子以甲楯五千，保於會稽。
使大夫種因吳大宰嚭以行成，吳子將許之。
伍員曰：「不可。臣聞之：『樹德莫如滋，去疾莫如盡。』
昔有過澆殺斟灌以伐斟鄩，滅夏后相。后緡方娠，逃出自竇，歸於有仍，生少康焉。"""
    
    print(f"原始文本:\n{ancient_text[:100]}...")
    print(f"\n文本长度: {len(ancient_text)} 字")
    
    # 1. 完整处理（包含所有新功能）
    print("\n【步骤1: 完整文本处理】")
    results = proofreader.process_text(
        ancient_text,
        title="左传·哀公元年",
        do_punctuation=True,
        do_variant_conversion=True,
        do_grammar_check=True,
        do_annotation=True,
        do_formatting=True,
        do_dialect_processing=True,
        do_style_classification=True
    )
    
    print(f"处理步骤: {' → '.join(results['steps'])}")
    
    # 2. 查看方言处理结果
    if "dialect_result" in results:
        dr = results["dialect_result"]
        print(f"\n【步骤2: 方言处理结果】")
        print(f"  发现方言用字: {len(dr.dialect_chars)} 个")
        for dc in dr.dialect_chars[:3]:
            print(f"    {dc.original_char} → {dc.standard_char} [{dc.dialect_region}]")
    
    # 3. 查看文体分类结果
    if "style_result" in results:
        sr = results["style_result"]
        print(f"\n【步骤3: 文体分类结果】")
        print(f"  文体: {sr['style'].primary_style} (置信度: {sr['style'].primary_confidence*100:.1f}%)")
        print(f"  题材: {sr['genre'].primary_genre}")
        print(f"  时代: {sr['era'].era} (置信度: {sr['era'].confidence*100:.1f}%)")
    
    # 4. 开始人工复核
    print(f"\n【步骤4: 人工复核】")
    session = proofreader.create_review_session(
        document_id="zuozhuan_ai_01",
        document_title="左传·哀公元年",
        ai_results=results,
        reviewer="李教授"
    )
    print(f"  创建复核会话: {session.session_id}")
    
    # 添加专家批注
    if results.get("variant_result") and results["variant_result"].variants:
        variant = results["variant_result"].variants[0]
        comment = proofreader.review_manager.add_comment(
            position=variant.position,
            original_text=variant.original,
            suggested_text=variant.standard,
            comment_type="variant_error",
            content=f"专家确认：'{variant.original}' 应为 '{variant.standard}'，符合春秋时期用字习惯。",
            reviewer="李教授",
            session=session
        )
        print(f"  添加专家批注: {comment.comment_id}")
    
    # 5. 生成最终报告
    print(f"\n【步骤5: 生成报告】")
    final_report = proofreader.generate_review_report(session)
    print(f"  复核报告已生成，长度: {len(final_report)} 字")
    
    # 6. 查看推理性能
    infer_stats = proofreader.get_inference_stats()
    print(f"\n【步骤6: 性能统计】")
    print(f"  总推理次数: {infer_stats['total_inferences']}")
    
    print("\n✅ 完整古籍处理工作流完成！")
    return results


def run_all_examples():
    """运行所有示例"""
    print("\n" + "=" * 60)
    print("古籍异体字智能勘校AI应用系统 v2.0 - 使用示例")
    print("=" * 60)
    
    try:
        example_basic_usage()
        example_batch_processing()
        example_export_results()
        example_with_ai()
        example_custom_config()
        example_dialect_processing()
        example_style_classification()
        example_review_workflow()
        example_inference_optimization()
        example_integrated_workflow()
        
        print("\n" + "=" * 60)
        print("所有示例运行完成！")
        print("=" * 60)
        return True
    except Exception as e:
        print(f"\n示例运行出错: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_all_examples()
    sys.exit(0 if success else 1)
