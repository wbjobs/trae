import os
import logging
from typing import List, Dict, Any, Optional, Union
from pathlib import Path

from .format_adapter import FormatAdapterRegistry, DocumentContent
from .text_processor import TextProcessor, TextChunk

logger = logging.getLogger(__name__)


class DocumentPreprocessor:
    def __init__(self, config: Any = None):
        self.config = config
        self.format_registry = FormatAdapterRegistry(config)
        self.text_processor = TextProcessor(config)

    def process_file(self, file_path: str) -> Optional[Dict[str, Any]]:
        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")
            return None

        if not self.format_registry.is_supported(file_path):
            logger.warning(f"Unsupported file format: {file_path}")
            return None

        logger.info(f"Processing file: {file_path}")
        document_content = self.format_registry.extract(file_path)
        if not document_content:
            logger.error(f"Failed to extract content from {file_path}")
            return None

        chunks = self.text_processor.process(
            text=document_content.text,
            metadata=document_content.metadata,
            tables=document_content.tables,
        )

        result = {
            "file_path": file_path,
            "file_name": os.path.basename(file_path),
            "file_type": document_content.file_type,
            "metadata": document_content.metadata,
            "raw_text": document_content.text,
            "chunks": [self._chunk_to_dict(chunk) for chunk in chunks],
            "tables": document_content.tables,
            "chunk_count": len(chunks),
        }

        logger.info(f"Processed {file_path}: {len(chunks)} chunks created")
        return result

    def process_directory(self, dir_path: str, recursive: bool = True, supported_formats: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        if not os.path.isdir(dir_path):
            logger.error(f"Directory not found: {dir_path}")
            return []

        results = []
        file_patterns = supported_formats or self._get_supported_extensions()

        for root, _, files in os.walk(dir_path):
            for file in files:
                file_path = os.path.join(root, file)
                ext = Path(file_path).suffix.lower()

                if ext in file_patterns:
                    result = self.process_file(file_path)
                    if result:
                        results.append(result)

            if not recursive:
                break

        logger.info(f"Processed {len(results)} files from directory")
        return results

    def process_files(self, file_paths: List[str]) -> List[Dict[str, Any]]:
        results = []
        for file_path in file_paths:
            result = self.process_file(file_path)
            if result:
                results.append(result)
        return results

    def batch_process(self, inputs: Union[str, List[str]], **kwargs) -> List[Dict[str, Any]]:
        if isinstance(inputs, str):
            if os.path.isdir(inputs):
                return self.process_directory(inputs, **kwargs)
            elif os.path.isfile(inputs):
                result = self.process_file(inputs)
                return [result] if result else []
        elif isinstance(inputs, list):
            return self.process_files(inputs)
        return []

    def is_supported(self, file_path: str) -> bool:
        return self.format_registry.is_supported(file_path)

    def get_supported_formats(self) -> List[str]:
        return self._get_supported_extensions()

    def clean_text(self, text: str) -> str:
        return self.text_processor.clean_text(text)

    def chunk_text(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        chunks = self.text_processor.chunk_text(text, metadata)
        return [self._chunk_to_dict(chunk) for chunk in chunks]

    def _get_supported_extensions(self) -> List[str]:
        if self.config and hasattr(self.config, "supported_formats"):
            return self.config.supported_formats
        return [".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".xls", ".csv", ".json", ".xml", ".html", ".eml", ".msg"]

    @staticmethod
    def _chunk_to_dict(chunk: TextChunk) -> Dict[str, Any]:
        return {
            "content": chunk.content,
            "metadata": chunk.metadata,
            "chunk_index": chunk.chunk_index,
            "start_pos": chunk.start_pos,
            "end_pos": chunk.end_pos,
            "char_count": len(chunk.content),
        }
