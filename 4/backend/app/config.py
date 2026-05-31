from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "FEA Mesh Generator"
    DATABASE_URL: str = "sqlite:///./data/fea_tool.db"
    UPLOAD_DIR: Path = Path("./data/uploads")
    PROJECT_DIR: Path = Path("./data/projects")
    MESH_DIR: Path = Path("./data/meshes")
    RESULTS_DIR: Path = Path("./data/results")

    class Config:
        env_file = ".env"


settings = Settings()

settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.PROJECT_DIR.mkdir(parents=True, exist_ok=True)
settings.MESH_DIR.mkdir(parents=True, exist_ok=True)
settings.RESULTS_DIR.mkdir(parents=True, exist_ok=True)
Path("./data").mkdir(parents=True, exist_ok=True)
