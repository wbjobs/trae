import logging
import uuid
import re
import hashlib
from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
from pathlib import Path
from functools import lru_cache

from ..core.config import settings
from .embedding_service import embedding_service

logger = logging.getLogger(__name__)


class VectorDBService:
    def __init__(self):
        self.client = None
        self.collection = None
        self._initialized = False
        self._code_cache: Dict[str, List[float]] = {}
        self._max_cache_size = 1000

    def _initialize(self):
        if self._initialized:
            return

        try:
            import chromadb
            from chromadb.config import Settings as ChromaSettings

            chroma_path = Path(settings.CHROMADB_PATH)
            chroma_path.mkdir(parents=True, exist_ok=True)

            logger.info(f"Initializing ChromaDB at: {chroma_path}")

            self.client = chromadb.PersistentClient(
                path=str(chroma_path),
                settings=ChromaSettings(
                    allow_reset=True,
                    is_persistent=True,
                    anonymized_telemetry=False
                )
            )

            self.collection = self.client.get_or_create_collection(
                name=settings.CHROMADB_COLLECTION,
                metadata={
                    "hnsw:space": "cosine",
                    "hnsw:construction_ef": 128,
                    "hnsw:M": 32,
                    "hnsw:search_ef": 64
                }
            )

            self._initialized = True
            logger.info("ChromaDB initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB: {e}")
            raise

    def _generate_id(self) -> str:
        return str(uuid.uuid4())

    def _generate_cache_key(
        self,
        code: str,
        title: Optional[str],
        description: Optional[str],
        language: Optional[str],
        tags: Optional[List[str]]
    ) -> str:
        content = f"{title or ''}|{description or ''}|{language or ''}|{tags or []}|{code}"
        return hashlib.md5(content.encode('utf-8')).hexdigest()

    def _extract_keywords(self, text: str) -> List[str]:
        if not text:
            return []
        
        text = text.lower()
        words = re.findall(r'\b[a-z][a-z0-9_]{2,}\b', text)
        
        stopwords = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against',
            'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where',
            'this', 'that', 'these', 'those', 'it', 'its',
            'to', 'from', 'into', 'through', 'during', 'before', 'after',
            'how', 'what', 'which', 'who', 'whom', 'why',
            'def', 'function', 'return', 'class', 'import', 'from',
            'const', 'let', 'var', 'public', 'private', 'static',
        }
        
        keywords = [w for w in words if w not in stopwords]
        return list(set(keywords))

    def _calculate_keyword_score(self, query_keywords: List[str], snippet_keywords: List[str]) -> float:
        if not query_keywords or not snippet_keywords:
            return 0.0
        
        query_set = set(query_keywords)
        snippet_set = set(snippet_keywords)
        
        intersection = query_set.intersection(snippet_set)
        
        if len(query_set) == 0:
            return 0.0
        
        return len(intersection) / len(query_set)

    def _extract_snippet_keywords(self, metadata: Dict[str, Any]) -> List[str]:
        all_text = []
        
        title = metadata.get('title', '')
        if title:
            all_text.append(title)
        
        description = metadata.get('description', '')
        if description:
            all_text.append(description)
        
        tags = metadata.get('tags', '')
        if tags:
            all_text.append(tags.replace(',', ' '))
        
        return self._extract_keywords(' '.join(all_text))

    def add_code_snippet(
        self,
        code: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        language: str = "python",
        tags: List[str] = None
    ) -> Dict[str, Any]:
        self._initialize()
        tags = tags or []

        cache_key = self._generate_cache_key(code, title, description, language, tags)
        
        if cache_key in self._code_cache:
            embedding = self._code_cache[cache_key]
        else:
            embedding = embedding_service.embed_code(
                code=code,
                title=title,
                description=description,
                language=language,
                tags=tags
            )
            
            if len(self._code_cache) >= self._max_cache_size:
                self._code_cache.clear()
            self._code_cache[cache_key] = embedding

        snippet_id = self._generate_id()
        now = datetime.utcnow().isoformat()

        keywords = self._extract_keywords(
            f"{title or ''} {description or ''} {' '.join(tags)}"
        )

        metadata = {
            "title": title or "",
            "code": code,
            "language": language,
            "description": description or "",
            "tags": ",".join(tags),
            "keywords": ",".join(keywords),
            "created_at": now,
            "updated_at": now
        }

        self.collection.add(
            ids=[snippet_id],
            embeddings=[embedding],
            metadatas=[metadata],
            documents=[code]
        )

        logger.info(f"Added code snippet: {snippet_id}")

        return {
            "id": snippet_id,
            "title": title,
            "code": code,
            "language": language,
            "tags": tags,
            "description": description,
            "created_at": now,
            "updated_at": now
        }

    def update_code_snippet(
        self,
        snippet_id: str,
        code: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        language: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        self._initialize()

        existing = self.get_code_snippet(snippet_id)
        if not existing:
            logger.warning(f"Code snippet not found: {snippet_id}")
            return None

        updated_code = code if code is not None else existing.get("code", "")
        updated_title = title if title is not None else existing.get("title", "")
        updated_description = description if description is not None else existing.get("description", "")
        updated_language = language if language is not None else existing.get("language", "python")
        updated_tags = tags if tags is not None else existing.get("tags", [])

        embedding = embedding_service.embed_code(
            code=updated_code,
            title=updated_title,
            description=updated_description,
            language=updated_language,
            tags=updated_tags
        )

        now = datetime.utcnow().isoformat()

        keywords = self._extract_keywords(
            f"{updated_title or ''} {updated_description or ''} {' '.join(updated_tags)}"
        )

        metadata = {
            "title": updated_title or "",
            "code": updated_code,
            "language": updated_language,
            "description": updated_description or "",
            "tags": ",".join(updated_tags),
            "keywords": ",".join(keywords),
            "created_at": existing.get("created_at", now),
            "updated_at": now
        }

        self.collection.update(
            ids=[snippet_id],
            embeddings=[embedding],
            metadatas=[metadata],
            documents=[updated_code]
        )

        logger.info(f"Updated code snippet: {snippet_id}")

        return {
            "id": snippet_id,
            "title": updated_title,
            "code": updated_code,
            "language": updated_language,
            "tags": updated_tags,
            "description": updated_description,
            "created_at": existing.get("created_at", now),
            "updated_at": now
        }

    def delete_code_snippet(self, snippet_id: str) -> bool:
        self._initialize()

        try:
            self.collection.delete(ids=[snippet_id])
            logger.info(f"Deleted code snippet: {snippet_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete snippet {snippet_id}: {e}")
            return False

    def get_code_snippet(self, snippet_id: str) -> Optional[Dict[str, Any]]:
        self._initialize()

        result = self.collection.get(ids=[snippet_id])

        if not result.get("ids") or len(result["ids"]) == 0:
            return None

        metadata = result["metadatas"][0]
        tags_str = metadata.get("tags", "")
        tags = tags_str.split(",") if tags_str else []

        return {
            "id": result["ids"][0],
            "title": metadata.get("title"),
            "code": metadata.get("code", result["documents"][0] if result["documents"] else ""),
            "language": metadata.get("language", "python"),
            "tags": tags,
            "description": metadata.get("description"),
            "created_at": metadata.get("created_at"),
            "updated_at": metadata.get("updated_at")
        }

    def search_by_query(
        self,
        query: str,
        top_k: int = 5,
        language: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        self._initialize()

        query_embedding = embedding_service.embed_query(query)
        query_keywords = self._extract_keywords(query)

        where = {}
        if language:
            where["language"] = language

        fetch_k = min(top_k * 3, 100)

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=fetch_k,
            where=where if where else None
        )

        formatted_results = []

        if results.get("ids") and len(results["ids"]) > 0:
            ids = results["ids"][0]
            metadatas = results["metadatas"][0]
            distances = results["distances"][0] if results.get("distances") else []

            candidates = []
            for i, snippet_id in enumerate(ids):
                metadata = metadatas[i]
                tags_str = metadata.get("tags", "")
                snippet_tags = tags_str.split(",") if tags_str else []

                if tags:
                    has_matching_tag = any(tag in snippet_tags for tag in tags)
                    if not has_matching_tag:
                        continue

                vector_similarity = 1 - distances[i] if i < len(distances) else 0

                snippet_keywords = self._extract_snippet_keywords(metadata)
                keyword_score = self._calculate_keyword_score(query_keywords, snippet_keywords)

                alpha = 0.7
                beta = 0.3
                hybrid_similarity = alpha * vector_similarity + beta * keyword_score

                candidates.append({
                    "id": snippet_id,
                    "title": metadata.get("title"),
                    "code": metadata.get("code", ""),
                    "language": metadata.get("language", "python"),
                    "tags": snippet_tags,
                    "description": metadata.get("description"),
                    "vector_similarity": vector_similarity,
                    "keyword_score": keyword_score,
                    "similarity": hybrid_similarity,
                    "created_at": metadata.get("created_at")
                })

            candidates.sort(key=lambda x: x["similarity"], reverse=True)
            
            for candidate in candidates[:top_k]:
                formatted_results.append({
                    "id": candidate["id"],
                    "title": candidate["title"],
                    "code": candidate["code"],
                    "language": candidate["language"],
                    "tags": candidate["tags"],
                    "description": candidate["description"],
                    "similarity": candidate["similarity"],
                    "created_at": candidate["created_at"]
                })

        return formatted_results

    def search_by_embedding(
        self,
        embedding: List[float],
        top_k: int = 5,
        exclude_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        self._initialize()

        fetch_k = min(top_k * 2 + (len(exclude_ids) if exclude_ids else 0), 50)

        results = self.collection.query(
            query_embeddings=[embedding],
            n_results=fetch_k
        )

        formatted_results = []

        if results.get("ids") and len(results["ids"]) > 0:
            ids = results["ids"][0]
            metadatas = results["metadatas"][0]
            distances = results["distances"][0] if results.get("distances") else []

            for i, snippet_id in enumerate(ids):
                if exclude_ids and snippet_id in exclude_ids:
                    continue

                if len(formatted_results) >= top_k:
                    break

                metadata = metadatas[i]
                tags_str = metadata.get("tags", "")
                snippet_tags = tags_str.split(",") if tags_str else []
                similarity = 1 - distances[i] if i < len(distances) else 0

                formatted_results.append({
                    "id": snippet_id,
                    "title": metadata.get("title"),
                    "code": metadata.get("code", ""),
                    "language": metadata.get("language", "python"),
                    "tags": snippet_tags,
                    "description": metadata.get("description"),
                    "similarity": similarity,
                    "created_at": metadata.get("created_at")
                })

        return formatted_results

    def get_all_snippets(
        self,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        self._initialize()

        try:
            all_results = self.collection.get()

            formatted_results = []
            if all_results.get("ids"):
                ids = all_results["ids"]
                metadatas = all_results["metadatas"]

                end_index = min(offset + limit, len(ids))
                
                for i in range(offset, end_index):
                    snippet_id = ids[i]
                    metadata = metadatas[i]
                    tags_str = metadata.get("tags", "")
                    snippet_tags = tags_str.split(",") if tags_str else []

                    formatted_results.append({
                        "id": snippet_id,
                        "title": metadata.get("title"),
                        "code": metadata.get("code", ""),
                        "language": metadata.get("language", "python"),
                        "tags": snippet_tags,
                        "description": metadata.get("description"),
                        "created_at": metadata.get("created_at"),
                        "updated_at": metadata.get("updated_at")
                    })

            return formatted_results
        except Exception as e:
            logger.error(f"Failed to get all snippets: {e}")
            return []

    def get_snippet_embedding(self, snippet_id: str) -> Optional[List[float]]:
        self._initialize()

        snippet = self.get_code_snippet(snippet_id)
        if not snippet:
            return None

        cache_key = self._generate_cache_key(
            snippet["code"],
            snippet.get("title"),
            snippet.get("description"),
            snippet.get("language"),
            snippet.get("tags", [])
        )

        if cache_key in self._code_cache:
            return self._code_cache[cache_key]

        embedding = embedding_service.embed_code(
            code=snippet["code"],
            title=snippet.get("title"),
            description=snippet.get("description"),
            language=snippet.get("language"),
            tags=snippet.get("tags", [])
        )

        if len(self._code_cache) >= self._max_cache_size:
            self._code_cache.clear()
        self._code_cache[cache_key] = embedding

        return embedding

    def rebuild_index(self) -> Tuple[bool, int]:
        self._initialize()

        try:
            all_snippets = self.get_all_snippets(limit=100000)
            total_count = len(all_snippets)

            logger.info(f"Rebuilding index with {total_count} snippets...")

            if total_count > 0:
                ids = [s["id"] for s in all_snippets]
                self.collection.delete(ids=ids)

            batch_size = 32
            for batch_start in range(0, total_count, batch_size):
                batch_end = min(batch_start + batch_size, total_count)
                batch_snippets = all_snippets[batch_start:batch_end]

                embeddings = []
                metadatas = []
                documents = []
                batch_ids = []

                for snippet in batch_snippets:
                    embedding = embedding_service.embed_code(
                        code=snippet["code"],
                        title=snippet.get("title"),
                        description=snippet.get("description"),
                        language=snippet.get("language"),
                        tags=snippet.get("tags", [])
                    )

                    keywords = self._extract_keywords(
                        f"{snippet.get('title', '')} {snippet.get('description', '')} {' '.join(snippet.get('tags', []))}"
                    )

                    embeddings.append(embedding)
                    metadatas.append({
                        "title": snippet.get("title", ""),
                        "code": snippet["code"],
                        "language": snippet.get("language", "python"),
                        "description": snippet.get("description", ""),
                        "tags": ",".join(snippet.get("tags", [])),
                        "keywords": ",".join(keywords),
                        "created_at": snippet.get("created_at", ""),
                        "updated_at": snippet.get("updated_at", "")
                    })
                    documents.append(snippet["code"])
                    batch_ids.append(snippet["id"])

                if embeddings:
                    self.collection.add(
                        ids=batch_ids,
                        embeddings=embeddings,
                        metadatas=metadatas,
                        documents=documents
                    )

                logger.info(f"Processed batch {batch_start // batch_size + 1}, {batch_end} of {total_count}")

            self._code_cache.clear()

            logger.info(f"Rebuilt index with {total_count} snippets")
            return True, total_count

        except Exception as e:
            logger.error(f"Failed to rebuild index: {e}")
            return False, 0

    def export_data(self) -> Dict[str, Any]:
        self._initialize()

        all_snippets = self.get_all_snippets(limit=100000)

        return {
            "version": "1.0",
            "exported_at": datetime.utcnow().isoformat(),
            "total_count": len(all_snippets),
            "snippets": all_snippets
        }

    def import_data(self, data: Dict[str, Any]) -> Tuple[bool, int]:
        self._initialize()

        try:
            snippets = data.get("snippets", [])
            imported_count = 0

            batch_size = 16
            for batch_start in range(0, len(snippets), batch_size):
                batch_end = min(batch_start + batch_size, len(snippets))
                batch_snippets = snippets[batch_start:batch_end]

                for snippet in batch_snippets:
                    try:
                        self.add_code_snippet(
                            code=snippet["code"],
                            title=snippet.get("title"),
                            description=snippet.get("description"),
                            language=snippet.get("language", "python"),
                            tags=snippet.get("tags", [])
                        )
                        imported_count += 1
                    except Exception as e:
                        logger.warning(f"Failed to import snippet: {e}")
                        continue

                logger.info(f"Imported batch, {imported_count} of {len(snippets)}")

            logger.info(f"Imported {imported_count} snippets")
            return True, imported_count

        except Exception as e:
            logger.error(f"Failed to import data: {e}")
            return False, 0

    def get_collection_stats(self) -> Dict[str, Any]:
        self._initialize()

        try:
            count = self.collection.count()
            return {
                "total_snippets": count,
                "collection_name": settings.CHROMADB_COLLECTION,
                "cache_size": len(self._code_cache)
            }
        except Exception as e:
            logger.error(f"Failed to get collection stats: {e}")
            return {
                "total_snippets": 0,
                "collection_name": settings.CHROMADB_COLLECTION,
                "cache_size": 0
            }


vector_db_service = VectorDBService()
