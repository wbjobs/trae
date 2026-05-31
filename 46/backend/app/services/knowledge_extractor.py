import json
import re
import uuid
from typing import List, Optional, Dict, Any, Tuple
from ..config import settings
from ..schemas.document import Entity, Relation, KnowledgeGraph


class KnowledgeExtractorService:
    def __init__(self):
        self.use_llm = bool(settings.OPENAI_API_KEY)
        self._init_llm()

    def _init_llm(self):
        if not self.use_llm:
            return
        try:
            from langchain_openai import ChatOpenAI
            from langchain_core.prompts import ChatPromptTemplate

            self.llm = ChatOpenAI(
                api_key=settings.OPENAI_API_KEY,
                model_name=settings.OPENAI_MODEL,
                temperature=0.1
            )

            self.entity_extraction_prompt = ChatPromptTemplate.from_messages([
                ("system", """你是一个专业的知识抽取助手。请从给定的文本中抽取实体和关系。

实体类型包括但不限于：
- 人物 (PERSON)
- 组织 (ORGANIZATION)
- 地点 (LOCATION)
- 时间 (TIME)
- 事件 (EVENT)
- 产品 (PRODUCT)
- 技术 (TECHNOLOGY)
- 概念 (CONCEPT)
- 项目 (PROJECT)
- 文档 (DOCUMENT)

关系类型包括但不限于：
- 属于 (BELONGS_TO)
- 位于 (LOCATED_AT)
- 工作于 (WORKS_FOR)
- 创建 (CREATED)
- 使用 (USES)
- 参与 (PARTICIPATES_IN)
- 包含 (CONTAINS)
- 关联 (RELATED_TO)
- 管理 (MANAGES)
- 开发 (DEVELOPS)

请严格按照 JSON 格式输出，格式如下：
{
  "entities": [
    {"name": "实体名称", "type": "实体类型", "description": "实体描述"}
  ],
  "relations": [
    {"source": "源实体名称", "target": "目标实体名称", "type": "关系类型", "description": "关系描述"}
  ]
}

只输出 JSON，不要输出其他内容。"""),
                ("human", "请从以下文本中抽取实体和关系：\n\n{text}")
            ])

        except Exception as e:
            print(f"初始化 LLM 失败: {e}")
            self.use_llm = False

    def extract(self, text: str, max_length: int = 8000) -> KnowledgeGraph:
        if not text or len(text.strip()) == 0:
            return KnowledgeGraph(entities=[], relations=[])

        truncated_text = text[:max_length]

        if self.use_llm:
            return self._extract_with_llm(truncated_text)
        else:
            return self._extract_with_rules(truncated_text)

    def _extract_with_llm(self, text: str) -> KnowledgeGraph:
        try:
            chain = self.entity_extraction_prompt | self.llm
            result = chain.invoke({"text": text})

            content = result.content.strip()
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                json_str = json_match.group(0)
                data = json.loads(json_str)
                return self._parse_kg_data(data)
        except Exception as e:
            print(f"LLM 抽取失败: {e}")

        return self._extract_with_rules(text)

    def _extract_with_rules(self, text: str) -> KnowledgeGraph:
        entities: List[Entity] = []
        relations: List[Relation] = []
        entity_map: Dict[str, Entity] = {}

        org_patterns = [
            r'([\u4e00-\u9fa5A-Za-z0-9]+(?:公司|集团|研究院|研究所|大学|学院|中心|部门|团队))',
            r'([A-Z][a-zA-Z]+\s(?:Inc|Ltd|Corp|LLC|Group)\.?)'
        ]
        for pattern in org_patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                name = match.strip()
                if len(name) > 2 and name not in entity_map:
                    entity = Entity(
                        entity_id=str(uuid.uuid4()),
                        name=name,
                        type="ORGANIZATION",
                        description=f"从文本中识别的组织: {name}"
                    )
                    entity_map[name] = entity
                    entities.append(entity)

        person_patterns = [
            r'([\u4e00-\u9fa5]{2,4}(?:先生|女士|博士|教授|工程师))',
            r'([A-Z][a-z]+\s[A-Z][a-z]+)'
        ]
        for pattern in person_patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                name = match.strip()
                if len(name) > 1 and name not in entity_map:
                    entity = Entity(
                        entity_id=str(uuid.uuid4()),
                        name=name,
                        type="PERSON",
                        description=f"从文本中识别的人物: {name}"
                    )
                    entity_map[name] = entity
                    entities.append(entity)

        tech_patterns = [
            r'([A-Za-z0-9]+(?:\.py|\.js|\.java|\.cpp|\.ts|API|SDK|框架|库|算法|模型|系统|平台))',
            r'([\u4e00-\u9fa5A-Za-z0-9]+(?:技术|方法|方案))'
        ]
        for pattern in tech_patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                name = match.strip()
                if len(name) > 2 and name not in entity_map:
                    entity = Entity(
                        entity_id=str(uuid.uuid4()),
                        name=name,
                        type="TECHNOLOGY",
                        description=f"从文本中识别的技术: {name}"
                    )
                    entity_map[name] = entity
                    entities.append(entity)

        doc_patterns = [
            r'([\u4e00-\u9fa5A-Za-z0-9]+(?:报告|文档|合同|协议|方案|计划书|论文|文章))'
        ]
        for pattern in doc_patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                name = match.strip()
                if len(name) > 2 and name not in entity_map:
                    entity = Entity(
                        entity_id=str(uuid.uuid4()),
                        name=name,
                        type="DOCUMENT",
                        description=f"从文本中识别的文档: {name}"
                    )
                    entity_map[name] = entity
                    entities.append(entity)

        entity_names = list(entity_map.keys())
        for i, name1 in enumerate(entity_names):
            for name2 in entity_names[i + 1:]:
                pattern = rf'{re.escape(name1)}.{{0,50}}{re.escape(name2)}'
                if re.search(pattern, text):
                    relation = Relation(
                        relation_id=str(uuid.uuid4()),
                        source_id=entity_map[name1].entity_id,
                        target_id=entity_map[name2].entity_id,
                        type="RELATED_TO",
                        description=f"{name1} 与 {name2} 存在关联"
                    )
                    relations.append(relation)

        return KnowledgeGraph(entities=entities, relations=relations)

    def _parse_kg_data(self, data: Dict[str, Any]) -> KnowledgeGraph:
        entities: List[Entity] = []
        relations: List[Relation] = []
        entity_map: Dict[str, str] = {}

        for ent_data in data.get("entities", []):
            entity_id = str(uuid.uuid4())
            name = ent_data.get("name", "").strip()
            if not name:
                continue

            entity = Entity(
                entity_id=entity_id,
                name=name,
                type=ent_data.get("type", "CONCEPT"),
                description=ent_data.get("description", ""),
                attributes=ent_data.get("attributes", {})
            )
            entities.append(entity)
            entity_map[name] = entity_id

        for rel_data in data.get("relations", []):
            source_name = rel_data.get("source", "")
            target_name = rel_data.get("target", "")

            source_id = entity_map.get(source_name)
            target_id = entity_map.get(target_name)

            if source_id and target_id:
                relation = Relation(
                    relation_id=str(uuid.uuid4()),
                    source_id=source_id,
                    target_id=target_id,
                    type=rel_data.get("type", "RELATED_TO"),
                    description=rel_data.get("description", "")
                )
                relations.append(relation)

        return KnowledgeGraph(entities=entities, relations=relations)
