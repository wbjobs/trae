from pydantic_settings import BaseSettings
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR.parent / "data"


class Settings(BaseSettings):
    APP_NAME: str = "Code Semantic Search"
    APP_VERSION: str = "1.0.0"
    
    CHROMADB_PATH: str = str(DATA_DIR / "chromadb")
    CHROMADB_COLLECTION: str = "code_snippets"
    
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384
    
    SQLITE_DB_PATH: str = str(DATA_DIR / "sqlite" / "app.db")
    
    MAX_SEARCH_RESULTS: int = 20
    DEFAULT_TOP_K: int = 5
    
    CORS_ORIGINS: list = ["*"]
    
    class Config:
        env_file = ".env"


settings = Settings()
