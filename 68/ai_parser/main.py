import os
import uuid
import logging
from typing import List, Dict, Any, Optional, Union
from pathlib import Path

from .config import AppConfig
from .preprocess import DocumentPreprocessor
from .semantic_extraction import SemanticExtractor, ExtractionResult
from .inference import InferenceScheduler
from .storage import ResultStorage, StructuredResult, ResultFormatter

logger = logging.getLogger(__name__)


class AIDocumentParser:
    def __init__(self, config: Optional[AppConfig] = None, backend_type: str = "mock"):
        self.config = config or AppConfig()
        self._setup_logging()

        logger.info("Initializing AI Document Parser...")

        self.preprocessor = DocumentPreprocessor(self.config.preprocess)
        self.inference_scheduler = InferenceScheduler(self.config)
        self.extractor = SemanticExtractor(self.config.extraction, self.inference_scheduler)
        self.storage = ResultStorage(self.config.storage)

        self.inference_scheduler.initialize_model(backend_type)
        self.inference_scheduler.start()

        logger.info("AI Document Parser initialized successfully")

    def _setup_logging(self):
        log_level = getattr(self.config, "log_level", "INFO")
        logging.basicConfig(
            level=getattr(logging, log_level),
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        )

    def parse_document(
        self,
        file_path: str,
        extraction_tasks: Optional[List[str]] = None,
        domain: Optional[str] = None,
        save_results: bool = True,
    ) -> StructuredResult:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        logger.info(f"Parsing document: {file_path}")

        preprocessed = self.preprocessor.process_file(file_path)
        if not preprocessed:
            raise ValueError(f"Failed to preprocess file: {file_path}")

        document_id = str(uuid.uuid4())
        full_text = preprocessed["raw_text"]

        extraction_results: Dict[str, Any] = {}
        all_entities: List[Dict[str, Any]] = []
        all_relations: List[Dict[str, Any]] = []
        all_tables: List[Dict[str, Any]] = []
        summary = ""
        key_points: List[str] = []
        total_confidence = 0.0
        task_count = 0

        default_tasks = ["entity_extraction", "document_summarization"]
        tasks = extraction_tasks or default_tasks

        for task in tasks:
            try:
                result = self._execute_extraction_task(task, full_text, domain)
                if result.success:
                    extraction_results[task] = result.data
                    total_confidence += result.confidence
                    task_count += 1

                    if task == "entity_extraction":
                        all_entities = result.data.get("entities", [])
                    elif task == "relation_extraction":
                        all_relations = result.data.get("relations", [])
                    elif task == "document_summarization":
                        summary = result.data.get("summary", "")
                        key_points = result.data.get("key_points", [])
                    elif task == "table_extraction":
                        all_tables = result.data.get("tables", [])

                logger.info(f"Task '{task}' completed: {result.success}")

            except Exception as e:
                logger.error(f"Task '{task}' failed: {e}")
                extraction_results[task] = {"error": str(e)}

        for table in preprocessed.get("tables", []):
            all_tables.append({"raw_data": table})

        avg_confidence = total_confidence / task_count if task_count > 0 else 0.0

        structured_result = StructuredResult(
            document_id=document_id,
            document_name=preprocessed["file_name"],
            file_type=preprocessed["file_type"],
            file_path=file_path,
            extraction_results=extraction_results,
            summary=summary,
            key_points=key_points,
            entities=all_entities,
            relations=all_relations,
            tables=all_tables,
            metadata={
                **preprocessed["metadata"],
                "chunk_count": preprocessed["chunk_count"],
            },
            confidence=avg_confidence,
        )

        if save_results:
            self.storage.save(structured_result)
            logger.info(f"Results saved for document: {document_id}")

        return structured_result

    def parse_directory(
        self,
        dir_path: str,
        recursive: bool = True,
        extraction_tasks: Optional[List[str]] = None,
        domain: Optional[str] = None,
        save_results: bool = True,
    ) -> List[StructuredResult]:
        if not os.path.isdir(dir_path):
            raise NotADirectoryError(f"Directory not found: {dir_path}")

        logger.info(f"Parsing directory: {dir_path}")

        preprocessed_docs = self.preprocessor.process_directory(dir_path, recursive=recursive)
        results = []

        for doc in preprocessed_docs:
            try:
                result = self._parse_preprocessed(doc, extraction_tasks, domain, save_results)
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to parse {doc['file_path']}: {e}")

        logger.info(f"Completed parsing {len(results)} documents")
        return results

    def parse_files(
        self,
        file_paths: List[str],
        extraction_tasks: Optional[List[str]] = None,
        domain: Optional[str] = None,
        save_results: bool = True,
    ) -> List[StructuredResult]:
        logger.info(f"Parsing {len(file_paths)} files")

        results = []
        for file_path in file_paths:
            try:
                result = self.parse_document(file_path, extraction_tasks, domain, save_results)
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to parse {file_path}: {e}")

        return results

    def batch_parse(
        self,
        inputs: Union[str, List[str]],
        **kwargs,
    ) -> List[StructuredResult]:
        if isinstance(inputs, str):
            if os.path.isdir(inputs):
                return self.parse_directory(inputs, **kwargs)
            elif os.path.isfile(inputs):
                result = self.parse_document(inputs, **kwargs)
                return [result]
        elif isinstance(inputs, list):
            return self.parse_files(inputs, **kwargs)
        return []

    def _parse_preprocessed(
        self,
        preprocessed: Dict[str, Any],
        extraction_tasks: Optional[List[str]] = None,
        domain: Optional[str] = None,
        save_results: bool = True,
    ) -> StructuredResult:
        document_id = str(uuid.uuid4())
        full_text = preprocessed["raw_text"]

        extraction_results: Dict[str, Any] = {}
        all_entities: List[Dict[str, Any]] = []
        all_relations: List[Dict[str, Any]] = []
        all_tables: List[Dict[str, Any]] = []
        summary = ""
        key_points: List[str] = []
        total_confidence = 0.0
        task_count = 0

        default_tasks = ["entity_extraction", "document_summarization"]
        tasks = extraction_tasks or default_tasks

        for task in tasks:
            try:
                result = self._execute_extraction_task(task, full_text, domain)
                if result.success:
                    extraction_results[task] = result.data
                    total_confidence += result.confidence
                    task_count += 1

                    if task == "entity_extraction":
                        all_entities = result.data.get("entities", [])
                    elif task == "relation_extraction":
                        all_relations = result.data.get("relations", [])
                    elif task == "document_summarization":
                        summary = result.data.get("summary", "")
                        key_points = result.data.get("key_points", [])

            except Exception as e:
                logger.error(f"Task '{task}' failed: {e}")
                extraction_results[task] = {"error": str(e)}

        for table in preprocessed.get("tables", []):
            all_tables.append({"raw_data": table})

        avg_confidence = total_confidence / task_count if task_count > 0 else 0.0

        structured_result = StructuredResult(
            document_id=document_id,
            document_name=preprocessed["file_name"],
            file_type=preprocessed["file_type"],
            file_path=preprocessed["file_path"],
            extraction_results=extraction_results,
            summary=summary,
            key_points=key_points,
            entities=all_entities,
            relations=all_relations,
            tables=all_tables,
            metadata={
                **preprocessed["metadata"],
                "chunk_count": preprocessed["chunk_count"],
            },
            confidence=avg_confidence,
        )

        if save_results:
            self.storage.save(structured_result)

        return structured_result

    def _execute_extraction_task(
        self,
        task_type: str,
        text: str,
        domain: Optional[str] = None,
    ) -> ExtractionResult:
        task_methods = {
            "entity_extraction": lambda: self.extractor.extract_entities(text, domain=domain),
            "relation_extraction": lambda: self.extractor.extract_relations(text, entities=[], domain=domain),
            "key_info_extraction": lambda: self.extractor.extract_key_info(text, info_fields=[], domain=domain),
            "document_classification": lambda: self.extractor.classify_document(text, categories=[], domain=domain),
            "document_summarization": lambda: self.extractor.summarize_document(text, domain=domain),
            "medical_extraction": lambda: self.extractor.extract_medical_info(text),
            "finance_extraction": lambda: self.extractor.extract_finance_info(text),
            "legal_extraction": lambda: self.extractor.extract_legal_info(text),
        }

        if task_type not in task_methods:
            raise ValueError(f"Unknown extraction task: {task_type}")

        return task_methods[task_type]()

    def extract_custom(
        self,
        file_path: str,
        template_name: str,
        variables: Dict[str, Any],
        save_results: bool = True,
    ) -> StructuredResult:
        preprocessed = self.preprocessor.process_file(file_path)
        if not preprocessed:
            raise ValueError(f"Failed to preprocess file: {file_path}")

        document_id = str(uuid.uuid4())
        full_text = preprocessed["raw_text"]

        variables["text"] = variables.get("text", full_text)
        result = self.extractor.extract_custom(template_name, variables)

        structured_result = StructuredResult(
            document_id=document_id,
            document_name=preprocessed["file_name"],
            file_type=preprocessed["file_type"],
            file_path=file_path,
            extraction_results={"custom": result.data if result.success else {"error": result.error}},
            metadata=preprocessed["metadata"],
            confidence=result.confidence,
        )

        if save_results:
            self.storage.save(structured_result)

        return structured_result

    def answer_question(self, file_path: str, question: str, domain: Optional[str] = None) -> Dict[str, Any]:
        preprocessed = self.preprocessor.process_file(file_path)
        if not preprocessed:
            raise ValueError(f"Failed to preprocess file: {file_path}")

        full_text = preprocessed["raw_text"]
        result = self.extractor.answer_question(full_text, question, domain)

        return {
            "question": question,
            "answer": result.data.get("answer", "") if result.success else "",
            "confidence": result.confidence,
            "evidence": result.data.get("evidence", []) if result.success else [],
            "answerable": result.data.get("answerable", False) if result.success else False,
            "success": result.success,
            "error": result.error,
        }

    def get_stats(self) -> Dict[str, Any]:
        return {
            "inference": self.inference_scheduler.get_stats().__dict__,
            "supported_formats": self.preprocessor.get_supported_formats(),
            "available_tasks": self.extractor.list_available_tasks(),
            "output_dir": self.storage.get_output_dir(),
        }

    def close(self):
        logger.info("Closing AI Document Parser...")
        self.inference_scheduler.stop()
        logger.info("AI Document Parser closed")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
