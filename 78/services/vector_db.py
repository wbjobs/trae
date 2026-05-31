import os
import uuid
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings
from dotenv import load_dotenv

load_dotenv()

class VectorDBService:
    _instance = None
    _client = None
    _collection = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._init_db()
        return cls._instance

    @classmethod
    def _init_db(cls):
        persist_dir = os.getenv("CHROMA_PERSIST_DIR", "./data/chroma_db")
        collection_name = os.getenv("CHROMA_COLLECTION_NAME", "multimodal_search")
        
        os.makedirs(persist_dir, exist_ok=True)
        
        hnsw_m = int(os.getenv("HNSW_M", "64"))
        hnsw_construction_ef = int(os.getenv("HNSW_CONSTRUCTION_EF", "500"))
        hnsw_search_ef = int(os.getenv("HNSW_SEARCH_EF", "128"))
        
        print(f"Initializing ChromaDB at: {persist_dir}")
        print(f"HNSW params: M={hnsw_m}, construction_ef={hnsw_construction_ef}, search_ef={hnsw_search_ef}")
        
        cls._client = chromadb.PersistentClient(
            path=persist_dir,
            settings=Settings(anonymized_telemetry=False)
        )
        
        existing_collections = cls._client.list_collections()
        collection_exists = any(c.name == collection_name for c in existing_collections)
        
        if collection_exists:
            cls._collection = cls._client.get_collection(name=collection_name)
            print(f"Using existing collection with optimized HNSW")
            try:
                cls._collection.modify(
                    metadata={
                        "hnsw:space": "cosine",
                        "hnsw:M": hnsw_m,
                        "hnsw:construction_ef": hnsw_construction_ef,
                        "hnsw:search_ef": hnsw_search_ef,
                    }
                )
                print("HNSW parameters updated")
            except Exception as e:
                print(f"Note: Could not update HNSW params (may need to recreate collection): {e}")
        else:
            cls._collection = cls._client.create_collection(
                name=collection_name,
                metadata={
                    "hnsw:space": "cosine",
                    "hnsw:M": hnsw_m,
                    "hnsw:construction_ef": hnsw_construction_ef,
                    "hnsw:search_ef": hnsw_search_ef,
                }
            )
            print(f"Created new collection with optimized HNSW")
        
        print(f"ChromaDB collection '{collection_name}' ready")

    def add_item(
        self,
        embedding: List[float],
        text: Optional[str] = None,
        image_path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        item_id = str(uuid.uuid4())
        
        item_metadata = metadata or {}
        if text:
            item_metadata["text"] = text
        if image_path:
            item_metadata["image_path"] = image_path
        item_metadata["has_image"] = image_path is not None
        item_metadata["has_text"] = text is not None
        
        documents = [text if text else (image_path or "")]
        
        self._collection.add(
            ids=[item_id],
            embeddings=[embedding],
            documents=documents,
            metadatas=[item_metadata]
        )
        
        return item_id

    def add_items(
        self,
        embeddings: List[List[float]],
        texts: Optional[List[str]] = None,
        image_paths: Optional[List[str]] = None,
        metadatas: Optional[List[Dict[str, Any]]] = None,
        batch_size: int = 1000
    ) -> List[str]:
        n = len(embeddings)
        all_ids = []
        
        for start in range(0, n, batch_size):
            end = min(start + batch_size, n)
            batch_embeddings = embeddings[start:end]
            batch_texts = texts[start:end] if texts else None
            batch_image_paths = image_paths[start:end] if image_paths else None
            batch_metadatas = metadatas[start:end] if metadatas else None
            
            batch_ids = self._add_batch(
                batch_embeddings,
                batch_texts,
                batch_image_paths,
                batch_metadatas
            )
            all_ids.extend(batch_ids)
            print(f"Indexed batch {start//batch_size + 1}/{(n-1)//batch_size + 1}: {len(batch_ids)} items")
        
        return all_ids

    def _add_batch(
        self,
        embeddings: List[List[float]],
        texts: Optional[List[str]] = None,
        image_paths: Optional[List[str]] = None,
        metadatas: Optional[List[Dict[str, Any]] = None
    ) -> List[str]:
        n = len(embeddings)
        ids = [str(uuid.uuid4()) for _ in range(n)]
        
        if texts is None:
            texts = [""] * n
        if image_paths is None:
            image_paths = [""] * n
        if metadatas is None:
            metadatas = [{} for _ in range(n)]
        
        item_metadatas = []
        for i in range(n):
            md = dict(metadatas[i])
            if texts[i]:
                md["text"] = texts[i]
            if image_paths[i]:
                md["image_path"] = image_paths[i]
            md["has_image"] = image_paths[i] is not None and image_paths[i] != ""
            md["has_text"] = texts[i] is not None and texts[i] != ""
            item_metadatas.append(md)
        
        documents = [t if t else (img or "") for t, img in zip(texts, image_paths)]
        
        self._collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=item_metadatas
        )
        
        return ids

    def search(
        self,
        query_embedding: List[float],
        top_k: int = 10,
        filter_metadata: Optional[Dict[str, Any]] = None,
        search_ef: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=filter_metadata
        )
        
        items = []
        for i in range(len(results["ids"][0])):
            item = {
                "id": results["ids"][0][i],
                "score": float(results["distances"][0][i]),
                "metadata": results["metadatas"][0][i],
                "document": results["documents"][0][i]
            }
            items.append(item)
        
        return items

    def search_batch(
        self,
        query_embeddings: List[List[float]],
        top_k: int = 10,
        filter_metadata: Optional[Dict[str, Any]] = None
    ) -> List[List[Dict[str, Any]]]:
        all_results = []
        for emb in query_embeddings:
            results = self._collection.query(
                query_embeddings=[emb],
                n_results=top_k,
                where=filter_metadata
            )
            
            items = []
            for i in range(len(results["ids"][0])):
                item = {
                    "id": results["ids"][0][i],
                    "score": float(results["distances"][0][i]),
                    "metadata": results["metadatas"][0][i],
                    "document": results["documents"][0][i]
                }
                items.append(item)
            all_results.append(items)
        
        return all_results

    def get_all(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        results = self._collection.get(
            limit=limit,
            offset=offset,
            include=["metadatas", "documents", "embeddings"]
        )
        
        items = []
        for i in range(len(results["ids"])):
            item = {
                "id": results["ids"][i],
                "metadata": results["metadatas"][i],
                "document": results["documents"][i],
                "embedding": results["embeddings"][i] if "embeddings" in results else None
            }
            items.append(item)
        
        return items

    def get_by_ids(self, ids: List[str]) -> List[Dict[str, Any]]:
        if not ids:
            return []
        
        results = self._collection.get(
            ids=ids,
            include=["metadatas", "documents", "embeddings"]
        )
        
        items = []
        for i in range(len(results["ids"])):
            item = {
                "id": results["ids"][i],
                "metadata": results["metadatas"][i],
                "document": results["documents"][i],
                "embedding": results["embeddings"][i] if "embeddings" in results else None
            }
            items.append(item)
        
        return items

    def delete(self, item_id: str) -> None:
        self._collection.delete(ids=[item_id])

    def delete_by_ids(self, ids: List[str]) -> None:
        if ids:
            self._collection.delete(ids=ids)

    def delete_all(self) -> None:
        all_ids = self._collection.get()["ids"]
        if all_ids:
            self._collection.delete(ids=all_ids)

    def count(self) -> int:
        return self._collection.count()

    def recreate_collection_with_optimized_index(self, hnsw_m: int = 64, hnsw_construction_ef: int = 500, hnsw_search_ef: int = 128) -> None:
        collection_name = os.getenv("CHROMA_COLLECTION_NAME", "multimodal_search")
        
        print(f"Recreating collection with HNSW: M={hnsw_m}, construction_ef={hnsw_construction_ef}, search_ef={hnsw_search_ef}")
        
        all_data = self._collection.get(include=["metadatas", "documents", "embeddings"])
        
        self._client.delete_collection(collection_name)
        
        self._collection = self._client.create_collection(
            name=collection_name,
            metadata={
                "hnsw:space": "cosine",
                "hnsw:M": hnsw_m,
                "hnsw:construction_ef": hnsw_construction_ef,
                "hnsw:search_ef": hnsw_search_ef,
            }
        )
        
        if all_data["ids"]:
            self._collection.add(
                ids=all_data["ids"],
                embeddings=all_data["embeddings"],
                documents=all_data["documents"],
                metadatas=all_data["metadatas"]
            )
            print(f"Reindexed {len(all_data['ids'])} items")
        
        print("Collection recreated successfully")
