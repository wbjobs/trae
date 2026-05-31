import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Local RAG Service"
    APP_VERSION: str = "1.0.0"

    CHROMA_DB_DIR: str = os.path.join(os.path.dirname(__file__), "chroma_db")
    COLLECTION_NAME: str = "documents"

    EMBEDDING_MODEL_NAME: str = "BAAI/bge-small-zh-v1.5"
    EMBEDDING_DEVICE: str = "cpu"

    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 50

    TOP_K: int = 3
    SIMILARITY_THRESHOLD: float = 0.5
    USE_HYBRID_SEARCH: bool = True
    BM25_WEIGHT: float = 0.5
    VECTOR_WEIGHT: float = 0.5
    RRF_K: int = 60
    TEMPERATURE: float = 0.7
    MAX_TOKENS: int = 2048

    LLAMA_CPP_BASE_URL: str = "http://localhost:8080"
    LLAMA_CPP_API_KEY: str = "EMPTY"
    LLAMA_CPP_MODEL: str = "default"

    UPLOAD_DIR: str = os.path.join(os.path.dirname(__file__), "uploads"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
