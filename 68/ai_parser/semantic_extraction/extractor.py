import json
import re
import logging
from typing import List, Dict, Any, Optional, Union, Tuple
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from ..prompts import PromptTemplateLibrary

logger = logging.getLogger(__name__)


class EntityMatcher:
    SYNONYM_MAP = {
        "person": ["人名", "个人", "自然人", "患者", "客户", "用户"],
        "organization": ["组织", "机构", "公司", "企业", "单位", "部门", "医院", "学校"],
        "location": ["地点", "位置", "地址", "地方", "城市", "国家", "区域"],
        "date": ["日期", "时间", "年月日", "期限"],
        "money": ["金额", "价格", "费用", "成本", "预算", "收入", "支出"],
        "product": ["产品", "商品", "项目", "服务"],
    }

    @staticmethod
    def normalize_text(text: str) -> str:
        if not text:
            return ""
        text = text.strip()
        text = re.sub(r"\s+", " ", text)
        text = text.lower()
        return text

    @staticmethod
    def is_similar(text1: str, text2: str, threshold: float = 0.85) -> bool:
        if not text1 or not text2:
            return False
        norm1 = EntityMatcher.normalize_text(text1)
        norm2 = EntityMatcher.normalize_text(text2)
        if norm1 == norm2:
            return True
        if norm1 in norm2 or norm2 in norm1:
            return True
        similarity = SequenceMatcher(None, norm1, norm2).ratio()
        return similarity >= threshold

    @staticmethod
    def get_type_synonyms(entity_type: str) -> List[str]:
        entity_type = entity_type.lower()
        synonyms = [entity_type]
        for key, values in EntityMatcher.SYNONYM_MAP.items():
            if entity_type == key or entity_type in values:
                synonyms.extend(values)
        return list(set(synonyms))

    @staticmethod
    def is_entity_match(
        entity1: Dict[str, Any],
        entity2: Dict[str, Any],
        check_type: bool = True,
    ) -> bool:
        text1 = entity1.get("text", "")
        text2 = entity2.get("text", "")
        if not EntityMatcher.is_similar(text1, text2):
            return False
        if check_type:
            type1 = entity1.get("type", "").lower()
            type2 = entity2.get("type", "").lower()
            if type1 and type2 and type1 != type2:
                synonyms1 = EntityMatcher.get_type_synonyms(type1)
                if type2 not in synonyms1:
                    return False
        return True

    @staticmethod
    def deduplicate_entities(entities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not entities:
            return []
        unique_entities = []
        for entity in entities:
            is_duplicate = False
            for i, existing in enumerate(unique_entities):
                if EntityMatcher.is_entity_match(entity, existing):
                    if entity.get("confidence", 0) > existing.get("confidence", 0):
                        unique_entities[i] = entity
                    is_duplicate = True
                    break
            if not is_duplicate:
                unique_entities.append(entity)
        return unique_entities

    @staticmethod
    def validate_entity_in_text(entity: Dict[str, Any], source_text: str) -> bool:
        entity_text = entity.get("text", "")
        if not entity_text or not source_text:
            return False
        norm_entity = EntityMatcher.normalize_text(entity_text)
        norm_source = EntityMatcher.normalize_text(source_text)
        if norm_entity in norm_source:
            return True
        words = norm_entity.split()
        if all(word in norm_source for word in words):
            return True
        return False

    @staticmethod
    def filter_entities_by_confidence(
        entities: List[Dict[str, Any]],
        min_confidence: float = 0.5,
    ) -> List[Dict[str, Any]]:
        return [
            e for e in entities
            if e.get("confidence", 1.0) >= min_confidence
        ]


@dataclass
class ExtractionTask:
    task_type: str
    template_name: str
    variables: Dict[str, Any] = field(default_factory=dict)
    output_format: str = "json"


@dataclass
class ExtractionResult:
    task_type: str
    success: bool
    data: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    raw_response: Optional[str] = None
    confidence: float = 0.0


class SemanticExtractor:
    def __init__(self, config: Any = None, inference_scheduler=None):
        self.config = config
        self.inference_scheduler = inference_scheduler
        self.prompt_library = PromptTemplateLibrary()
        self.domain = getattr(config, "domain", "general") if config else "general"
        self.entity_matcher = EntityMatcher()
        self.confidence_threshold = getattr(
            config, "confidence_threshold", 0.5
        ) if config else 0.5

    def set_inference_scheduler(self, scheduler):
        self.inference_scheduler = scheduler

    def extract_entities(
        self,
        text: str,
        entity_types: Optional[List[str]] = None,
        domain: Optional[str] = None,
    ) -> ExtractionResult:
        domain = domain or self.domain
        entity_types = entity_types or (
            self.config.entity_types if self.config and hasattr(self.config, "entity_types")
            else ["person", "organization", "location", "date", "money", "product"]
        )

        task = ExtractionTask(
            task_type="entity_extraction",
            template_name="entity_extraction",
            variables={
                "text": text,
                "domain": domain,
                "entity_types": ", ".join(entity_types),
            },
        )
        result = self._execute_task(task)

        if result.success and "entities" in result.data:
            entities = result.data["entities"]
            entities = self._validate_and_clean_entities(entities, text)
            result.data["entities"] = entities
            result.data["entity_count"] = len(entities)

        return result

    def extract_relations(
        self,
        text: str,
        entities: List[Dict[str, Any]],
        relation_types: Optional[List[str]] = None,
        domain: Optional[str] = None,
    ) -> ExtractionResult:
        domain = domain or self.domain
        relation_types = relation_types or (
            self.config.relation_types if self.config and hasattr(self.config, "relation_types")
            else ["belong_to", "located_at", "work_for", "produce"]
        )

        entities_text = json.dumps(entities, ensure_ascii=False, indent=2)
        task = ExtractionTask(
            task_type="relation_extraction",
            template_name="relation_extraction",
            variables={
                "text": text,
                "domain": domain,
                "entities": entities_text,
                "relation_types": ", ".join(relation_types),
            },
        )
        return self._execute_task(task)

    def extract_key_info(
        self,
        text: str,
        info_fields: List[str],
        domain: Optional[str] = None,
    ) -> ExtractionResult:
        domain = domain or self.domain
        task = ExtractionTask(
            task_type="key_info_extraction",
            template_name="key_info_extraction",
            variables={
                "text": text,
                "domain": domain,
                "info_fields": ", ".join(info_fields),
            },
        )
        return self._execute_task(task)

    def classify_document(
        self,
        text: str,
        categories: List[str],
        domain: Optional[str] = None,
    ) -> ExtractionResult:
        domain = domain or self.domain
        task = ExtractionTask(
            task_type="document_classification",
            template_name="document_classification",
            variables={
                "text": text,
                "domain": domain,
                "categories": ", ".join(categories),
            },
        )
        return self._execute_task(task)

    def extract_table(
        self,
        table_text: str,
        table_context: str = "",
        domain: Optional[str] = None,
    ) -> ExtractionResult:
        domain = domain or self.domain
        task = ExtractionTask(
            task_type="table_extraction",
            template_name="table_extraction",
            variables={
                "table_text": table_text,
                "domain": domain,
                "table_context": table_context,
            },
        )
        return self._execute_task(task)

    def summarize_document(
        self,
        text: str,
        summary_length: str = "medium",
        domain: Optional[str] = None,
    ) -> ExtractionResult:
        domain = domain or self.domain
        task = ExtractionTask(
            task_type="document_summarization",
            template_name="document_summarization",
            variables={
                "text": text,
                "domain": domain,
                "summary_length": summary_length,
            },
        )
        return self._execute_task(task)

    def answer_question(
        self,
        text: str,
        question: str,
        domain: Optional[str] = None,
    ) -> ExtractionResult:
        domain = domain or self.domain
        task = ExtractionTask(
            task_type="content_qa",
            template_name="content_qa",
            variables={
                "text": text,
                "domain": domain,
                "question": question,
            },
        )
        return self._execute_task(task)

    def extract_medical_info(self, text: str) -> ExtractionResult:
        task = ExtractionTask(
            task_type="medical_extraction",
            template_name="medical_extraction",
            variables={"text": text},
        )
        return self._execute_task(task)

    def extract_finance_info(self, text: str) -> ExtractionResult:
        task = ExtractionTask(
            task_type="finance_extraction",
            template_name="finance_extraction",
            variables={"text": text},
        )
        return self._execute_task(task)

    def extract_legal_info(self, text: str) -> ExtractionResult:
        task = ExtractionTask(
            task_type="legal_extraction",
            template_name="legal_extraction",
            variables={"text": text},
        )
        return self._execute_task(task)

    def extract_custom(
        self,
        template_name: str,
        variables: Dict[str, Any],
        task_type: str = "custom",
    ) -> ExtractionResult:
        task = ExtractionTask(
            task_type=task_type,
            template_name=template_name,
            variables=variables,
        )
        return self._execute_task(task)

    def batch_extract(
        self,
        tasks: List[Dict[str, Any]],
    ) -> List[ExtractionResult]:
        results = []
        for task_config in tasks:
            try:
                task_type = task_config.get("task_type", "custom")
                template_name = task_config.get("template_name", task_type)
                variables = task_config.get("variables", {})

                result = self.extract_custom(template_name, variables, task_type)
                results.append(result)
            except Exception as e:
                logger.error(f"Batch extraction task failed: {e}")
                results.append(
                    ExtractionResult(
                        task_type=task_config.get("task_type", "unknown"),
                        success=False,
                        error=str(e),
                    )
                )
        return results

    def _execute_task(self, task: ExtractionTask) -> ExtractionResult:
        if not self.inference_scheduler:
            return ExtractionResult(
                task_type=task.task_type,
                success=False,
                error="Inference scheduler not configured",
            )

        try:
            prompt = self.prompt_library.format_prompt(
                task.template_name, **task.variables
            )

            response = self.inference_scheduler.generate(prompt)

            parsed_data = self._parse_response(response, task.output_format)

            confidence = parsed_data.get("confidence", 0.0) if isinstance(parsed_data, dict) else 0.0

            return ExtractionResult(
                task_type=task.task_type,
                success=True,
                data=parsed_data,
                raw_response=response,
                confidence=confidence,
            )

        except Exception as e:
            logger.error(f"Extraction task '{task.task_type}' failed: {e}")
            return ExtractionResult(
                task_type=task.task_type,
                success=False,
                error=str(e),
            )

    def _parse_response(self, response: str, output_format: str) -> Dict[str, Any]:
        if output_format == "json":
            return self._parse_json_response(response)
        return {"raw_text": response}

    def _parse_json_response(self, response: str) -> Dict[str, Any]:
        response = response.strip()

        json_start = response.find("{")
        json_end = response.rfind("}") + 1

        if json_start >= 0 and json_end > json_start:
            json_str = response[json_start:json_end]
            try:
                return json.loads(json_str)
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse JSON: {e}")

        try:
            return json.loads(response)
        except json.JSONDecodeError:
            logger.warning("Falling back to raw text extraction")
            return {"raw_text": response}

    def register_custom_template(self, template) -> None:
        self.prompt_library.register_template(template)

    def list_available_tasks(self) -> List[str]:
        return self.prompt_library.list_templates()

    def _validate_and_clean_entities(
        self,
        entities: List[Dict[str, Any]],
        source_text: str,
    ) -> List[Dict[str, Any]]:
        if not entities:
            return []

        valid_entities = []
        for entity in entities:
            if not isinstance(entity, dict):
                continue
            entity_text = entity.get("text", "").strip()
            if not entity_text:
                continue
            if len(entity_text) > 100:
                continue
            if not self.entity_matcher.validate_entity_in_text(entity, source_text):
                entity["confidence"] = max(
                    entity.get("confidence", 0.0) - 0.3,
                    0.1
                )
            if entity.get("confidence", 0) < self.confidence_threshold:
                if len(entity_text) < 2:
                    continue
            valid_entities.append(entity)

        valid_entities = self.entity_matcher.deduplicate_entities(valid_entities)
        valid_entities = sorted(
            valid_entities,
            key=lambda x: x.get("confidence", 0),
            reverse=True
        )

        return valid_entities

    def validate_keywords(
        self,
        keywords: List[str],
        source_text: str,
        min_length: int = 2,
    ) -> List[str]:
        valid_keywords = []
        for keyword in keywords:
            keyword = keyword.strip()
            if len(keyword) < min_length:
                continue
            norm_keyword = EntityMatcher.normalize_text(keyword)
            norm_source = EntityMatcher.normalize_text(source_text)
            if norm_keyword in norm_source:
                valid_keywords.append(keyword)
        return list(dict.fromkeys(valid_keywords))

    def match_keywords(
        self,
        text: str,
        keywords: List[str],
        fuzzy_match: bool = True,
    ) -> List[Dict[str, Any]]:
        matches = []
        norm_text = EntityMatcher.normalize_text(text)

        for keyword in keywords:
            norm_keyword = EntityMatcher.normalize_text(keyword)
            if not norm_keyword:
                continue

            found = False
            positions = []

            if norm_keyword in norm_text:
                found = True
                start = 0
                while True:
                    pos = norm_text.find(norm_keyword, start)
                    if pos == -1:
                        break
                    positions.append(pos)
                    start = pos + 1
            elif fuzzy_match:
                if EntityMatcher.is_similar(norm_keyword, norm_text, threshold=0.8):
                    found = True
                    positions.append(-1)

            if found:
                matches.append({
                    "keyword": keyword,
                    "normalized": norm_keyword,
                    "found": found,
                    "positions": positions,
                    "count": len(positions),
                })

        return matches
