import os
from typing import Type
from .base_parser import BaseParser
from .pdf_parser import PDFParser
from .word_parser import WordParser
from .excel_parser import ExcelParser
from .image_parser import ImageParser


class ParserFactory:
    _parsers = {
        "pdf": PDFParser,
        "docx": WordParser,
        "doc": WordParser,
        "xlsx": ExcelParser,
        "xls": ExcelParser,
        "png": ImageParser,
        "jpg": ImageParser,
        "jpeg": ImageParser,
        "gif": ImageParser,
        "bmp": ImageParser,
        "tiff": ImageParser,
    }

    @classmethod
    def get_parser(cls, file_path: str, original_filename: str) -> BaseParser:
        ext = os.path.splitext(original_filename)[1].lower().lstrip(".")

        if ext not in cls._parsers:
            raise ValueError(f"Unsupported file type: {ext}")

        parser_class: Type[BaseParser] = cls._parsers[ext]
        return parser_class(file_path, original_filename)

    @classmethod
    def get_supported_extensions(cls):
        return list(cls._parsers.keys())
