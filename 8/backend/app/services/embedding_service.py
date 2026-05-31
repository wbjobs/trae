import logging
import re
from typing import List, Optional
import numpy as np

from ..core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self):
        self.model_name = settings.EMBEDDING_MODEL
        self._model = None
        self._initialized = False
        self._max_input_length = 512

    def _initialize_model(self):
        if self._initialized:
            return

        try:
            from sentence_transformers import SentenceTransformer

            logger.info(f"Loading embedding model: {self.model_name}")
            self._model = SentenceTransformer(self.model_name)
            
            if hasattr(self._model, 'max_seq_length'):
                self._max_input_length = self._model.max_seq_length
            
            self._initialized = True
            logger.info(f"Embedding model loaded successfully. Max input length: {self._max_input_length}")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise

    def _preprocess_code(self, code: str, language: Optional[str] = None) -> str:
        code = code.replace('\r\n', '\n').replace('\r', '\n')
        
        cleaned_lines = []
        for line in code.split('\n'):
            stripped = line.strip()
            if stripped:
                cleaned_lines.append(stripped)
        
        if not cleaned_lines:
            return code
        
        return '\n'.join(cleaned_lines)

    def _extract_code_signature(self, code: str, language: Optional[str] = None) -> List[str]:
        signatures = []
        
        patterns = {
            'python': [
                r'^def\s+(\w+)\s*\(([^)]*)\)',
                r'^class\s+(\w+)',
                r'^async\s+def\s+(\w+)\s*\(([^)]*)\)',
            ],
            'javascript': [
                r'^function\s+(\w+)\s*\(([^)]*)\)',
                r'^const\s+(\w+)\s*=\s*(?:async\s+)?function',
                r'^let\s+(\w+)\s*=\s*(?:async\s+)?function',
                r'^class\s+(\w+)',
                r'^export\s+(?:default\s+)?(?:function|class)\s+(\w+)',
            ],
            'typescript': [
                r'^function\s+(\w+)\s*\(([^)]*)\)',
                r'^const\s+(\w+)\s*=\s*(?:async\s+)?function',
                r'^class\s+(\w+)',
                r'^export\s+(?:default\s+)?(?:function|class|interface|type)\s+(\w+)',
                r'^interface\s+(\w+)',
                r'^type\s+(\w+)',
            ],
            'java': [
                r'^public\s+(?:static\s+)?\w+\s+(\w+)\s*\(',
                r'^class\s+(\w+)',
                r'^public\s+class\s+(\w+)',
                r'^interface\s+(\w+)',
            ],
        }

        lang_patterns = patterns.get(language, [])
        for pattern in lang_patterns:
            matches = re.finditer(pattern, code, re.MULTILINE)
            for match in matches:
                sig = match.group(0).strip()
                if len(sig) < 200:
                    signatures.append(sig)

        return list(set(signatures))

    def _generate_semantic_summary(
        self,
        code: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        language: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> str:
        summary_parts = []

        if title:
            summary_parts.append(f"Functionality: {title}")

        if language:
            summary_parts.append(f"Programming language: {language}")

        if description:
            summary_parts.append(f"Description: {description}")

        if tags and len(tags) > 0:
            summary_parts.append(f"Tags: {', '.join(tags)}")

        signatures = self._extract_code_signature(code, language)
        if signatures:
            summary_parts.append(f"Code signatures: {'; '.join(signatures[:5])}")

        return ' '.join(summary_parts)

    def _chunk_text(self, text: str, max_tokens: int = 256) -> List[str]:
        if len(text) <= max_tokens * 4:
            return [text]

        chunks = []
        
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        current_chunk = []
        current_length = 0
        
        for sentence in sentences:
            sentence_length = len(sentence)
            if current_length + sentence_length > max_tokens * 4 and current_chunk:
                chunks.append(' '.join(current_chunk))
                current_chunk = [sentence]
                current_length = sentence_length
            else:
                current_chunk.append(sentence)
                current_length += sentence_length
        
        if current_chunk:
            chunks.append(' '.join(current_chunk))

        if not chunks:
            chunks = [text[:max_tokens * 4]]

        return chunks

    def _average_embeddings(self, embeddings: List[List[float]]) -> List[float]:
        if len(embeddings) == 0:
            return []
        
        if len(embeddings) == 1:
            return embeddings[0]
        
        arr = np.array(embeddings)
        return np.mean(arr, axis=0).tolist()

    def _prepare_text_for_embedding(
        self,
        code: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        language: Optional[str] = None,
        tags: Optional[List[str]] = None,
        for_query: bool = False
    ) -> List[str]:
        semantic_summary = self._generate_semantic_summary(
            code=code,
            title=title,
            description=description,
            language=language,
            tags=tags
        )

        if for_query:
            return [semantic_summary] if semantic_summary else [code]

        chunks = []

        if semantic_summary:
            chunks.append(semantic_summary)

        cleaned_code = self._preprocess_code(code, language)
        code_chunks = self._chunk_text(cleaned_code, max_tokens=200)
        
        if code_chunks:
            for chunk in code_chunks[:3]:
                if semantic_summary:
                    chunks.append(f"Context: {semantic_summary}\nCode: {chunk}")
                else:
                    chunks.append(f"Code: {chunk}")

        if not chunks:
            chunks = [cleaned_code[:1000]]

        return chunks

    def embed_code(
        self,
        code: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        language: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> List[float]:
        self._initialize_model()

        text_chunks = self._prepare_text_for_embedding(
            code=code,
            title=title,
            description=description,
            language=language,
            tags=tags,
            for_query=False
        )

        try:
            embeddings = self._model.encode(
                text_chunks,
                convert_to_numpy=True,
                batch_size=8,
                show_progress_bar=False
            )
            
            if isinstance(embeddings, list):
                embedding_list = [e.tolist() for e in embeddings]
            else:
                embedding_list = embeddings.tolist()
                if embeddings.ndim == 1:
                    embedding_list = [embedding_list]

            return self._average_embeddings(embedding_list)
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            raise

    def embed_query(self, query: str) -> List[float]:
        self._initialize_model()

        enhanced_query = self._enhance_query(query)

        try:
            embedding = self._model.encode(
                enhanced_query,
                convert_to_numpy=True,
                show_progress_bar=False
            )
            
            if hasattr(embedding, 'tolist'):
                return embedding.tolist()
            return list(embedding)
        except Exception as e:
            logger.error(f"Failed to generate query embedding: {e}")
            raise

    def _enhance_query(self, query: str) -> str:
        query = query.strip()

        prefixes = [
            '如何实现', '怎么实现', '实现一个', '如何写', '怎么写',
            '如何使用', '怎么使用', '使用方法',
            '如何做', '怎么做',
        ]

        for prefix in prefixes:
            if query.startswith(prefix):
                query = query[len(prefix):].strip()
                break

        function_keywords = {
            'http请求': 'HTTP request network web API',
            '数据库': 'database SQL query connection',
            '文件': 'file IO read write save load',
            '异步': 'async await promise callback',
            '超时': 'timeout delay',
            '缓存': 'cache memory store',
            '错误': 'error exception handling',
            '验证': 'validation check',
        }

        additional_keywords = []
        for keyword, related in function_keywords.items():
            if keyword in query:
                additional_keywords.append(related)

        enhanced_parts = [query]
        if additional_keywords:
            enhanced_parts.append(' '.join(additional_keywords))

        return ' '.join(enhanced_parts)

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        self._initialize_model()

        try:
            embeddings = self._model.encode(
                texts,
                convert_to_numpy=True,
                batch_size=32,
                show_progress_bar=False
            )
            return embeddings.tolist()
        except Exception as e:
            logger.error(f"Failed to generate batch embeddings: {e}")
            raise


embedding_service = EmbeddingService()
