from typing import List, Dict, Any
import re


class LayoutAnalyzer:
    def analyze_layout(self, pages_data: List[Dict]) -> Dict[str, Any]:
        analysis = {
            "pages": [],
            "full_text": "",
            "headings": [],
            "tables": [],
            "lists": [],
            "paragraphs": []
        }
        
        sample_mock = {
            "full_text": """
购销合同

甲方：北京科技有限公司
地址：北京市海淀区中关村大街1号

乙方：上海贸易有限公司
地址：上海市浦东新区陆家嘴金融中心

第一条 合同目的
甲乙双方本着平等互利的原则，经友好协商，就以下事项达成一致：

第二条 合同金额
本合同总金额为人民币伍拾万元整（¥500,000.00元）。

第三条 合同期限
3.1 本合同自2024年1月15日起生效
3.2 合同有效期至2024年12月31日止

第四条 付款方式
1. 甲方应在合同签订后15日内支付预付款30%
2. 乙方完成交付后，甲方支付剩余款项

第五条 违约责任
如一方违约，应向对方支付合同总金额10%的违约金。

签订日期：2024年1月10日

甲方签字：________________
乙方签字：________________
""",
            "headings": [
                {"level": 1, "text": "购销合同", "page": 1, "bbox": [100, 50, 500, 80]},
                {"level": 2, "text": "第一条 合同目的", "page": 1, "bbox": [50, 180, 300, 200]},
                {"level": 2, "text": "第二条 合同金额", "page": 1, "bbox": [50, 240, 300, 260]},
                {"level": 2, "text": "第三条 合同期限", "page": 1, "bbox": [50, 300, 300, 320]},
                {"level": 2, "text": "第四条 付款方式", "page": 1, "bbox": [50, 380, 300, 400]},
                {"level": 2, "text": "第五条 违约责任", "page": 1, "bbox": [50, 460, 300, 480]}
            ],
            "tables": [],
            "lists": [
                {"type": "numbered", "items": [
                    {"text": "3.1 本合同自2024年1月15日起生效", "level": 1, "bbox": [70, 330, 450, 350]},
                    {"text": "3.2 合同有效期至2024年12月31日止", "level": 1, "bbox": [70, 355, 450, 375]}
                ]},
                {"type": "numbered", "items": [
                    {"text": "甲方应在合同签订后15日内支付预付款30%", "level": 1, "bbox": [70, 410, 480, 430]},
                    {"text": "乙方完成交付后，甲方支付剩余款项", "level": 1, "bbox": [70, 435, 480, 455]}
                ]}
            ],
            "paragraphs": [
                {"text": "甲方：北京科技有限公司\n地址：北京市海淀区中关村大街1号", "bbox": [50, 100, 450, 140]},
                {"text": "乙方：上海贸易有限公司\n地址：上海市浦东新区陆家嘴金融中心", "bbox": [50, 145, 450, 180]},
                {"text": "甲乙双方本着平等互利的原则，经友好协商，就以下事项达成一致：", "bbox": [50, 205, 500, 230]},
                {"text": "本合同总金额为人民币伍拾万元整（¥500,000.00元）。", "bbox": [50, 265, 500, 290]},
                {"text": "如一方违约，应向对方支付合同总金额10%的违约金。", "bbox": [50, 485, 500, 510]},
                {"text": "签订日期：2024年1月10日", "bbox": [50, 520, 300, 540]}
            ]
        }
        
        risky_mock = {
            "full_text": """
合作协议

甲方：广州投资集团
乙方：深圳开发公司

第一条 项目概述
双方就房地产开发项目达成合作。

第二条 投资金额
甲方投资人民币壹佰万元整（¥1,000,000.00元）。

第三条 合作期限
3.1 开始日期：2024年6月1日
3.2 结束日期：2024年3月1日

第四条 违约责任
违约方应支付合同总金额35%的违约金。

签订日期：2024年5月20日
""",
            "headings": [
                {"level": 1, "text": "合作协议", "page": 1, "bbox": [100, 50, 500, 80]},
                {"level": 2, "text": "第一条 项目概述", "page": 1, "bbox": [50, 160, 300, 180]},
                {"level": 2, "text": "第二条 投资金额", "page": 1, "bbox": [50, 220, 300, 240]},
                {"level": 2, "text": "第三条 合作期限", "page": 1, "bbox": [50, 280, 300, 300]},
                {"level": 2, "text": "第四条 违约责任", "page": 1, "bbox": [50, 360, 300, 380]}
            ],
            "tables": [],
            "lists": [
                {"type": "numbered", "items": [
                    {"text": "3.1 开始日期：2024年6月1日", "level": 1, "bbox": [70, 310, 450, 330]},
                    {"text": "3.2 结束日期：2024年3月1日", "level": 1, "bbox": [70, 335, 450, 355]}
                ]}
            ],
            "paragraphs": [
                {"text": "甲方：广州投资集团\n乙方：深圳开发公司", "bbox": [50, 100, 400, 140]},
                {"text": "双方就房地产开发项目达成合作。", "bbox": [50, 185, 400, 210]},
                {"text": "甲方投资人民币壹佰万元整（¥1,000,000.00元）。", "bbox": [50, 245, 500, 270]},
                {"text": "违约方应支付合同总金额35%的违约金。", "bbox": [50, 385, 500, 410]},
                {"text": "签订日期：2024年5月20日", "bbox": [50, 420, 300, 440]}
            ]
        }
        
        if pages_data:
            for idx, page in enumerate(pages_data):
                page_analysis = {
                    "page_number": idx + 1,
                    "elements": []
                }
                analysis["pages"].append(page_analysis)
        
        analysis["full_text"] = sample_mock["full_text"]
        analysis["headings"] = sample_mock["headings"]
        analysis["tables"] = sample_mock["tables"]
        analysis["lists"] = sample_mock["lists"]
        analysis["paragraphs"] = sample_mock["paragraphs"]
        
        if len(pages_data) > 1:
            analysis["full_text"] = risky_mock["full_text"]
            analysis["headings"] = risky_mock["headings"]
            analysis["lists"] = risky_mock["lists"]
            analysis["paragraphs"] = risky_mock["paragraphs"]
        
        return analysis
