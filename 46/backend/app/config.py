import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    MONGODB_DB_NAME: str = os.getenv("MONGODB_DB_NAME", "document_parser")

    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./app/uploads")
    EXTRACTED_IMAGES_DIR: str = os.getenv("EXTRACTED_IMAGES_DIR", "./app/extracted_images")

    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo-1106")

    TESSERACT_CMD: str = os.getenv("TESSERACT_CMD", "")

    ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "xlsx", "xls", "png", "jpg", "jpeg", "gif", "bmp", "tiff"}

    MAX_FILE_SIZE: int = 50 * 1024 * 1024


settings = Settings()

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.EXTRACTED_IMAGES_DIR, exist_ok=True)
