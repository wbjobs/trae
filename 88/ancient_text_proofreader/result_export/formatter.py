"""
古籍排版复原模块 - Text Formatter
实现古籍排版格式的复原和美化
"""

import re
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, field


@dataclass
class FormatConfig:
    """排版配置"""
    page_width: int = 20
    line_spacing: int = 1
    paragraph_spacing: int = 2
    use_vertical: bool = False
    use_traditional: bool = False
    add_page_numbers: bool = True
    header_text: str = ""
    footer_text: str = ""
    indent_size: int = 2
    use_annotations: bool = True
    annotation_style: str = "inline"


@dataclass
class FormattedResult:
    """格式化结果"""
    original_text: str
    formatted_text: str
    pages: List[str]
    config: FormatConfig
    statistics: Dict[str, Any] = field(default_factory=dict)


class TextFormatter:
    """古籍文本格式化器"""

    def __init__(self, config: Optional[FormatConfig] = None):
        """
        初始化格式化器

        Args:
            config: 排版配置
        """
        self.config = config or FormatConfig()

        self.punctuation_fullwidth = {
            ",": "，",
            ".": "。",
            "?": "？",
            "!": "！",
            ";": "；",
            ":": "：",
            "(": "（",
            ")": "）",
            "[": "【",
            "]": "】",
            "\"": "「",
            "'": "「",
            "<": "《",
            ">": "》",
        }

    def format_text(self, text: str, config: Optional[FormatConfig] = None) -> FormattedResult:
        """
        格式化文本

        Args:
            text: 待格式化文本
            config: 排版配置（覆盖默认）

        Returns:
            格式化结果
        """
        config = config or self.config

        text = self._normalize_punctuation(text)
        text = self._clean_text(text)

        paragraphs = self._split_paragraphs(text)
        formatted_paragraphs = []

        for para in paragraphs:
            if config.use_vertical:
                formatted_para = self._format_vertical(para, config)
            else:
                formatted_para = self._format_horizontal(para, config)
            formatted_paragraphs.append(formatted_para)

        formatted_text = ("\n" * config.paragraph_spacing).join(formatted_paragraphs)

        if config.add_page_numbers:
            pages = self._paginate(formatted_text, config)
            formatted_with_pages = self._add_page_numbers(pages, config)
            formatted_text = "\n".join(formatted_with_pages)
        else:
            pages = [formatted_text]

        result = FormattedResult(
            original_text=text,
            formatted_text=formatted_text,
            pages=pages,
            config=config
        )

        result.statistics = self._get_statistics(result)
        return result

    def _normalize_punctuation(self, text: str) -> str:
        """标准化标点符号"""
        for halfwidth, fullwidth in self.punctuation_fullwidth.items():
            text = text.replace(halfwidth, fullwidth)

        text = re.sub(r"''", "「」", text)
        text = re.sub(r"\"\"", "「」", text)

        return text

    def _clean_text(self, text: str) -> str:
        """清理文本"""
        text = re.sub(r"\r\n", "\n", text)
        text = re.sub(r"\r", "\n", text)
        text = re.sub(r"[ \t]+", " ", text)
        text = text.strip()
        return text

    def _split_paragraphs(self, text: str) -> List[str]:
        """分段"""
        paragraphs = re.split(r"\n\s*\n", text)
        return [p.strip() for p in paragraphs if p.strip()]

    def _format_horizontal(self, text: str, config: FormatConfig) -> str:
        """横排格式化"""
        lines = []
        current_line = ""

        indent = "　" * config.indent_size
        text = indent + text

        for char in text:
            if char == "\n":
                lines.append(current_line)
                current_line = ""
                continue

            if len(current_line) >= config.page_width:
                if self._is_safe_break(current_line, char):
                    lines.append(current_line)
                    current_line = char
                else:
                    current_line += char
            else:
                current_line += char

        if current_line:
            lines.append(current_line)

        return "\n".join(lines)

    def _format_vertical(self, text: str, config: FormatConfig) -> str:
        """竖排格式化（简化版）"""
        lines = self._format_horizontal(text, config).split("\n")

        max_len = max(len(line) for line in lines) if lines else 0
        padded_lines = [line.ljust(max_len) for line in lines]

        vertical_lines = []
        for col in range(max_len):
            vertical_line = "".join([line[col] for line in padded_lines])
            vertical_lines.append(vertical_line)

        return "\n".join(vertical_lines)

    def _is_safe_break(self, current_line: str, next_char: str) -> bool:
        """判断是否安全换行"""
        unsafe_leading = ["，", "。", "！", "？", "；", "：", "、", "」", "』", "）", "】"]
        unsafe_trailing = ["「", "『", "（", "【"]

        if next_char in unsafe_leading:
            return False

        if current_line and current_line[-1] in unsafe_trailing:
            return False

        return True

    def _paginate(self, text: str, config: FormatConfig) -> List[str]:
        """分页"""
        lines = text.split("\n")
        lines_per_page = 30

        pages = []
        current_page = []

        for line in lines:
            current_page.append(line)
            if len(current_page) >= lines_per_page:
                pages.append("\n".join(current_page))
                current_page = []

        if current_page:
            pages.append("\n".join(current_page))

        return pages

    def _add_page_numbers(self, pages: List[str], config: FormatConfig) -> List[str]:
        """添加页码"""
        result = []
        total_pages = len(pages)

        for i, page in enumerate(pages, 1):
            page_text = page

            if config.header_text:
                header = f"{config.header_text} 第{i}页/共{total_pages}页"
                page_text = header + "\n" + "=" * config.page_width + "\n" + page_text

            if config.footer_text:
                footer = "=" * config.page_width + f"\n{config.footer_text}"
                page_text = page_text + "\n" + footer
            else:
                footer = "=" * config.page_width + f"\n第{i}页"
                page_text = page_text + "\n" + footer

            result.append(page_text)

        return result

    def _get_statistics(self, result: FormattedResult) -> Dict[str, Any]:
        """获取统计信息"""
        lines = result.formatted_text.split("\n")
        paragraphs = result.original_text.split("\n\n")

        return {
            "original_length": len(result.original_text),
            "formatted_length": len(result.formatted_text),
            "total_lines": len(lines),
            "total_pages": len(result.pages),
            "paragraph_count": len(paragraphs),
            "is_vertical": result.config.use_vertical,
            "page_width": result.config.page_width
        }

    def format_for_print(self, text: str, title: str = "", author: str = "") -> str:
        """
        打印格式排版

        Args:
            text: 文本
            title: 标题
            author: 作者

        Returns:
            排版后的文本
        """
        result = []

        if title:
            result.append(title.center(self.config.page_width))
            result.append("")
        if author:
            result.append(author.rjust(self.config.page_width))
            result.append("")

        result.append("=" * self.config.page_width)
        result.append("")

        formatted = self.format_text(text)
        result.append(formatted.formatted_text)

        return "\n".join(result)

    def format_for_web(self, text: str, title: str = "") -> str:
        """
        Web格式排版（HTML）

        Args:
            text: 文本
            title: 标题

        Returns:
            HTML格式文本
        """
        html = []

        if title:
            html.append(f"<h1>{title}</h1>")

        paragraphs = self._split_paragraphs(text)
        html.append("<div class='ancient-text'>")
        for para in paragraphs:
            para = self._normalize_punctuation(para)
            html.append(f"  <p>{para}</p>")
        html.append("</div>")

        return "\n".join(html)

    def format_for_markdown(self, text: str, title: str = "") -> str:
        """
        Markdown格式排版

        Args:
            text: 文本
            title: 标题

        Returns:
            Markdown格式文本
        """
        md = []

        if title:
            md.append(f"# {title}")
            md.append("")

        paragraphs = self._split_paragraphs(text)
        for para in paragraphs:
            para = self._normalize_punctuation(para)
            md.append(para)
            md.append("")

        return "\n".join(md)

    def generate_classic_layout(self, text: str, title: str = "", author: str = "",
                                add_comments: bool = False) -> str:
        """
        生成古籍版式

        Args:
            text: 文本
            title: 标题
            author: 作者
            add_comments: 是否添加批注位置

        Returns:
            古籍版式文本
        """
        layout = []

        page_width = self.config.page_width

        if title:
            layout.append(" " * ((page_width - len(title) * 2) // 2) + "  ".join(title))
            layout.append("")

        if author:
            layout.append(" " * (page_width - len(author) * 2 - 4) + "  ".join(author))
            layout.append("")

        layout.append("─" * page_width)
        layout.append("")

        formatted = self.format_text(text)
        layout.append(formatted.formatted_text)

        if add_comments:
            layout.append("")
            layout.append("【批注】")
            layout.append("_" * page_width)
            layout.append("")
            layout.append("_" * page_width)

        return "\n".join(layout)
