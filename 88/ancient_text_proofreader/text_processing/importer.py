"""
古籍文本批量导入模块 - Text Importer
支持多种格式文本读取和批量导入
"""

import os
import re
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class TextDocument:
    """文本文档数据结构"""
    file_path: str
    file_name: str
    file_type: str
    content: str
    raw_content: str
    encoding: str = "utf-8"
    metadata: Dict[str, Any] = field(default_factory=dict)
    char_count: int = 0
    line_count: int = 0

    def __post_init__(self):
        self.char_count = len(self.content)
        self.line_count = len(self.content.splitlines())


class TextImporter:
    """古籍文本批量导入器"""

    SUPPORTED_FORMATS = {
        ".txt": "text",
        ".md": "markdown",
        ".csv": "csv",
        ".json": "json",
        ".xml": "xml",
        ".html": "html",
        ".pdf": "pdf",
        ".doc": "word",
        ".docx": "word",
    }

    def __init__(self, input_dir: Optional[str] = None):
        """
        初始化文本导入器

        Args:
            input_dir: 输入目录
        """
        self.input_dir = input_dir
        self.documents: List[TextDocument] = []

    def import_file(self, file_path: str) -> Optional[TextDocument]:
        """
        导入单个文件

        Args:
            file_path: 文件路径

        Returns:
            文本文档对象
        """
        if not os.path.exists(file_path):
            print(f"文件不存在: {file_path}")
            return None

        file_ext = Path(file_path).suffix.lower()
        if file_ext not in self.SUPPORTED_FORMATS:
            print(f"不支持的文件格式: {file_ext}")
            return None

        try:
            file_type = self.SUPPORTED_FORMATS[file_ext]
            raw_content, content, encoding = self._read_file(file_path, file_type)

            doc = TextDocument(
                file_path=file_path,
                file_name=os.path.basename(file_path),
                file_type=file_type,
                content=content,
                raw_content=raw_content,
                encoding=encoding,
                metadata={"file_size": os.path.getsize(file_path)}
            )

            self.documents.append(doc)
            print(f"成功导入: {file_path} ({doc.char_count} 字, {doc.line_count} 行)")
            return doc

        except Exception as e:
            print(f"导入文件失败 {file_path}: {str(e)}")
            return None

    def import_directory(self, dir_path: Optional[str] = None,
                         recursive: bool = True,
                         file_filter: Optional[List[str]] = None) -> List[TextDocument]:
        """
        批量导入目录中的文件

        Args:
            dir_path: 目录路径
            recursive: 是否递归子目录
            file_filter: 文件扩展名过滤列表

        Returns:
            导入的文档列表
        """
        dir_path = dir_path or self.input_dir
        if not dir_path or not os.path.exists(dir_path):
            print(f"目录不存在: {dir_path}")
            return []

        imported_docs = []

        if recursive:
            for root, _, files in os.walk(dir_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    if self._should_import(file, file_filter):
                        doc = self.import_file(file_path)
                        if doc:
                            imported_docs.append(doc)
        else:
            for file in os.listdir(dir_path):
                file_path = os.path.join(dir_path, file)
                if os.path.isfile(file_path) and self._should_import(file, file_filter):
                    doc = self.import_file(file_path)
                    if doc:
                        imported_docs.append(doc)

        print(f"批量导入完成: 共导入 {len(imported_docs)} 个文件")
        return imported_docs

    def import_text(self, text: str, source_name: str = "direct_input") -> TextDocument:
        """
        直接导入文本内容

        Args:
            text: 文本内容
            source_name: 来源名称

        Returns:
            文本文档对象
        """
        doc = TextDocument(
            file_path=source_name,
            file_name=source_name,
            file_type="text",
            content=text,
            raw_content=text,
            metadata={"source": "direct_input"}
        )
        self.documents.append(doc)
        return doc

    def _should_import(self, filename: str, file_filter: Optional[List[str]]) -> bool:
        """检查是否应该导入该文件"""
        if file_filter:
            return any(filename.lower().endswith(ext.lower()) for ext in file_filter)
        return True

    def _read_file(self, file_path: str, file_type: str) -> Tuple[str, str, str]:
        """
        读取文件内容

        Args:
            file_path: 文件路径
            file_type: 文件类型

        Returns:
            (原始内容, 处理后内容, 编码)
        """
        encoding = "utf-8"

        if file_type == "text" or file_type == "markdown":
            raw_content = self._read_text_file(file_path)
            content = self._clean_text(raw_content)
        elif file_type == "csv":
            raw_content = self._read_text_file(file_path)
            content = self._parse_csv_content(raw_content)
        elif file_type == "json":
            import json
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            raw_content = json.dumps(data, ensure_ascii=False, indent=2)
            content = self._extract_text_from_json(data)
        elif file_type == "xml":
            raw_content = self._read_text_file(file_path)
            content = self._parse_xml_content(raw_content)
        elif file_type == "html":
            raw_content = self._read_text_file(file_path)
            content = self._parse_html_content(raw_content)
        elif file_type == "pdf":
            raw_content = self._read_pdf_file(file_path)
            content = self._clean_text(raw_content)
        elif file_type == "word":
            raw_content = self._read_word_file(file_path)
            content = self._clean_text(raw_content)
        else:
            raw_content = self._read_text_file(file_path)
            content = self._clean_text(raw_content)

        return raw_content, content, encoding

    def _read_text_file(self, file_path: str) -> str:
        """读取纯文本文件"""
        encodings = ["utf-8", "gbk", "gb2312", "big5", "utf-16", "latin-1"]

        for encoding in encodings:
            try:
                with open(file_path, "r", encoding=encoding) as f:
                    return f.read()
            except UnicodeDecodeError:
                continue

        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    def _clean_text(self, text: str) -> str:
        """清理文本"""
        text = re.sub(r"\r\n", "\n", text)
        text = re.sub(r"\r", "\n", text)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = text.strip()
        return text

    def _parse_csv_content(self, content: str) -> str:
        """解析CSV内容"""
        lines = content.split("\n")
        text_parts = []
        for line in lines:
            cells = line.split(",")
            text_parts.append(" ".join([cell.strip().strip('"') for cell in cells]))
        return "\n".join(text_parts)

    def _extract_text_from_json(self, data: Any) -> str:
        """从JSON中提取文本"""
        if isinstance(data, str):
            return data
        elif isinstance(data, dict):
            texts = []
            for key, value in data.items():
                if isinstance(value, str):
                    texts.append(f"{key}: {value}")
                elif isinstance(value, (dict, list)):
                    texts.append(self._extract_text_from_json(value))
            return "\n".join(texts)
        elif isinstance(data, list):
            return "\n".join([self._extract_text_from_json(item) for item in data])
        return str(data)

    def _parse_xml_content(self, content: str) -> str:
        """解析XML内容"""
        text = re.sub(r"<[^>]+>", " ", content)
        text = re.sub(r"&[a-zA-Z]+;", " ", text)
        return self._clean_text(text)

    def _parse_html_content(self, content: str) -> str:
        """解析HTML内容"""
        text = re.sub(r"<script[^>]*>.*?</script>", "", content, flags=re.DOTALL)
        text = re.sub(r"<style[^>]*>.*?</style>", "", content, flags=re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"&[a-zA-Z]+;", " ", text)
        return self._clean_text(text)

    def _read_pdf_file(self, file_path: str) -> str:
        """读取PDF文件（需要额外库支持）"""
        try:
            import PyPDF2
            with open(file_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                text = ""
                for page in reader.pages:
                    text += page.extract_text() + "\n"
                return text
        except ImportError:
            print("警告: 未安装PyPDF2库，无法读取PDF文件")
            return ""
        except Exception as e:
            print(f"读取PDF文件失败: {str(e)}")
            return ""

    def _read_word_file(self, file_path: str) -> str:
        """读取Word文档（需要额外库支持）"""
        try:
            from docx import Document
            doc = Document(file_path)
            text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
            return text
        except ImportError:
            print("警告: 未安装python-docx库，无法读取Word文件")
            return ""
        except Exception as e:
            print(f"读取Word文件失败: {str(e)}")
            return ""

    def get_documents(self) -> List[TextDocument]:
        """获取所有导入的文档"""
        return self.documents

    def get_document_count(self) -> int:
        """获取文档数量"""
        return len(self.documents)

    def get_total_chars(self) -> int:
        """获取总字符数"""
        return sum(doc.char_count for doc in self.documents)

    def clear(self) -> None:
        """清空已导入的文档"""
        self.documents.clear()
