import os
import uuid
from abc import ABC, abstractmethod
from typing import Tuple, List, Dict, Any, Optional
from datetime import datetime
from ..config import settings
from ..schemas.document import TableData, ImageData


class BaseParser(ABC):
    def __init__(self, file_path: str, original_filename: str):
        self.file_path = file_path
        self.original_filename = original_filename
        self.file_size = os.path.getsize(file_path)
        self.document_id = str(uuid.uuid4())

    def get_document_info(self) -> Dict[str, Any]:
        return {
            "document_id": self.document_id,
            "filename": self.original_filename,
            "file_size": self.file_size,
            "upload_time": datetime.utcnow(),
        }

    def save_image(self, image_bytes: bytes, extension: str, page_number: Optional[int] = None) -> ImageData:
        image_id = str(uuid.uuid4())
        image_filename = f"{self.document_id}_{image_id}.{extension}"
        image_path = os.path.join(settings.EXTRACTED_IMAGES_DIR, image_filename)

        with open(image_path, "wb") as f:
            f.write(image_bytes)

        return ImageData(
            image_id=image_id,
            file_path=image_path,
            page_number=page_number
        )

    @abstractmethod
    def parse(self) -> Tuple[str, List[TableData], List[ImageData], Dict[str, Any]]:
        pass
