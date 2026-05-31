import os
import logging
from typing import List, Dict, Any, Optional, Union
from pathlib import Path

from .format_adapter import FormatAdapterRegistry, DocumentContent, EncodingDetector
from .text_processor import TextProcessor, TextChunk

logger = logging.getLogger(__name__)


class SimplePreprocessor:
    def __init__(self, config: Any = None):
        self.config = config
        self.format_registry = FormatAdapterRegistry(config)
        self.text_processor = TextProcessor(config)

    def process(self, input_data: Union[str, List[str]], **kwargs) -> List[Dict[str, Any]]:
        if isinstance(input_data, str):
            if os.path.isdir(input_data):
                return self.process_directory(input_data, **kwargs)
            elif os.path.isfile(input_data):
                result = self.process_file(input_data)
                return [result] if result else []
        elif isinstance(input_data, list):
            return self.process_files(input_data)
        return []

    def process_file(self, file_path: str) -> Optional[Dict[str, Any]]:
        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")
            return None

        if not self.format_registry.is_supported(file_path):
            logger.warning(f"Unsupported format: {file_path}")
            return None

        logger.debug(f"Processing: {file_path}")
        doc_content = self.format_registry.extract(file_path)
        if not doc_content:
            return None

        chunks = self.text_processor.process(
            text=doc_content.text,
            metadata=doc_content.metadata,
            tables=doc_content.tables,
        )

        return {
            "file_path": file_path,
            "file_name": os.path.basename(file_path),
            "file_type": doc_content.file_type,
            "metadata": doc_content.metadata,
            "text": doc_content.text,
            "chunks": [
                {
                    "content": chunk.content,
                    "metadata": chunk.metadata,
                    "chunk_index": chunk.chunk_index,
                }
                for chunk in chunks
            ],
            "tables": doc_content.tables,
            "chunk_count": len(chunks),
        }

    def process_directory(self, dir_path: str, recursive: bool = True) -> List[Dict[str, Any]]:
        if not os.path.isdir(dir_path):
            logger.error(f"Directory not found: {dir_path}")
            return []

        results = []
        supported_ext = self._get_supported_extensions()

        for root, _, files in os.walk(dir_path):
            for file in files:
                ext = Path(file).suffix.lower()
                if ext in supported_ext:
                    result = self.process_file(os.path.join(root, file))
                    if result:
                        results.append(result)
            if not recursive:
                break

        logger.info(f"Processed {len(results)} files from {dir_path}")
        return results

    def process_files(self, file_paths: List[str]) -> List[Dict[str, Any]]:
        results = []
        for file_path in file_paths:
            result = self.process_file(file_path)
            if result:
                results.append(result)
        return results

    def is_supported(self, file_path: str) -> bool:
        return self.format_registry.is_supported(file_path)

    def get_supported_formats(self) -> List[str]:
        return self._get_supported_extensions()

    def _get_supported_extensions(self) -> List[str]:
        if self.config and hasattr(self.config, "supported_formats"):
            return self.config.supported_formats
        return [
            ".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".xls",
            ".csv", ".json", ".xml", ".html", ".eml", ".msg",
        ]

    @staticmethod
    def extract_text(file_path: str) -> str:
        detector = EncodingDetector()
        text, encoding = detector.detect_and_read(file_path)
        return text

    @staticmethod
    def clean_text(text: str) -> str:
        from .text_processor import AdvancedTextCleaner
        cleaner = AdvancedTextCleaner()
        return cleaner.clean(text)

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 100) -> List[str]:
        from .text_processor import SemanticChunker
        chunker = SemanticChunker(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        chunks = chunker.chunk(text)
        return [chunk.content for chunk in chunks]
