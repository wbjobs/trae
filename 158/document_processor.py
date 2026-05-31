import os
import re
import uuid
from typing import List, Dict, Optional
from pathlib import Path

import pypdf

from config import settings


class DocumentProcessor:
    def __init__(self):
        self.upload_dir = Path(settings.UPLOAD_DIR)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def save_uploaded_file(self, file_content: bytes, filename: str) -> Path:
        file_path = self.upload_dir / filename
        file_path.write_bytes(file_content)
        return file_path

    def extract_text_from_pdf(self, file_path: Path) -> str:
        text_parts = []
        try:
            reader = pypdf.PdfReader(str(file_path))
            for page_num, page in enumerate(reader.pages):
                page_text = page.extract_text() or ""
                if page_text.strip():
                    text_parts.append(f"[Page {page_num + 1}]\n{page_text}")
        except Exception as e:
            raise ValueError(f"Failed to extract text from PDF: {e}")
        return "\n\n".join(text_parts)

    def extract_text_from_txt(self, file_path: Path) -> str:
        try:
            return file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return file_path.read_text(encoding="gbk")

    def extract_text(self, file_path: Path) -> str:
        suffix = file_path.suffix.lower()
        if suffix == ".pdf":
            return self.extract_text_from_pdf(file_path)
        elif suffix == ".txt":
            return self.extract_text_from_txt(file_path)
        else:
            raise ValueError(f"Unsupported file type: {suffix}")

    def chunk_text(self, text: str) -> List[str]:
        return self._semantic_chunk(text)

    def _semantic_chunk(self, text: str) -> List[str]:
        chunks = []
        chunk_size = settings.CHUNK_SIZE
        overlap = settings.CHUNK_OVERLAP

        if not text.strip():
            return chunks

        paragraphs = self._split_paragraphs(text)
        current_chunk = ""

        for paragraph in paragraphs:
            paragraph = paragraph.strip()
            if not paragraph:
                continue

            if len(current_chunk) + len(paragraph) <= chunk_size:
                if current_chunk:
                    current_chunk += "\n\n"
                current_chunk += paragraph
            else:
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())

                if len(paragraph) > chunk_size:
                    sub_chunks = self._chunk_long_paragraph(paragraph, chunk_size, overlap)
                    chunks.extend(sub_chunks)
                    current_chunk = ""
                else:
                    if overlap > 0 and len(current_chunk) > overlap:
                        current_chunk = current_chunk[-overlap:] + "\n\n" + paragraph
                    else:
                        current_chunk = paragraph

        if current_chunk.strip():
            chunks.append(current_chunk.strip())

        return chunks

    def _chunk_long_paragraph(self, text: str, chunk_size: int, overlap: int) -> List[str]:
        chunks = []
        sentences = self._split_sentences(text)
        current_chunk = ""

        for sentence in sentences:
            if len(current_chunk) + len(sentence) <= chunk_size:
                if current_chunk:
                    current_chunk += " "
                current_chunk += sentence
            else:
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
                if overlap > 0 and len(current_chunk) > overlap:
                    current_chunk = current_chunk[-overlap:] + " " + sentence
                else:
                    current_chunk = sentence

        if current_chunk.strip():
            chunks.append(current_chunk.strip())

        return chunks

    def _split_paragraphs(self, text: str) -> List[str]:
        paragraphs = re.split(r'\n\s*\n', text)
        return [p.strip() for p in paragraphs if p.strip()]

    def _split_sentences(self, text: str) -> List[str]:
        sentences = []
        current = ""
        delimiters = [".", "!", "?", "\n", "。", "！", "？", "；", ";"]

        for char in text:
            current += char
            if char in delimiters:
                if current.strip():
                    sentences.append(current.strip())
                current = ""

        if current.strip():
            sentences.append(current.strip())

        return sentences

    def process_document(self, file_content: bytes, filename: str) -> Dict:
        file_path = self.save_uploaded_file(file_content, filename)
        text = self.extract_text(file_path)
        chunks = self.chunk_text(text)

        doc_id = str(uuid.uuid4())
        return {
            "doc_id": doc_id,
            "source": filename,
            "doc_title": filename,
            "chunks": chunks,
            "total_chunks": len(chunks)
        }

    def list_uploaded_files(self) -> List[str]:
        if not self.upload_dir.exists():
            return []
        return [f.name for f in self.upload_dir.iterdir() if f.is_file()]

    def delete_uploaded_file(self, filename: str) -> bool:
        file_path = self.upload_dir / filename
        if file_path.exists():
            file_path.unlink()
            return True
        return False

    def get_uploaded_file_path(self, filename: str) -> Optional[Path]:
        file_path = self.upload_dir / filename
        if file_path.exists():
            return file_path
        return None
