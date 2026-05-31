import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai_parser import AIDocumentParser
from ai_parser.config import AppConfig


def create_test_document():
    test_content = """
    智能文档解析系统项目合同

    甲方：科技有限公司
    乙方：张三

    一、项目概述
    本合同涉及智能文档解析系统的开发项目，项目金额为100万元整。
    项目签订日期：2024年1月15日
    项目负责人：李四

    二、项目内容
    1. 文档格式预处理模块开发
    2. 语义抽取引擎开发
    3. 本地AI推理调度系统
    4. 结构化内容重组模块

    三、付款方式
    合同签订后支付30%预付款，即30万元
    项目中期验收后支付40%，即40万元
    项目最终验收后支付30%，即30万元

    四、项目周期
    项目预计于2024年6月30日前完成全部开发工作。

    五、知识产权
    本项目所有知识产权归甲方所有。
    """

    test_file = "./test_document.txt"
    with open(test_file, "w", encoding="utf-8") as f:
        f.write(test_content)
    return test_file


def main():
    print("=== AI文档解析系统 - 基础使用示例 ===")
    print()

    test_file = create_test_document()
    print(f"测试文档已创建: {test_file}")
    print()

    config = AppConfig()
    config.extraction.domain = "法律"

    print("初始化解析器...")
    with AIDocumentParser(config=config, backend_type="mock") as parser:
        print("解析器初始化完成")
        print()

        print("支持的文档格式:")
        for fmt in parser.preprocessor.get_supported_formats():
            print(f"  - {fmt}")
        print()

        print("可用的抽取任务:")
        for task in parser.extractor.list_available_tasks():
            print(f"  - {task}")
        print()

        print("开始解析文档...")
        print("-" * 50)

        extraction_tasks = [
            "entity_extraction",
            "document_summarization",
        ]

        result = parser.parse_document(
            test_file,
            extraction_tasks=extraction_tasks,
            domain="法律合同",
            save_results=True,
        )

        print("解析完成！")
        print()

        print(f"文档ID: {result.document_id}")
        print(f"文档名称: {result.document_name}")
        print(f"文件类型: {result.file_type}")
        print(f"处理时间: {result.created_at}")
        print(f"总体置信度: {result.confidence:.2f}")
        print()

        if result.summary:
            print("=== 文档摘要 ===")
            print(result.summary)
            print()

        if result.key_points:
            print("=== 核心要点 ===")
            for i, point in enumerate(result.key_points, 1):
                print(f"{i}. {point}")
            print()

        if result.entities:
            print("=== 抽取的实体 ===")
            for entity in result.entities:
                print(f"  - [{entity.get('type', '未知')}] {entity.get('text', '')} (置信度: {entity.get('confidence', 0):.2f})")
            print()

        print("=== 抽取结果详情 ===")
        for task_type, data in result.extraction_results.items():
            print(f"\n任务: {task_type}")
            print(f"数据: {data}")

        print()
        print("-" * 50)
        print()

        print("执行问答测试...")
        question = "项目总金额是多少？"
        answer = parser.answer_question(test_file, question, domain="法律合同")
        print(f"\n问题: {question}")
        print(f"回答: {answer.get('answer', '无法回答')}")
        print(f"置信度: {answer.get('confidence', 0):.2f}")
        print(f"可回答: {answer.get('answerable', False)}")

        print()
        print("-" * 50)
        print()

        print("查看已保存的结果:")
        docs = parser.storage.list_documents(limit=5)
        for doc in docs:
            print(f"  - {doc['document_name']} ({doc['file_type']}) - 置信度: {doc['confidence']:.2f}")

        output_dir = parser.storage.get_output_dir()
        print(f"\n结果文件已保存到: {output_dir}")

        print()
        print("=== 系统统计 ===")
        stats = parser.get_stats()
        print(f"总请求数: {stats['inference']['total_requests']}")
        print(f"完成请求数: {stats['inference']['completed_requests']}")
        print(f"平均延迟: {stats['inference']['avg_latency']:.2f}秒")

    os.remove(test_file)
    print(f"\n测试文档已清理")
    print("\n示例执行完成！")


if __name__ == "__main__":
    main()
