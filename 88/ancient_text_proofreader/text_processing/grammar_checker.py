"""
句式语序勘误校正模块 - Grammar Checker
检查古籍文本的语法、语序和校勘问题
"""

import re
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, field

from ..ai_inference.model_client import AncientTextModelClient, InferenceResult
from ..ai_inference.prompt_templates import PromptTemplates


@dataclass
class GrammarIssue:
    """语法问题"""
    position: int
    length: int
    issue_type: str
    description: str
    original_text: str
    suggested_text: str
    confidence: float
    severity: str = "warning"


@dataclass
class GrammarCheckResult:
    """语法检查结果"""
    original_text: str
    corrected_text: str
    issues: List[GrammarIssue]
    method: str
    ai_result: Optional[InferenceResult] = None
    statistics: Dict[str, Any] = field(default_factory=dict)


class GrammarChecker:
    """古籍语法检查器"""

    def __init__(self, use_ai: bool = True, ai_client: Optional[AncientTextModelClient] = None):
        """
        初始化语法检查器

        Args:
            use_ai: 是否使用AI辅助检查
            ai_client: AI模型客户端
        """
        self.use_ai = use_ai
        self.ai_client = ai_client or AncientTextModelClient()

        self.common_issues = [
            {
                "pattern": r"之之",
                "type": "虚词冗余",
                "description": "连续使用两个'之'，可能为衍文",
                "suggestion": "删除一个'之'"
            },
            {
                "pattern": r"而而",
                "type": "虚词冗余",
                "description": "连续使用两个'而'，可能为衍文",
                "suggestion": "删除一个'而'"
            },
            {
                "pattern": r"以以",
                "type": "虚词冗余",
                "description": "连续使用两个'以'，可能为衍文",
                "suggestion": "删除一个'以'"
            },
            {
                "pattern": r"也也",
                "type": "虚词冗余",
                "description": "连续使用两个'也'，可能为衍文",
                "suggestion": "删除一个'也'"
            },
            {
                "pattern": r"者者",
                "type": "虚词冗余",
                "description": "连续使用两个'者'，可能为衍文",
                "suggestion": "删除一个'者'"
            },
            {
                "pattern": r"矣矣",
                "type": "虚词冗余",
                "description": "连续使用两个'矣'，可能为衍文",
                "suggestion": "删除一个'矣'"
            },
        ]

        self.classical_word_order = {
            "question_words": ["何", "安", "焉", "胡", "奚", "曷", "恶", "乌"],
            "negation_words": ["不", "弗", "勿", "毋", "未", "非", "无", "莫"],
            "prepositions": ["于", "以", "为", "与", "从"],
        }

        self.emendation_types = {
            "衍文": "多余的文字，应该删除",
            "脱文": "遗漏的文字，应该补充",
            "倒文": "文字顺序颠倒，应该调整",
            "讹文": "错误的文字，应该改正",
            "异文": "不同版本的文字差异",
        }

    def check_text(self, text: str, use_ai: Optional[bool] = None) -> GrammarCheckResult:
        """
        检查文本的语法和语序问题

        Args:
            text: 待检查文本
            use_ai: 是否使用AI（覆盖默认设置）

        Returns:
            语法检查结果
        """
        use_ai = use_ai if use_ai is not None else self.use_ai

        issues = self._rule_based_check(text)

        if use_ai:
            ai_issues = self._ai_check(text)
            issues.extend(ai_issues)

        issues = self._deduplicate_issues(issues)
        corrected_text = self._apply_corrections(text, issues)

        result = GrammarCheckResult(
            original_text=text,
            corrected_text=corrected_text,
            issues=issues,
            method="ai_hybrid" if use_ai else "rule_based"
        )

        result.statistics = self._get_statistics(result)
        return result

    def _rule_based_check(self, text: str) -> List[GrammarIssue]:
        """基于规则的语法检查"""
        issues = []

        for issue_info in self.common_issues:
            pattern = issue_info["pattern"]
            matches = list(re.finditer(pattern, text))

            for match in matches:
                issues.append(GrammarIssue(
                    position=match.start(),
                    length=match.end() - match.start(),
                    issue_type=issue_info["type"],
                    description=issue_info["description"],
                    original_text=match.group(0),
                    suggested_text=issue_info["suggestion"],
                    confidence=0.7,
                    severity="warning"
                ))

        word_order_issues = self._check_word_order(text)
        issues.extend(word_order_issues)

        redundancy_issues = self._check_redundancy(text)
        issues.extend(redundancy_issues)

        return issues

    def _check_word_order(self, text: str) -> List[GrammarIssue]:
        """检查语序问题"""
        issues = []

        for i, char in enumerate(text):
            if char in self.classical_word_order["question_words"]:
                if i > 0 and i < len(text) - 1:
                    window = text[max(0, i-10):min(len(text), i+10)]

                    if "不" in window and "之" in window:
                        if window.index("不") > window.index("之"):
                            pass

        return issues

    def _check_redundancy(self, text: str) -> List[GrammarIssue]:
        """检查冗余问题"""
        issues = []

        for i in range(len(text) - 1):
            if text[i] == text[i+1]:
                if text[i] in ["之", "而", "以", "于", "其", "也", "矣", "焉", "者"]:
                    issues.append(GrammarIssue(
                        position=i,
                        length=2,
                        issue_type="冗余",
                        description=f"连续使用两个'{text[i]}'，可能为衍文",
                        original_text=text[i:i+2],
                        suggested_text=text[i],
                        confidence=0.6,
                        severity="info"
                    ))

        return issues

    def _ai_check(self, text: str) -> List[GrammarIssue]:
        """使用AI进行语法检查"""
        prompt = PromptTemplates.get_grammar_check_prompt(text)
        system_prompt = PromptTemplates.get_system_prompt()

        result = self.ai_client.infer(
            prompt=prompt,
            task_type="grammar",
            system_prompt=system_prompt
        )

        if not result.success:
            print(f"AI语法检查失败: {result.error}")
            return []

        return self._parse_ai_grammar_result(result.content, text)

    def _parse_ai_grammar_result(self, ai_content: str, original_text: str) -> List[GrammarIssue]:
        """解析AI返回的语法检查结果"""
        issues = []

        lines = ai_content.strip().split("\n")
        current_section = None

        for line in lines:
            line = line.strip()

            if line.startswith("2. 发现的问题"):
                current_section = "issues"
                continue
            elif line.startswith("3. 校正建议"):
                current_section = "suggestions"
                continue
            elif line.startswith("4. 校正后的文本"):
                current_section = "corrected"
                continue

            if current_section == "issues" and line and line[0].isdigit():
                try:
                    issue_desc = line.split(".", 1)[1].strip()
                    issues.append(GrammarIssue(
                        position=0,
                        length=0,
                        issue_type="AI检测",
                        description=issue_desc,
                        original_text="",
                        suggested_text="",
                        confidence=0.75,
                        severity="warning"
                    ))
                except IndexError:
                    pass

        return issues

    def _deduplicate_issues(self, issues: List[GrammarIssue]) -> List[GrammarIssue]:
        """去重问题"""
        seen = set()
        unique_issues = []

        for issue in issues:
            key = (issue.position, issue.issue_type, issue.original_text)
            if key not in seen:
                seen.add(key)
                unique_issues.append(issue)

        return sorted(unique_issues, key=lambda x: x.position)

    def _apply_corrections(self, text: str, issues: List[GrammarIssue]) -> str:
        """应用校正"""
        corrected = text
        offset = 0

        for issue in sorted(issues, key=lambda x: x.position, reverse=True):
            if issue.position > 0 and issue.length > 0:
                start = issue.position + offset
                end = start + issue.length
                if start < len(corrected) and end <= len(corrected):
                    suggested = issue.suggested_text
                    if suggested and not any(c in suggested for c in ["删除", "保留", "添加"]):
                        corrected = corrected[:start] + suggested + corrected[end:]
                        offset += len(suggested) - issue.length

        return corrected

    def _get_statistics(self, result: GrammarCheckResult) -> Dict[str, Any]:
        """获取统计信息"""
        issue_types = {}
        severities = {}

        for issue in result.issues:
            issue_types[issue.issue_type] = issue_types.get(issue.issue_type, 0) + 1
            severities[issue.severity] = severities.get(issue.severity, 0) + 1

        return {
            "total_issues": len(result.issues),
            "issue_types": issue_types,
            "severities": severities,
            "original_length": len(result.original_text),
            "corrected_length": len(result.corrected_text),
            "changes_count": len(result.original_text) != len(result.corrected_text)
        }

    def batch_check(self, texts: List[str], use_ai: Optional[bool] = None) -> List[GrammarCheckResult]:
        """
        批量语法检查

        Args:
            texts: 文本列表
            use_ai: 是否使用AI

        Returns:
            检查结果列表
        """
        results = []
        for text in texts:
            result = self.check_text(text, use_ai)
            results.append(result)
        return results

    def compare_versions(self, original_text: str, modified_text: str) -> Dict[str, Any]:
        """
        比较两个版本的文本差异

        Args:
            original_text: 原文
            modified_text: 修改后文本

        Returns:
            差异分析结果
        """
        import difflib

        differ = difflib.SequenceMatcher(None, original_text, modified_text)
        diffs = []

        for tag, i1, i2, j1, j2 in differ.get_opcodes():
            if tag != "equal":
                diffs.append({
                    "type": tag,
                    "original_position": (i1, i2),
                    "modified_position": (j1, j2),
                    "original_text": original_text[i1:i2],
                    "modified_text": modified_text[j1:j2]
                })

        return {
            "original_length": len(original_text),
            "modified_length": len(modified_text),
            "similarity": differ.ratio(),
            "differences": diffs,
            "total_changes": len(diffs)
        }

    def generate_emendation_note(self, issue: GrammarIssue, source: str = "") -> str:
        """
        生成校勘记

        Args:
            issue: 语法问题
            source: 来源信息

        Returns:
            校勘记文本
        """
        note = f"【校勘记】{issue.issue_type}：{issue.description}\n"
        note += f"原文：「{issue.original_text}」\n"
        if issue.suggested_text:
            note += f"建议：{issue.suggested_text}\n"
        if source:
            note += f"来源：{source}\n"
        note += f"置信度：{issue.confidence:.2f}\n"
        return note
