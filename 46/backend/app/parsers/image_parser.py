import io
from typing import Tuple, List, Dict, Any
import os
from PIL import Image
import pytesseract
from .base_parser import BaseParser
from ..schemas.document import TableData, ImageData
from ..config import settings


class ImageParser(BaseParser):
    def __init__(self, file_path: str, original_filename: str):
        super().__init__(file_path, original_filename)
        self.file_type = "image"

        if settings.TESSERACT_CMD:
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD

    def parse(self) -> Tuple[str, List[TableData], List[ImageData], Dict[str, Any]]:
        text_content = ""
        tables: List[TableData] = []
        images: List[ImageData] = []
        metadata: Dict[str, Any] = {}

        try:
            with open(self.file_path, "rb") as f:
                image_bytes = f.read()

            ext = os.path.splitext(self.original_filename)[1].lower().lstrip(".")
            image_data = self.save_image(image_bytes, ext)

            try:
                with Image.open(io.BytesIO(image_bytes)) as pil_img:
                    image_data.width, image_data.height = pil_img.size
                    metadata["width"] = image_data.width
                    metadata["height"] = image_data.height
                    metadata["format"] = pil_img.format
                    metadata["mode"] = pil_img.mode
            except Exception:
                pass

            try:
                with Image.open(io.BytesIO(image_bytes)) as pil_img:
                    text_content = pytesseract.image_to_string(pil_img, lang="chi_sim+eng")
                    image_data.extracted_text = text_content
            except Exception as e:
                text_content = f"[OCR 提取失败: {str(e)}"

            images.append(image_data)

        except Exception as e:
            text_content = f"解析图片时出错: {str(e)}"

        metadata["file_type"] = self.file_type

        return text_content, tables, images, metadata
