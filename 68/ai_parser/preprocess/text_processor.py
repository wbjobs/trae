import re
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


@dataclass
class TextChunk:
    content: str
    metadata: Dict[str, Any]
    chunk_index: int
    start_pos: int
    end_pos: int


class BaseTextCleaner(ABC):
    @abstractmethod
    def clean(self, text: str) -> str:
        pass


class BasicTextCleaner(BaseTextCleaner):
    def __init__(self, remove_whitespace: bool = True, remove_special_chars: bool = False, normalize_unicode: bool = True):
        self.remove_whitespace = remove_whitespace
        self.remove_special_chars = remove_special_chars
        self.normalize_unicode = normalize_unicode

    def clean(self, text: str) -> str:
        if not text:
            return ""

        if self.normalize_unicode:
            text = self._normalize_unicode(text)

        if self.remove_whitespace:
            text = self._normalize_whitespace(text)

        if self.remove_special_chars:
            text = self._remove_special_chars(text)

        return text.strip()

    def _normalize_unicode(self, text: str) -> str:
        try:
            import unicodedata
            text = unicodedata.normalize("NFKC", text)
        except Exception as e:
            logger.warning(f"Unicode normalization failed: {e}")
        return text

    def _normalize_whitespace(self, text: str) -> str:
        text = re.sub(r"\r\n|\r", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]+", " ", text)
        return text

    def _remove_special_chars(self, text: str) -> str:
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
        return text


class AdvancedTextCleaner(BasicTextCleaner):
    def __init__(self, remove_urls: bool = True, remove_emails: bool = True, remove_html_tags: bool = True, **kwargs):
        super().__init__(**kwargs)
        self.remove_urls = remove_urls
        self.remove_emails = remove_emails
        self.remove_html_tags = remove_html_tags

    def clean(self, text: str) -> str:
        text = super().clean(text)

        if self.remove_urls:
            text = re.sub(r"https?://\S+|www\.\S+", "[URL]", text)

        if self.remove_emails:
            text = re.sub(r"[\w\.-]+@[\w\.-]+\.\w+", "[EMAIL]", text)

        if self.remove_html_tags:
            text = re.sub(r"<[^>]+>", "", text)

        return text


class BaseChunker(ABC):
    @abstractmethod
    def chunk(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> List[TextChunk]:
        pass


class FixedSizeChunker(BaseChunker):
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 100):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def chunk(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> List[TextChunk]:
        if not text:
            return []

        metadata = metadata or {}
        chunks: List[TextChunk] = []
        chunk_index = 0
        start_pos = 0
        text_length = len(text)

        while start_pos < text_length:
            end_pos = min(start_pos + self.chunk_size, text_length)

            if end_pos < text_length:
                last_period = text.rfind(".", start_pos, end_pos)
                last_newline = text.rfind("\n", start_pos, end_pos)
                split_pos = max(last_period, last_newline)
                if split_pos > start_pos + self.chunk_size // 2:
                    end_pos = split_pos + 1

            chunk_content = text[start_pos:end_pos].strip()
            if chunk_content:
                chunks.append(
                    TextChunk(
                        content=chunk_content,
                        metadata={**metadata, "source": "text_chunk"},
                        chunk_index=chunk_index,
                        start_pos=start_pos,
                        end_pos=end_pos,
                    )
                )
                chunk_index += 1

            start_pos = end_pos - self.chunk_overlap
            if start_pos <= 0 or start_pos >= text_length:
                break

        return chunks


class SemanticChunker(BaseChunker):
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 100, use_embeddings: bool = False):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.use_embeddings = use_embeddings

    def chunk(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> List[TextChunk]:
        if not text:
            return []

        metadata = metadata or {}
        sentences = self._split_sentences(text)
        chunks: List[TextChunk] = []
        current_chunk = []
        current_length = 0
        chunk_index = 0
        start_pos = 0

        for sentence in sentences:
            sent_length = len(sentence)

            if current_length + sent_length > self.chunk_size and current_chunk:
                chunk_content = "".join(current_chunk)
                chunks.append(
                    TextChunk(
                        content=chunk_content.strip(),
                        metadata={**metadata, "source": "semantic_chunk"},
                        chunk_index=chunk_index,
                        start_pos=start_pos,
                        end_pos=start_pos + len(chunk_content),
                    )
                )

                overlap_start = max(0, len(current_chunk) - 3)
                current_chunk = current_chunk[overlap_start:]
                current_length = sum(len(s) for s in current_chunk)
                start_pos += len(chunk_content) - sum(len(s) for s in current_chunk)
                chunk_index += 1

            current_chunk.append(sentence)
            current_length += sent_length

        if current_chunk:
            chunk_content = "".join(current_chunk)
            chunks.append(
                TextChunk(
                    content=chunk_content.strip(),
                    metadata={**metadata, "source": "semantic_chunk"},
                    chunk_index=chunk_index,
                    start_pos=start_pos,
                    end_pos=start_pos + len(chunk_content),
                )
            )

        return chunks

    def _split_sentences(self, text: str) -> List[str]:
        sentence_endings = re.compile(r"(?<=[。！？.!?])\s*")
        sentences = sentence_endings.split(text)
        return [s for s in sentences if s.strip()]


class TableProcessor:
    @staticmethod
    def table_to_markdown(table: List[List[str]]) -> str:
        if not table:
            return ""

        markdown_lines = []
        header = table[0]
        markdown_lines.append("| " + " | ".join(str(cell) for cell in header) + " |")
        markdown_lines.append("| " + " | ".join(["---"] * len(header)) + " |")

        for row in table[1:]:
            markdown_lines.append("| " + " | ".join(str(cell) for cell in row) + " |")

        return "\n".join(markdown_lines)

    @staticmethod
    def table_to_text(table: List[List[str]]) -> str:
        if not table:
            return ""

        lines = []
        for row in table:
            lines.append(" | ".join(str(cell) for cell in row))
        return "\n".join(lines)

    @staticmethod
    def extract_table_context(text: str, table_index: int, context_size: int = 200) -> Tuple[str, str]:
        lines = text.split("\n")
        table_markers = [i for i, line in enumerate(lines) if "Table" in line or "表" in line]

        if table_index < len(table_markers):
            table_pos = table_markers[table_index]
            start = max(0, table_pos - context_size)
            end = min(len(lines), table_pos + context_size)
            context_before = "\n".join(lines[start:table_pos])
            context_after = "\n".join(lines[table_pos + 1:end])
            return context_before, context_after

        return "", ""


class TextProcessor:
    def __init__(self, config: Any = None):
        self.config = config
        chunk_size = getattr(config, "chunk_size", 1000)
        chunk_overlap = getattr(config, "chunk_overlap", 100)

        self.cleaner = AdvancedTextCleaner()
        self.chunker = SemanticChunker(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        self.table_processor = TableProcessor()

    def process(self, text: str, metadata: Optional[Dict[str, Any]] = None, tables: Optional[List[List[List[str]]]] = None) -> List[TextChunk]:
        cleaned_text = self.cleaner.clean(text)
        chunks = self.chunker.chunk(cleaned_text, metadata)

        if tables:
            for i, table in enumerate(tables):
                table_md = self.table_processor.table_to_markdown(table)
                table_text = self.table_processor.table_to_text(table)

                chunks.append(
                    TextChunk(
                        content=table_text,
                        metadata={
                            **(metadata or {}),
                            "source": "table",
                            "table_index": i,
                            "table_markdown": table_md,
                        },
                        chunk_index=len(chunks),
                        start_pos=0,
                        end_pos=len(table_text),
                    )
                )

        return chunks

    def clean_text(self, text: str) -> str:
        return self.cleaner.clean(text)

    def chunk_text(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> List[TextChunk]:
        return self.chunker.chunk(text, metadata)
