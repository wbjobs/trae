import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai_parser import AIDocumentParser
from ai_parser.config import AppConfig
from ai_parser.prompts import PromptTemplate


def create_medical_document():
    content = """
    门诊病历

    姓名：王五
    性别：男
    年龄：45岁
    就诊日期：2024年3月10日

    主诉：反复咳嗽、咳痰1周，伴发热2天。

    现病史：患者1周前受凉后出现咳嗽，咳黄色脓痰，伴咽痛、鼻塞。
    2天前出现发热，体温最高达38.8℃，伴全身乏力、肌肉酸痛。

    既往史：高血压病史5年，口服硝苯地平控释片 30mg qd。
    否认糖尿病、冠心病等慢性病史。

    体格检查：
    T: 38.5℃, P: 98次/分, R: 22次/分, BP: 145/90mmHg
    咽部充血，双侧扁桃体Ⅰ度肿大。
    双肺呼吸音粗，右下肺可闻及少量湿性啰音。

    辅助检查：
    1. 血常规：WBC 12.5×10^9/L，N 85%
    2. 胸片：右下肺纹理增多、模糊，考虑支气管炎

    诊断：
    1. 急性支气管炎
    2. 上呼吸道感染
    3. 高血压2级

    处方：
    1. 阿莫西林胶囊 0.5g tid × 7天
    2. 氨溴索口服液 10ml tid × 7天
    3. 布洛芬缓释胶囊 0.3g q12h 必要时
    4. 继续硝苯地平控释片 30mg qd

    医嘱：
    - 多饮水，清淡饮食
    - 注意休息，避免劳累
    - 3天后复诊，如症状加重及时就诊
    """
    with open("./medical_note.txt", "w", encoding="utf-8") as f:
        f.write(content)
    return "./medical_note.txt"


def create_finance_document():
    content = """
    2023年度财务报告摘要

    公司名称：创新科技股份有限公司
    报告期间：2023年1月1日至2023年12月31日

    一、主要财务指标

    （单位：人民币万元）

    指标名称          2023年      2022年      同比变动
    营业收入        125,680     98,500      +27.6%
    净利润           18,750     12,300      +52.4%
    总资产          256,000    210,000      +21.9%
    总负债          102,400     85,600      +19.6%
    净资产          153,600    124,400      +23.5%
    每股收益（元）     0.85        0.56      +51.8%

    二、业务分部收入

    1. 智能文档处理业务：收入65,800万元，占比52.4%
    2. 数据分析服务：收入35,200万元，占比28.0%
    3. 云服务业务：收入24,680万元，占比19.6%

    三、重大事项

    1. 2023年5月，公司完成B轮融资，融资金额2.5亿元。
    2. 2023年8月，公司收购某AI初创公司，交易对价8,000万元。
    3. 2023年11月，公司与某大型银行签订3年期服务合同，合同总金额1.2亿元。

    四、风险提示

    1. 市场竞争风险：行业竞争加剧，可能影响公司市场份额。
    2. 技术迭代风险：AI技术发展迅速，公司需持续投入研发。
    3. 人才流失风险：核心技术人员对公司发展至关重要。

    五、未来展望

    2024年，公司预计营业收入目标为15-16亿元，
    重点拓展金融、医疗、法律三大垂直领域。
    """
    with open("./finance_report.txt", "w", encoding="utf-8") as f:
        f.write(content)
    return "./finance_report.txt"


def create_legal_document():
    content = """
    软件开发服务合同

    合同编号：TECH-2024-001
    签订日期：2024年2月1日

    甲方（委托方）：智慧产业有限公司
    法定代表人：陈总
    地址：北京市朝阳区科技园区88号

    乙方（服务方）：创新科技股份有限公司
    法定代表人：李总
    地址：北京市海淀区软件园56号

    鉴于甲方需要开发智能客服系统，乙方具备相关技术能力，
    双方经友好协商，达成如下协议：

    第一条 服务内容
    1.1 乙方为甲方开发智能客服系统V1.0版本
    1.2 系统功能包括：多轮对话、意图识别、知识库管理、数据分析
    1.3 乙方提供12个月的免费维护服务

    第二条 合同金额及付款方式
    2.1 本合同总金额为人民币：贰佰万元整（¥2,000,000.00）
    2.2 付款方式：
        - 合同签订后7个工作日内，甲方向乙方支付30%，即60万元
        - 系统上线验收合格后7个工作日内，支付60%，即120万元
        - 维护期满后7个工作日内，支付剩余10%，即20万元

    第三条 项目周期
    3.1 项目总周期为6个月
    3.2 自合同签订之日起计算
    3.3 如遇不可抗力，工期相应顺延

    第四条 知识产权
    4.1 本项目开发的软件系统著作权归甲方所有
    4.2 乙方保留对通用技术组件的使用权

    第五条 保密条款
    5.1 双方应对合作过程中知悉的对方商业秘密保密
    5.2 保密期限为合同终止后5年

    第六条 违约责任
    6.1 如乙方逾期交付，每逾期1天按合同金额的0.1%支付违约金
    6.2 如甲方逾期付款，每逾期1天按应付金额的0.1%支付违约金

    第七条 争议解决
    7.1 因本合同产生的争议，双方应友好协商解决
    7.2 协商不成的，提交北京仲裁委员会仲裁

    第八条 其他
    8.1 本合同自双方签字盖章之日起生效
    8.2 本合同一式四份，双方各执两份
    """
    with open("./legal_contract.txt", "w", encoding="utf-8") as f:
        f.write(content)
    return "./legal_contract.txt"


def custom_template_example():
    return PromptTemplate(
        name="contract_key_points",
        description="抽取合同中的关键条款",
        version="1.0",
        variables=["text"],
        output_format="json",
        template="""你是一个专业的合同审查专家。请从以下合同中抽取关键信息。

合同内容：
{text}

请严格按照JSON格式返回结果，格式如下：
{{
  "contract_info": {{
    "contract_no": "",
    "sign_date": "",
    "total_amount": 0
  }},
  "parties": [
    {{"name": "", "role": ""}}
  ],
  "key_dates": {{
    "start_date": "",
    "end_date": ""
  }},
  "payment_terms": [],
  "key_obligations": []
}}

只返回JSON，不要包含其他说明文字。
""",
    )


def main():
    print("=== AI文档解析系统 - 行业领域示例 ===")
    print()

    medical_file = create_medical_document()
    finance_file = create_finance_document()
    legal_file = create_legal_document()

    print("测试文档已创建:")
    print(f"  - {medical_file}")
    print(f"  - {finance_file}")
    print(f"  - {legal_file}")
    print()

    config = AppConfig()
    config.storage.output_dir = "./domain_output"

    with AIDocumentParser(config=config, backend_type="mock") as parser:
        print("=== 1. 医疗文档解析 ===")
        print()
        med_result = parser.parse_document(
            medical_file,
            extraction_tasks=["medical_extraction", "entity_extraction"],
            domain="医疗",
        )
        print(f"文档: {med_result.document_name}")
        print(f"置信度: {med_result.confidence:.2f}")
        if "medical_extraction" in med_result.extraction_results:
            med_data = med_result.extraction_results["medical_extraction"]
            print(f"诊断: {med_data.get('diagnosis', [])}")
            print(f"症状: {med_data.get('symptoms', [])}")
            if med_data.get("medications"):
                print("用药:")
                for med in med_data["medications"]:
                    print(f"  - {med.get('name', '')}: {med.get('dosage', '')} {med.get('frequency', '')}")
        print()

        print("=== 2. 财务文档解析 ===")
        print()
        fin_result = parser.parse_document(
            finance_file,
            extraction_tasks=["finance_extraction", "document_summarization"],
            domain="金融",
        )
        print(f"文档: {fin_result.document_name}")
        print(f"置信度: {fin_result.confidence:.2f}")
        if "finance_extraction" in fin_result.extraction_results:
            fin_data = fin_result.extraction_results["finance_extraction"]
            metrics = fin_data.get("financial_metrics", {})
            print(f"营业收入: {metrics.get('revenue', 0):,} 万元")
            print(f"净利润: {metrics.get('profit', 0):,} 万元")
            if fin_data.get("key_transactions"):
                print("重大交易:")
                for trans in fin_data["key_transactions"][:2]:
                    print(f"  - {trans.get('description', '')}: {trans.get('amount', 0)}万元")
        print()

        print("=== 3. 法律文档解析 ===")
        print()
        legal_result = parser.parse_document(
            legal_file,
            extraction_tasks=["legal_extraction", "entity_extraction"],
            domain="法律",
        )
        print(f"文档: {legal_result.document_name}")
        print(f"置信度: {legal_result.confidence:.2f}")
        if "legal_extraction" in legal_result.extraction_results:
            legal_data = legal_result.extraction_results["legal_extraction"]
            print(f"文档类型: {legal_data.get('document_type', '')}")
            if legal_data.get("parties"):
                print("签约方:")
                for party in legal_data["parties"]:
                    print(f"  - {party.get('name', '')} ({party.get('role', '')})")
            if legal_data.get("key_clauses"):
                print("关键条款:")
                for clause in legal_data["key_clauses"][:3]:
                    print(f"  - {clause.get('clause_type', '')}: {clause.get('content', '')[:50]}...")
        print()

        print("=== 4. 自定义模板示例 ===")
        print()
        custom_template = custom_template_example()
        parser.extractor.register_custom_template(custom_template)
        print("已注册自定义模板: contract_key_points")
        print()

        custom_result = parser.extract_custom(
            legal_file,
            template_name="contract_key_points",
            variables={"text": ""},
        )
        print(f"自定义抽取结果置信度: {custom_result.confidence:.2f}")
        if "custom" in custom_result.extraction_results:
            custom_data = custom_result.extraction_results["custom"]
            ci = custom_data.get("contract_info", {})
            print(f"合同编号: {ci.get('contract_no', '')}")
            print(f"合同金额: {ci.get('total_amount', 0)}元")
        print()

        print("=== 5. 批量文档解析 ===")
        print()
        all_files = [medical_file, finance_file, legal_file]
        batch_results = parser.parse_files(
            all_files,
            extraction_tasks=["entity_extraction"],
            save_results=False,
        )
        print(f"批量解析完成，共处理 {len(batch_results)} 个文档")
        for res in batch_results:
            entity_count = len(res.entities)
            print(f"  - {res.document_name}: 抽取 {entity_count} 个实体, 置信度 {res.confidence:.2f}")

        print()
        print("=== 解析结果统计 ===")
        stats = parser.get_stats()
        print(f"总请求数: {stats['inference']['total_requests']}")
        print(f"成功请求: {stats['inference']['completed_requests']}")
        print(f"失败请求: {stats['inference']['failed_requests']}")
        print(f"平均延迟: {stats['inference']['avg_latency']:.2f}秒")

    for f in [medical_file, finance_file, legal_file]:
        if os.path.exists(f):
            os.remove(f)

    print()
    print("示例执行完成！")


if __name__ == "__main__":
    main()
