import io
from typing import Tuple, List, Dict, Any
import pandas as pd
from openpyxl import load_workbook
from .base_parser import BaseParser
from ..schemas.document import TableData, ImageData


class ExcelParser(BaseParser):
    def __init__(self, file_path: str, original_filename: str):
        super().__init__(file_path, original_filename)
        self.file_type = "excel"

    def parse(self) -> Tuple[str, List[TableData], List[ImageData], Dict[str, Any]]:
        text_content_parts: List[str] = []
        tables: List[TableData] = []
        images: List[ImageData] = []
        metadata: Dict[str, Any] = {}

        try:
            xls = pd.ExcelFile(self.file_path)
            sheet_names = xls.sheet_names
            metadata["sheet_count"] = len(sheet_names)
            metadata["sheet_names"] = sheet_names

            for sheet_name in sheet_names:
                text_content_parts.append(f"--- Sheet: {sheet_name} ---")

                df = pd.read_excel(self.file_path, sheet_name=sheet_name)

                if not df.empty:
                    headers = [str(col) for col in df.columns]
                    rows = []
                    for _, row in df.iterrows():
                        rows.append([str(cell) if pd.notna(cell) else "" for cell in row])

                    csv_content = df.to_csv(index=False)

                    tables.append(TableData(
                        sheet_name=sheet_name,
                        headers=headers,
                        rows=rows,
                        csv_content=csv_content
                    ))

                    text_content_parts.append(df.to_string(index=False))
                    text_content_parts.append("")

        except Exception as e:
            text_content_parts.append(f"解析 Excel 时出错: {str(e)}")

        try:
            wb = load_workbook(self.file_path, data_only=True)
            props = wb.properties
            if props:
                if props.title:
                    metadata["title"] = props.title
                if props.creator:
                    metadata["author"] = props.creator
                if props.created:
                    metadata["creation_date"] = props.created
        except Exception:
            pass

        metadata["file_type"] = self.file_type
        text_content = "\n".join(text_content_parts)

        return text_content, tables, images, metadata
