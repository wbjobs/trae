import io
import os
import re
from typing import Tuple, List, Dict, Any, Optional
import pdfplumber
from PIL import Image
from .base_parser import BaseParser
from ..schemas.document import TableData, ImageData


class PDFParser(BaseParser):
    def __init__(self, file_path: str, original_filename: str):
        super().__init__(file_path, original_filename)
        self.file_type = "pdf"

    def parse(self) -> Tuple[str, List[TableData], List[ImageData], Dict[str, Any]]:
        text_content_parts: List[str] = []
        tables: List[TableData] = []
        images: List[ImageData] = []
        metadata: Dict[str, Any] = {}
        page_count = 0

        self.table_settings = {
            "vertical_strategy": "text",
            "horizontal_strategy": "text",
            "snap_tolerance": 6,
            "join_tolerance": 4,
            "edge_min_length": 3,
            "min_words_vertical": 3,
            "min_words_horizontal": 2,
            "intersection_tolerance": 6,
        }

        with pdfplumber.open(self.file_path) as pdf:
            page_count = len(pdf.pages)

            if pdf.metadata:
                metadata["title"] = pdf.metadata.get("Title")
                metadata["author"] = pdf.metadata.get("Author")
                metadata["creation_date"] = pdf.metadata.get("CreationDate")

            pending_tables: List[Dict[str, Any]] = []

            for page_num, page in enumerate(pdf.pages, 1):
                text = page.extract_text()
                if text:
                    text_content_parts.append(f"--- 第 {page_num} 页 ---\n{text}\n")

                page_tables = self._extract_tables_with_settings(page)

                if page_tables:
                    for table_idx, table in enumerate(page_tables):
                        if table and len(table) > 0:
                            cleaned_table = self._clean_table(table)
                            if not cleaned_table:
                                continue

                            is_continuation = False
                            if pending_tables:
                                last_pending = pending_tables[-1]
                                if self._is_table_continuation(last_pending["table"], cleaned_table):
                                    self._merge_table(last_pending["table"], cleaned_table)
                                    last_pending["end_page"] = page_num
                                    is_continuation = True

                            if not is_continuation:
                                pending_tables.append({
                                    "table": cleaned_table,
                                    "start_page": page_num,
                                    "end_page": page_num,
                                    "table_idx": table_idx
                                })

                completed_tables = []
                for pt in pending_tables:
                    if not self._is_table_truncated(page, pt["table"]):
                        completed_tables.append(pt)

                for ct in completed_tables:
                    pending_tables.remove(ct)
                    table_data = self._create_table_data(
                        ct["table"],
                        ct["start_page"],
                        ct["end_page"]
                    )
                    if table_data:
                        tables.append(table_data)

                page_images = self._extract_images(page, page_num)
                images.extend(page_images)

            for pt in pending_tables:
                table_data = self._create_table_data(
                    pt["table"],
                    pt["start_page"],
                    pt["end_page"]
                )
                if table_data:
                    tables.append(table_data)

        metadata["page_count"] = page_count
        metadata["file_type"] = self.file_type
        text_content = "\n".join(text_content_parts)

        return text_content, tables, images, metadata

    def _extract_tables_with_settings(self, page) -> List[List[List[Optional[str]]]]:
        tables = []
        try:
            tables = page.extract_tables(table_settings=self.table_settings)
        except Exception:
            pass

        if not tables or len(tables) == 0:
            try:
                alt_settings = self.table_settings.copy()
                alt_settings["vertical_strategy"] = "lines"
                alt_settings["horizontal_strategy"] = "lines"
                tables = page.extract_tables(table_settings=alt_settings)
            except Exception:
                pass

        if not tables or len(tables) == 0:
            try:
                alt_settings = self.table_settings.copy()
                alt_settings["vertical_strategy"] = "text"
                alt_settings["horizontal_strategy"] = "lines"
                tables = page.extract_tables(table_settings=alt_settings)
            except Exception:
                pass

        return tables if tables else []

    def _clean_table(self, table: List[List[Optional[str]]]) -> List[List[str]]:
        cleaned = []
        for row in table:
            cleaned_row = []
            for cell in row:
                if cell is None:
                    cleaned_row.append("")
                else:
                    cell_str = str(cell).strip()
                    cell_str = re.sub(r'\s+', ' ', cell_str)
                    cell_str = cell_str.replace('\n', ' ')
                    cell_str = cell_str.replace('\r', '')
                    cell_str = cell_str.replace('\t', ' ')
                    cleaned_row.append(cell_str.strip())

            if not self._is_empty_row(cleaned_row):
                cleaned.append(cleaned_row)

        if len(cleaned) <= 1:
            return cleaned

        first_row = cleaned[0]
        second_row = cleaned[1] if len(cleaned) > 1 else []

        if self._is_header_row(first_row) and len(cleaned) > 2:
            third_row = cleaned[2]
            if self._row_similarity(first_row, third_row) > 0.8:
                cleaned.pop(2)

        return cleaned

    def _is_empty_row(self, row: List[str]) -> bool:
        return all(cell.strip() == "" for cell in row)

    def _is_header_row(self, row: List[str]) -> bool:
        if not row:
            return False
        non_empty = [cell for cell in row if cell.strip()]
        if len(non_empty) < 2:
            return False

        has_keywords = any(
            keyword in cell.lower()
            for cell in non_empty
            for keyword in ["序号", "编号", "名称", "项目", "日期", "金额", "数量", "单位", "备注", "说明", "id", "name", "date", "amount"]
        )
        if has_keywords:
            return True

        all_short = all(len(cell) <= 20 for cell in non_empty)
        no_numbers = not any(any(c.isdigit() for c in cell) for cell in non_empty)
        return all_short and no_numbers

    def _row_similarity(self, row1: List[str], row2: List[str]) -> float:
        if len(row1) != len(row2):
            return 0.0

        matches = sum(1 for a, b in zip(row1, row2) if a.lower() == b.lower())
        return matches / len(row1) if len(row1) > 0 else 0.0

    def _is_table_continuation(self, prev_table: List[List[str]], curr_table: List[List[str]]) -> bool:
        if not prev_table or not curr_table:
            return False

        if len(prev_table) < 2 or len(curr_table) < 1:
            return False

        prev_last_row = prev_table[-1]
        curr_first_row = curr_table[0]

        if len(prev_last_row) != len(curr_first_row):
            return False

        if self._is_header_row(curr_first_row):
            prev_headers = prev_table[0]
            similarity = self._row_similarity(prev_headers, curr_first_row)
            if similarity > 0.6:
                return True

        if len(prev_table) >= 2:
            prev_second_last = prev_table[-2]
            if len(prev_second_last) == len(curr_first_row):
                prev_avg_len = sum(len(cell) for cell in prev_last_row) / len(prev_last_row) if prev_last_row else 0
                curr_avg_len = sum(len(cell) for cell in curr_first_row) / len(curr_first_row) if curr_first_row else 0
                if prev_avg_len < 5 and curr_avg_len > 5:
                    return False

        prev_headers = prev_table[0]
        if len(curr_first_row) == len(prev_headers):
            curr_non_empty = sum(1 for cell in curr_first_row if cell.strip())
            prev_non_empty = sum(1 for cell in prev_headers if cell.strip())
            if curr_non_empty >= prev_non_empty * 0.6:
                return True

        return False

    def _merge_table(self, prev_table: List[List[str]], curr_table: List[List[str]]):
        if not curr_table:
            return

        start_idx = 0
        if len(curr_table) > 0 and self._is_header_row(curr_table[0]):
            if len(prev_table) > 0:
                prev_headers = prev_table[0]
                similarity = self._row_similarity(prev_headers, curr_table[0])
                if similarity > 0.5:
                    start_idx = 1

        for row in curr_table[start_idx:]:
            if not self._is_empty_row(row):
                prev_table.append(row)

    def _is_table_truncated(self, page, table: List[List[str]]) -> bool:
        if not table:
            return False

        try:
            last_row_text = ' '.join(table[-1])
            page_text = page.extract_text() or ''

            if last_row_text in page_text:
                idx = page_text.rfind(last_row_text)
                text_after = page_text[idx + len(last_row_text):].strip()
                if len(text_after) < 50:
                    return True
        except Exception:
            pass

        return False

    def _create_table_data(self, table: List[List[str]], start_page: int, end_page: int) -> Optional[TableData]:
        if not table or len(table) == 0:
            return None

        if len(table) == 1:
            headers = table[0]
            rows = []
        else:
            headers = table[0]
            rows = table[1:]

        if self._is_empty_row(headers) and not rows:
            return None

        max_cols = max(len(headers), max((len(row) for row in rows), default=0))
        while len(headers) < max_cols:
            headers.append("")
        for row in rows:
            while len(row) < max_cols:
                row.append("")

        csv_content = self._table_to_csv(headers, rows)

        page_info = f"第 {start_page} 页"
        if end_page != start_page:
            page_info = f"第 {start_page}-{end_page} 页"

        return TableData(
            page_number=start_page,
            sheet_name=page_info,
            headers=headers,
            rows=rows,
            csv_content=csv_content
        )

    def _table_to_csv(self, headers: List[str], rows: List[List[str]]) -> str:
        def escape_csv(cell: str) -> str:
            if ',' in cell or '"' in cell or '\n' in cell:
                return '"' + cell.replace('"', '""') + '"'
            return cell

        csv_lines = [",".join(escape_csv(h) for h in headers)]
        for row in rows:
            csv_lines.append(",".join(escape_csv(cell) for cell in row))
        return "\n".join(csv_lines)

    def _extract_images(self, page, page_num: int) -> List[ImageData]:
        extracted_images: List[ImageData] = []
        try:
            if page.images:
                for img_idx, img in enumerate(page.images):
                    try:
                        x0, top, x1, bottom = img["x0"], img["top"], img["x1"], img["bottom"]
                        if x1 <= x0 or bottom <= top:
                            continue

                        page_height = page.height
                        cropped_page = page.crop((x0, top, x1, bottom))
                        img_obj = cropped_page.to_image()
                        img_buffer = io.BytesIO()
                        img_obj.save(img_buffer, format="PNG")
                        img_bytes = img_buffer.getvalue()

                        if len(img_bytes) < 100:
                            continue

                        image_data = self.save_image(img_bytes, "png", page_num)

                        try:
                            with Image.open(io.BytesIO(img_bytes)) as pil_img:
                                image_data.width, image_data.height = pil_img.size
                        except Exception:
                            pass

                        extracted_images.append(image_data)
                    except Exception:
                        continue
        except Exception:
            pass

        return extracted_images
