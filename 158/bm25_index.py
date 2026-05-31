import os
import pickle
from typing import List, Dict, Optional
from pathlib import Path

try:
    from rank_bm25 import BM25Okapi
    HAS_BM25 = True
except ImportError:
    HAS_BM25 = False
    BM25Okapi = None

try:
    import jieba
    HAS_JIEBA = True
except ImportError:
    HAS_JIEBA = False

from config import settings


class BM25Index:
    def __init__(self):
        self.bm25 = None
        self.documents = []
        self.doc_ids = []
        self.index_dir = Path(settings.CHROMA_DB_DIR) / "bm25_index"
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self._load_index()

    def _tokenize(self, text: str) -> List[str]:
        if HAS_JIEBA:
            return list(jieba.cut(text.lower()))
        return text.lower().split()

    def _load_index(self):
        index_file = self.index_dir / "bm25.pkl"
        docs_file = self.index_dir / "documents.pkl"
        ids_file = self.index_dir / "doc_ids.pkl"

        if index_file.exists() and docs_file.exists() and ids_file.exists():
            try:
                with open(index_file, 'rb') as f:
                    self.bm25 = pickle.load(f)
                with open(docs_file, 'rb') as f:
                    self.documents = pickle.load(f)
                with open(ids_file, 'rb') as f:
                    self.doc_ids = pickle.load(f)
            except Exception:
                self.bm25 = None
                self.documents = []
                self.doc_ids = []

    def _save_index(self):
        index_file = self.index_dir / "bm25.pkl"
        docs_file = self.index_dir / "documents.pkl"
        ids_file = self.index_dir / "doc_ids.pkl"

        try:
            if self.bm25 is not None:
                with open(index_file, 'wb') as f:
                    pickle.dump(self.bm25, f)
            with open(docs_file, 'wb') as f:
                pickle.dump(self.documents, f)
            with open(ids_file, 'wb') as f:
                pickle.dump(self.doc_ids, f)
        except Exception as e:
            print(f"Warning: Failed to save BM25 index: {e}")

    def add_documents(self, documents: List[str], doc_ids: Optional[List[str]] = None):
        if not documents:
            return

        if doc_ids is None:
            start_id = len(self.documents)
            doc_ids = [f"doc_{start_id + i}" for i in range(len(documents))]

        self.documents.extend(documents)
        self.doc_ids.extend(doc_ids)

        if HAS_BM25 and self.documents:
            tokenized_corpus = [self._tokenize(doc) for doc in self.documents]
            self.bm25 = BM25Okapi(tokenized_corpus)
            self._save_index()

    def search(self, query: str, top_k: int = 10) -> List[Dict]:
        if not self.bm25 or not self.documents:
            return []

        tokenized_query = self._tokenize(query)
        scores = self.bm25.get_scores(tokenized_query)

        ranked_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)

        results = []
        for idx in ranked_indices[:top_k]:
            if idx < len(self.documents) and scores[idx] > 0:
                results.append({
                    "doc_id": self.doc_ids[idx] if idx < len(self.doc_ids) else f"doc_{idx}",
                    "content": self.documents[idx],
                    "bm25_score": float(scores[idx]),
                    "index": idx
                })

        return results

    def search_with_scores(self, query: str, top_k: int = 10) -> Dict[str, float]:
        if not self.bm25 or not self.documents:
            return {}

        tokenized_query = self._tokenize(query)
        scores = self.bm25.get_scores(tokenized_query)

        doc_scores = {}
        for idx, score in enumerate(scores):
            if score > 0 and idx < len(self.doc_ids):
                doc_scores[self.doc_ids[idx]] = float(score)

        return doc_scores

    def delete_by_doc_ids(self, doc_ids_to_delete: List[str]):
        if not doc_ids_to_delete:
            return

        delete_set = set(doc_ids_to_delete)
        new_documents = []
        new_doc_ids = []

        for i, doc_id in enumerate(self.doc_ids):
            if doc_id not in delete_set and i < len(self.documents):
                new_documents.append(self.documents[i])
                new_doc_ids.append(doc_id)

        self.documents = new_documents
        self.doc_ids = new_doc_ids

        if HAS_BM25 and self.documents:
            tokenized_corpus = [self._tokenize(doc) for doc in self.documents]
            self.bm25 = BM25Okapi(tokenized_corpus)
            self._save_index()
        else:
            self.bm25 = None

    def clear(self):
        self.bm25 = None
        self.documents = []
        self.doc_ids = []

        for f in ["bm25.pkl", "documents.pkl", "doc_ids.pkl"]:
            file_path = self.index_dir / f
            if file_path.exists():
                file_path.unlink()

    def get_stats(self) -> Dict:
        return {
            "total_documents": len(self.documents),
            "has_index": self.bm25 is not None,
            "bm25_available": HAS_BM25,
            "jieba_available": HAS_JIEBA
        }


class RRFScorer:
    def __init__(self, k: int = 60):
        self.k = k

    def compute_rrf_score(self, rank: int) -> float:
        return 1.0 / (self.k + rank + 1)

    def fuse(
        self,
        vector_results: List[Dict],
        bm25_results: List[Dict],
        top_k: int = 10
    ) -> List[Dict]:
        scores = {}
        doc_info = {}

        for rank, doc in enumerate(vector_results):
            doc_id = doc.get("doc_id", doc.get("source", ""))
            rrf_score = self.compute_rrf_score(rank)
            if doc_id not in scores:
                scores[doc_id] = 0.0
                doc_info[doc_id] = doc
            scores[doc_id] += rrf_score * settings.VECTOR_WEIGHT

        for rank, doc in enumerate(bm25_results):
            doc_id = doc.get("doc_id", "")
            rrf_score = self.compute_rrf_score(rank)
            if doc_id not in scores:
                scores[doc_id] = 0.0
                doc_info[doc_id] = doc
            scores[doc_id] += rrf_score * settings.BM25_WEIGHT

        sorted_docs = sorted(scores.items(), key=lambda x: x[1], reverse=True)

        results = []
        for doc_id, score in sorted_docs[:top_k]:
            info = doc_info.get(doc_id, {})
            results.append({
                **info,
                "doc_id": doc_id,
                "rrf_score": score,
                "source": info.get("source", info.get("doc_title", doc_id)),
                "content": info.get("content", ""),
                "similarity": info.get("similarity", 0),
                "bm25_score": info.get("bm25_score", 0)
            })

        return results

    def simple_weighted_fusion(
        self,
        vector_results: List[Dict],
        bm25_results: List[Dict],
        top_k: int = 10
    ) -> List[Dict]:
        scores = {}
        doc_info = {}

        vector_max = max((d.get("similarity", 0) for d in vector_results), default=1.0)
        bm25_max = max((d.get("bm25_score", 0) for d in bm25_results), default=1.0)

        for doc in vector_results:
            doc_id = doc.get("doc_id", doc.get("source", ""))
            normalized_score = doc.get("similarity", 0) / vector_max if vector_max > 0 else 0
            if doc_id not in scores:
                scores[doc_id] = 0.0
                doc_info[doc_id] = doc
            scores[doc_id] += normalized_score * settings.VECTOR_WEIGHT

        for doc in bm25_results:
            doc_id = doc.get("doc_id", "")
            normalized_score = doc.get("bm25_score", 0) / bm25_max if bm25_max > 0 else 0
            if doc_id not in scores:
                scores[doc_id] = 0.0
                doc_info[doc_id] = doc
            scores[doc_id] += normalized_score * settings.BM25_WEIGHT

        sorted_docs = sorted(scores.items(), key=lambda x: x[1], reverse=True)

        results = []
        for doc_id, score in sorted_docs[:top_k]:
            info = doc_info.get(doc_id, {})
            results.append({
                **info,
                "doc_id": doc_id,
                "fused_score": score,
                "source": info.get("source", info.get("doc_title", doc_id)),
                "content": info.get("content", ""),
                "similarity": info.get("similarity", 0),
                "bm25_score": info.get("bm25_score", 0)
            })

        return results
