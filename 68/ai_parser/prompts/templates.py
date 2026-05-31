from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field


@dataclass
class PromptTemplate:
    name: str
    template: str
    description: str = ""
    version: str = "1.0"
    variables: List[str] = field(default_factory=list)
    output_format: str = "json"

    def format(self, **kwargs) -> str:
        try:
            return self.template.format(**kwargs)
        except KeyError as e:
            raise ValueError(f"Missing required template variable: {e}")


class PromptTemplateLibrary:
    def __init__(self):
        self._templates: Dict[str, PromptTemplate] = {}
        self._register_default_templates()

    def _register_default_templates(self):
        entity_extraction = PromptTemplate(
            name="entity_extraction",
            description="从文本中抽取命名实体",
            version="1.0",
            variables=["text", "domain", "entity_types"],
            output_format="json",
            template="""你是一个专业的{domain}领域信息抽取专家。请从以下文本中抽取指定类型的实体。

待处理文本：
{text}

需要抽取的实体类型：
{entity_types}

请严格按照JSON格式返回结果，格式如下：
{{
  "entities": [
    {{
      "text": "实体文本",
      "type": "实体类型",
      "start_index": 0,
      "end_index": 0,
      "confidence": 0.95
    }}
  ]
}}

只返回JSON，不要包含其他说明文字。
""",
        )
        self.register_template(entity_extraction)

        relation_extraction = PromptTemplate(
            name="relation_extraction",
            description="从文本中抽取实体之间的关系",
            version="1.0",
            variables=["text", "domain", "relation_types", "entities"],
            output_format="json",
            template="""你是一个专业的{domain}领域信息抽取专家。请从以下文本中抽取实体之间的关系。

待处理文本：
{text}

已识别的实体：
{entities}

需要抽取的关系类型：
{relation_types}

请严格按照JSON格式返回结果，格式如下：
{{
  "relations": [
    {{
      "subject": "主体实体",
      "predicate": "关系类型",
      "object": "客体实体",
      "confidence": 0.9
    }}
  ]
}}

只返回JSON，不要包含其他说明文字。
""",
        )
        self.register_template(relation_extraction)

        key_info_extraction = PromptTemplate(
            name="key_info_extraction",
            description="从文档中抽取关键业务信息",
            version="1.0",
            variables=["text", "domain", "info_fields"],
            output_format="json",
            template="""你是一个专业的{domain}领域文档分析专家。请从以下文档内容中抽取指定的关键信息。

文档内容：
{text}

需要抽取的信息字段：
{info_fields}

请严格按照JSON格式返回结果，格式如下：
{{
  "extracted_info": {{
    "字段名1": "字段值1",
    "字段名2": "字段值2"
  }},
  "missing_fields": ["未找到的字段名"]
}}

如果某个字段未找到，值设为null。只返回JSON，不要包含其他说明文字。
""",
        )
        self.register_template(key_info_extraction)

        document_classification = PromptTemplate(
            name="document_classification",
            description="对文档进行分类和主题标记",
            version="1.0",
            variables=["text", "domain", "categories"],
            output_format="json",
            template="""你是一个专业的{domain}领域文档分类专家。请对以下文档进行分类。

文档内容：
{text}

可选分类：
{categories}

请严格按照JSON格式返回结果，格式如下：
{{
  "primary_category": "主要分类",
  "secondary_categories": ["次要分类1", "次要分类2"],
  "confidence": 0.95,
  "keywords": ["关键词1", "关键词2"]
}}

只返回JSON，不要包含其他说明文字。
""",
        )
        self.register_template(document_classification)

        table_extraction = PromptTemplate(
            name="table_extraction",
            description="从表格中提取结构化信息",
            version="1.0",
            variables=["table_text", "domain", "table_context"],
            output_format="json",
            template="""你是一个专业的{domain}领域数据提取专家。请从以下表格内容中提取关键信息。

表格上下文：
{table_context}

表格内容：
{table_text}

请严格按照JSON格式返回结果，格式如下：
{{
  "table_headers": ["列名1", "列名2"],
  "table_data": [
    {{"列名1": "值1", "列名2": "值2"}}
  ],
  "summary": "表格内容摘要",
  "key_metrics": {{
    "指标名": "指标值"
  }}
}}

只返回JSON，不要包含其他说明文字。
""",
        )
        self.register_template(table_extraction)

        document_summarization = PromptTemplate(
            name="document_summarization",
            description="生成文档摘要",
            version="1.0",
            variables=["text", "domain", "summary_length"],
            output_format="json",
            template="""你是一个专业的{domain}领域文档摘要专家。请为以下文档生成简明摘要。

文档内容：
{text}

摘要长度要求：{summary_length}

请严格按照JSON格式返回结果，格式如下：
{{
  "summary": "文档摘要内容",
  "key_points": ["要点1", "要点2"],
  "summary_length": 100
}}

只返回JSON，不要包含其他说明文字。
""",
        )
        self.register_template(document_summarization)

        content_qa = PromptTemplate(
            name="content_qa",
            description="基于文档内容回答问题",
            version="1.0",
            variables=["text", "domain", "question"],
            output_format="json",
            template="""你是一个专业的{domain}领域问答助手。请基于以下文档内容回答问题。

文档内容：
{text}

问题：{question}

请严格按照JSON格式返回结果，格式如下：
{{
  "answer": "回答内容",
  "confidence": 0.9,
  "evidence": ["证据片段1", "证据片段2"],
  "answerable": true
}}

如果无法从文档中找到答案，answerable设为false。只返回JSON，不要包含其他说明文字。
""",
        )
        self.register_template(content_qa)

        medical_extraction = PromptTemplate(
            name="medical_extraction",
            description="从医疗文档中抽取专业信息",
            version="1.0",
            variables=["text"],
            output_format="json",
            template="""你是一个专业的医疗信息抽取专家。请从以下医疗文档中抽取关键医疗信息。

医疗文档：
{text}

请严格按照JSON格式返回结果，格式如下：
{{
  "patient_info": {{
    "name": "",
    "age": "",
    "gender": ""
  }},
  "diagnosis": ["诊断1", "诊断2"],
  "symptoms": ["症状1", "症状2"],
  "medications": [
    {{
      "name": "药品名称",
      "dosage": "剂量",
      "frequency": "频率"
    }}
  ],
  "lab_results": [
    {{
      "test_name": "检查项目",
      "value": "结果值",
      "reference_range": "参考范围"
    }}
  ],
  "treatment_plan": "治疗方案"
}}

只返回JSON，不要包含其他说明文字。
""",
        )
        self.register_template(medical_extraction)

        finance_extraction = PromptTemplate(
            name="finance_extraction",
            description="从财务文档中抽取专业信息",
            version="1.0",
            variables=["text"],
            output_format="json",
            template="""你是一个专业的财务信息抽取专家。请从以下财务文档中抽取关键财务信息。

财务文档：
{text}

请严格按照JSON格式返回结果，格式如下：
{{
  "company_info": {{
    "name": "",
    "period": ""
  }},
  "financial_metrics": {{
    "revenue": 0,
    "profit": 0,
    "assets": 0,
    "liabilities": 0
  }},
  "key_transactions": [
    {{
      "date": "",
      "description": "",
      "amount": 0,
      "type": ""
    }}
  ],
  "risks": ["风险1", "风险2"],
  "summary": "财务摘要"
}}

金额单位统一为元。只返回JSON，不要包含其他说明文字。
""",
        )
        self.register_template(finance_extraction)

        legal_extraction = PromptTemplate(
            name="legal_extraction",
            description="从法律文档中抽取专业信息",
            version="1.0",
            variables=["text"],
            output_format="json",
            template="""你是一个专业的法律信息抽取专家。请从以下法律文档中抽取关键法律信息。

法律文档：
{text}

请严格按照JSON格式返回结果，格式如下：
{{
  "document_type": "",
  "parties": [
    {{
      "name": "",
      "role": ""
    }}
  ],
  "key_clauses": [
    {{
      "clause_type": "",
      "content": ""
    }}
  ],
  "obligations": ["义务1", "义务2"],
  "deadlines": ["时间节点1", "时间节点2"],
  "risks": ["法律风险1", "法律风险2"]
}}

只返回JSON，不要包含其他说明文字。
""",
        )
        self.register_template(legal_extraction)

    def register_template(self, template: PromptTemplate) -> None:
        self._templates[template.name] = template

    def get_template(self, name: str) -> Optional[PromptTemplate]:
        return self._templates.get(name)

    def list_templates(self) -> List[str]:
        return list(self._templates.keys())

    def remove_template(self, name: str) -> bool:
        if name in self._templates:
            del self._templates[name]
            return True
        return False

    def format_prompt(self, template_name: str, **kwargs) -> str:
        template = self.get_template(template_name)
        if not template:
            raise ValueError(f"Template '{template_name}' not found")
        return template.format(**kwargs)
