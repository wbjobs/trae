"""
提示词模板 - Prompt Templates
提供古文处理任务的提示词模板
"""

from typing import Dict, List, Optional


class PromptTemplates:
    """古文处理提示词模板库"""

    @staticmethod
    def get_punctuation_prompt(text: str) -> str:
        """
        古籍断句标点提示词

        Args:
            text: 无标点古籍文本

        Returns:
            格式化的提示词
        """
        return f"""你是一位精通中国古代文献的专家，请为以下无标点的古籍文本添加正确的标点符号（逗号、句号、问号、感叹号、顿号、分号、冒号、引号、括号等），并进行适当的断句。

要求：
1. 严格遵循古代汉语的语法和语义
2. 保持原文的文字和顺序不变，只添加标点
3. 注意引文、对话的标点使用
4. 对专有名词、人名、地名、书名等保持原样

原文：
{text}

请输出添加标点后的完整文本："""

    @staticmethod
    def get_variant_recognition_prompt(text: str) -> str:
        """
        异体字识别提示词

        Args:
            text: 包含异体字的文本

        Returns:
            格式化的提示词
        """
        return f"""你是一位精通中国古文字学的专家，请识别以下文本中的异体字、通假字、俗体字、古体字等，并将其转换为对应的现代标准汉字。

要求：
1. 识别所有非常用字的异体字
2. 提供异体字与标准字的对应关系
3. 保持原文的语义和语序不变
4. 对于不确定的字，请标注"待考"

原文：
{text}

请按以下格式输出：
1. 异体字识别结果（异体字 -> 标准字）：
2. 转换后的标准文本："""

    @staticmethod
    def get_meaning_annotation_prompt(text: str, char_list: List[str]) -> str:
        """
        字义释义提示词

        Args:
            text: 原文文本
            char_list: 需要释义的字列表

        Returns:
            格式化的提示词
        """
        chars_str = "、".join(char_list)
        return f"""你是一位精通中国古代文献和训诂学的专家，请为以下文本中指定的汉字提供详细的释义。

需要释义的字：{chars_str}

原文：
{text}

请为每个字提供：
1. 读音（拼音）
2. 在此处的具体含义
3. 词性
4. 用例（如果有）
5. 字源说明（如果有）

请按以下格式输出：
【字1】
读音：
含义：
词性：
用例：
字源：

【字2】
..."""

    @staticmethod
    def get_grammar_check_prompt(text: str) -> str:
        """
        句式语序勘误提示词

        Args:
            text: 需要检查的文本

        Returns:
            格式化的提示词
        """
        return f"""你是一位精通中国古代汉语语法的专家，请检查以下古籍文本的句式、语序和语法，找出可能存在的错误或需要校正的地方。

检查内容：
1. 语序是否符合古代汉语习惯
2. 是否存在句式杂糅或语法错误
3. 是否有脱文、衍文、倒文等校勘问题
4. 虚词使用是否恰当

原文：
{text}

请按以下格式输出：
1. 语法检查结果：
2. 发现的问题（位置、问题描述）：
3. 校正建议：
4. 校正后的文本："""

    @staticmethod
    def get_text_comparison_prompt(original_text: str, corrected_text: str) -> str:
        """
        文本对比分析提示词

        Args:
            original_text: 原文
            corrected_text: 校正后文本

        Returns:
            格式化的提示词
        """
        return f"""你是一位精通古籍校勘的专家，请对比以下两段文本，分析原文与校正文本的差异，并说明校正的依据。

原文：
{original_text}

校正后：
{corrected_text}

请按以下格式输出：
1. 主要差异点：
2. 校正依据说明：
3. 校勘记："""

    @staticmethod
    def get_general_ancient_text_prompt(task: str, text: str) -> str:
        """
        通用古文处理提示词

        Args:
            task: 任务描述
            text: 待处理文本

        Returns:
            格式化的提示词
        """
        return f"""你是一位精通中国古代文献的专家，请完成以下任务：

任务：{task}

文本：
{text}

请输出处理结果："""

    @staticmethod
    def get_system_prompt() -> str:
        """系统提示词"""
        return """你是一位专业的中国古典文献研究AI助手，精通甲骨文、金文、小篆、隶书等古文字，熟悉《说文解字》《康熙字典》《尔雅》《广雅》等训诂著作，能够准确识别异体字、通假字、俗体字，并进行专业的古籍校勘和注释工作。

你的专业能力包括：
1. 异体字识别与转换
2. 古籍断句与标点
3. 词义训诂与溯源
4. 句式语法分析
5. 版本校勘与比对
6. 古籍排版与复原

请始终以严谨的学术态度处理用户的请求，对于不确定的内容要明确标注，避免臆断。"""
