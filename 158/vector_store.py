import uuid
from typing import List, Dict, Optional
import chromadb
from chromadb.config import Settings as ChromaSettings

from config import settings
from embedding_manager import EmbeddingManager
from bm25_index import BM25Index, RRFScorer


class VectorStore:
    _instance = None
    _client = None
    _collection = None
    _bm25_index = None
    _rrf_scorer = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if self._client is None:
            self._init_client()
        if self._bm25_index is None:
            self._bm25_index = BM25Index()
        if self._rrf_scorer is None:
            self._rrf_scorer = RRFScorer(k=settings.RRF_K)

    def _init_client(self):
        self._client = chromadb.PersistentClient(
            path=settings.CHROMA_DB_DIR,
            settings=ChromaSettings(anonymized_telemetry=False)
        )
        self._collection = self._client.get_or_create_collection(
            name=settings.COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"}
        )

    def add_documents(
        self,
        chunks: List[str],
        source: str,
        embedding_manager: EmbeddingManager,
        doc_title: Optional[str] = None,
        doc_id: Optional[str] = None
    ) -> int:
        if not chunks:
            return 0

        doc_id = doc_id or str(uuid.uuid4())
        embeddings = embedding_manager.get_embeddings(chunks)
        ids = [str(uuid.uuid4()) for _ in chunks]
        metadatas = [
            {
                "source": source,
                "doc_id": doc_id,
                "doc_title": doc_title or source,
                "chunk_index": i,
                "total_chunks": len(chunks)
            }
            for i in range(len(chunks))
        ]

        self._collection.add(
            ids=ids,
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas
        )

        self._bm25_index.add_documents(chunks, ids)

        return len(chunks)

    def query_documents(
        self,
        query_text: str,
        embedding_manager: EmbeddingManager,
        top_k: Optional[int] = None,
        similarity_threshold: Optional[float] = None
    ) -> List[Dict]:
        k = top_k or settings.TOP_K
        threshold = similarity_threshold if similarity_threshold is not None else settings.SIMILARITY_THRESHOLD
        query_embedding = embedding_manager.get_embedding(query_text)

        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=k * 2,
            include=["documents", "metadatas", "distances", "ids"]
        )

        documents = []
        if results["documents"] and results["documents"][0]:
            for i, (doc, metadata, distance, doc_id) in enumerate(zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
                results["ids"][0]
            )):
                similarity = 1.0 - float(distance)
                if similarity >= threshold:
                    documents.append({
                        "content": doc,
                        "source": metadata.get("source", "unknown"),
                        "doc_id": doc_id,
                        "doc_title": metadata.get("doc_title", metadata.get("source", "unknown")),
                        "chunk_index": metadata.get("chunk_index", i),
                        "total_chunks": metadata.get("total_chunks", 0),
                        "similarity": similarity,
                        "distance": float(distance)
                    })

        documents.sort(key=lambda x: x["similarity"], reverse=True)
        return documents[:k]

    def query_with_bm25(
        self,
        query_text: str,
        embedding_manager: EmbeddingManager,
        top_k: Optional[int] = None,
        similarity_threshold: Optional[float] = None
    ) -> List[Dict]:
        k = top_k or settings.TOP_K
        threshold = similarity_threshold if similarity_threshold is not None else settings.SIMILARITY_THRESHOLD

        vector_results = self.query_documents(
            query_text,
            embedding_manager,
            top_k=k * 2,
            similarity_threshold=threshold
        )

        bm25_results = self._bm25_index.search(query_text, top_k=k * 2)

        if not bm25_results:
            return vector_results[:k]

        if settings.USE_HYBRID_SEARCH:
            fused_results = self._rrf_scorer.fuse(vector_results, bm25_results, top_k=k)
            return fused_results
        else:
            return vector_results[:k]

    def query_hybrid(
        self,
        query_text: str,
        embedding_manager: EmbeddingManager,
        top_k: Optional[int] = None,
        similarity_threshold: Optional[float] = None,
        use_hybrid: Optional[bool] = None
    ) -> List[Dict]:
        k = top_k or settings.TOP_K
        threshold = similarity_threshold if similarity_threshold is not None else settings.SIMILARITY_THRESHOLD
        hybrid = use_hybrid if use_hybrid is not None else settings.USE_HYBRID_SEARCH

        if not hybrid:
            return self.query_documents(query_text, embedding_manager, k, threshold)

        query_embedding = embedding_manager.get_embedding(query_text)

        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=k * 3,
            include=["documents", "metadatas", "distances", "ids"]
        )

        vector_results = []
        if results["documents"] and results["documents"][0]:
            for i, (doc, metadata, distance, doc_id) in enumerate(zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
                results["ids"][0]
            )):
                similarity = 1.0 - float(distance)
                if similarity >= threshold:
                    vector_results.append({
                        "content": doc,
                        "source": metadata.get("source", "unknown"),
                        "doc_id": doc_id,
                        "doc_title": metadata.get("doc_title", metadata.get("source", "unknown")),
                        "chunk_index": metadata.get("chunk_index", i),
                        "total_chunks": metadata.get("total_chunks", 0),
                        "similarity": similarity,
                        "distance": float(distance)
                    })

        bm25_results = self._bm25_index.search(query_text, top_k=k * 3)

        if not bm25_results:
            vector_results.sort(key=lambda x: x["similarity"], reverse=True)
            return vector_results[:k]

        fused_results = self._rrf_scorer.fuse(vector_results, bm25_results, top_k=k)

        for doc in fused_results:
            if "similarity" not in doc or doc["similarity"] == 0:
                for vdoc in vector_results:
                    if vdoc["doc_id"] == doc["doc_id"]:
                        doc["similarity"] = vdoc["similarity"]
                        break

        return fused_results

    def query_with_diversity(
        self,
        query_text: str,
        embedding_manager: EmbeddingManager,
        top_k: Optional[int] = None,
        similarity_threshold: Optional[float] = None
    ) -> List[Dict]:
        k = top_k or settings.TOP_K
        threshold = similarity_threshold if similarity_threshold is not None else settings.SIMILARITY_THRESHOLD

        all_docs = self.query_hybrid(
            query_text,
            embedding_manager,
            top_k=k * 3,
            similarity_threshold=threshold
        )

        selected_docs = []
        used_sources = set()

        for doc in all_docs:
            if doc["source"] not in used_sources or len(selected_docs) >= k:
                if len(selected_docs) < k:
                    selected_docs.append(doc)
                    used_sources.add(doc["source"])

        if len(selected_docs) < k:
            for doc in all_docs:
                if doc not in selected_docs and len(selected_docs) < k:
                    selected_docs.append(doc)

        return selected_docs

    def delete_documents_by_source(self, source: str) -> int:
        results = self._collection.get(
            where={"source": source},
            include=["documents"]
        )

        if results["ids"]:
            self._bm25_index.delete_by_doc_ids(results["ids"])
            self._collection.delete(ids=results["ids"])
            return len(results["ids"])
        return 0

    def delete_documents_by_doc_id(self, doc_id: str) -> int:
        results = self._collection.get(
            where={"doc_id": doc_id},
            include=["documents"]
        )

        if results["ids"]:
            self._bm25_index.delete_by_doc_ids(results["ids"])
            self._collection.delete(ids=results["ids"])
            return len(results["ids"])
        return 0

    def get_all_sources(self) -> List[str]:
        results = self._collection.get(include=["metadatas"])
        sources = set()
        if results["metadatas"]:
            for metadata in results["metadatas"]:
                if metadata and "source" in metadata:
                    sources.add(metadata["source"])
        return list(sources)

    def get_document_count(self) -> int:
        return self._collection.count()

    def get_chunks_by_source(self, source: str) -> List[Dict]:
        results = self._collection.get(
            where={"source": source},
            include=["documents", "metadatas"]
        )

        chunks = []
        if results["ids"]:
            for i, (doc, metadata) in enumerate(zip(results["documents"], results["metadatas"])):
                chunks.append({
                    "id": results["ids"][i],
                    "content": doc,
                    "metadata": metadata
                })
        return chunks

    def get_bm25_stats(self) -> Dict:
        return self._bm25_index.get_stats()

    def clear_all(self):
        self._client.delete_collection(settings.COLLECTION_NAME)
        self._collection = self._client.get_or_create_collection(
            name=settings.COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"}
        )
        self._bm25_index.clear()
