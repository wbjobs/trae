import re
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)


@dataclass
class AmbiguityIssue:
    type: str
    text: str
    context: str
    start_pos: int
    end_pos: int
    severity: str
    suggestions: List[str]
    confidence: float
    description: str = ""


@dataclass
class ProofreadingResult:
    original_text: str
    issues: List[AmbiguityIssue]
    corrected_text: str
    confidence: float
    summary: Dict[str, Any] = field(default_factory=dict)


class AmbiguityPatterns:
    AMBIGUOUS_WORDS = {
        "可能": ["可以", "能够", "也许", "或许"],
        "大约": ["大概", "约", "左右", "上下"],
        "相关": ["有关", "相应", "对应"],
        "等": ["等等", "之类", "诸如此类"],
        "若干": ["一些", "几个", "数个"],
        "适当": ["合适", "恰当", "适宜"],
        "及时": ["立刻", "马上", "立即"],
        "一定": ["必须", "务必", "必定"],
        "正常": ["常规", "标准", "一般"],
        "合理": ["合适", "正当", "合乎情理"],
    }

    QUANTITY_AMBIGUITY = [
        (r"约\s*\d+", "缺少精确数值"),
        (r"\d+\s*左右", "数值范围不明确"),
        (r"若干", "数量不具体"),
        (r"少量", "数量不具体"),
        (r"大量", "数量不具体"),
    ]

    TIME_AMBIGUITY = [
        (r"近期", "时间范围不明确"),
        (r"近日", "时间范围不明确"),
        (r"适当时候", "时间不具体"),
        (r"尽快", "时间不具体"),
        (r"及时", "时间不具体"),
    ]

    REFERENCE_AMBIGUITY = [
        (r"上述", "指代不明确"),
        (r"以下", "指代不明确"),
        (r"相关规定", "引用不具体"),
        (r"有关文件", "引用不具体"),
        (r"如图所示", "引用不具体"),
    ]

    VAGUE_EXPRESSIONS = [
        (r"等等", "列举不完整"),
        (r"等\s*[。,，]", "列举不完整"),
        (r"之类", "列举不完整"),
        (r"诸如此类", "列举不完整"),
    ]

    @staticmethod
    def get_domain_patterns(domain: str) -> Dict[str, Any]:
        domain_patterns = {
            "法律": {
                "ambiguous_words": ["合理", "适当", "必要", "重大", "严重"],
                "required_phrases": ["应当", "不得", "必须", "可以"],
            },
            "医疗": {
                "ambiguous_words": ["适当", "必要", "适量", "定期", "必要时"],
                "avoid_phrases": ["可能", "也许", "大概"],
            },
            "金融": {
                "ambiguous_words": ["大约", "约", "左右", "基本", "大致"],
                "required_phrases": ["合计", "总计", "共计", "确认"],
            },
            "技术": {
                "ambiguous_words": ["适当", "一定", "正常", "合理"],
                "required_phrases": ["必须", "应当", "禁止", "允许"],
            },
        }
        return domain_patterns.get(domain, {})


class AmbiguityChecker:
    def __init__(self, config: Any = None, inference_scheduler=None):
        self.config = config
        self.inference_scheduler = inference_scheduler
        self.domain = getattr(config, "domain", "general") if config else "general"
        self.patterns = AmbiguityPatterns()

    def set_inference_scheduler(self, scheduler):
        self.inference_scheduler = scheduler

    def check_text(
        self,
        text: str,
        domain: Optional[str] = None,
        use_ai: bool = True,
    ) -> ProofreadingResult:
        if not text:
            return ProofreadingResult(
                original_text="",
                issues=[],
                corrected_text="",
                confidence=1.0,
            )

        domain = domain or self.domain
        issues: List[AmbiguityIssue] = []

        issues.extend(self._check_pattern_based(text, domain))
        issues.extend(self._check_domain_specific(text, domain))

        if use_ai and self.inference_scheduler:
            ai_issues = self._check_ai_based(text, domain)
            issues.extend(ai_issues)

        issues = self._deduplicate_issues(issues)
        issues = sorted(issues, key=lambda x: x.start_pos)

        corrected_text = self._generate_corrected_text(text, issues)
        summary = self._generate_summary(text, issues)

        overall_confidence = 1.0 - (len(issues) * 0.05)
        overall_confidence = max(0.5, min(1.0, overall_confidence))

        return ProofreadingResult(
            original_text=text,
            issues=issues,
            corrected_text=corrected_text,
            confidence=overall_confidence,
            summary=summary,
        )

    def _check_pattern_based(self, text: str, domain: str) -> List[AmbiguityIssue]:
        issues = []
        checked_positions = set()

        for word, alternatives in self.patterns.AMBIGUOUS_WORDS.items():
            for match in re.finditer(re.escape(word), text):
                if match.start() in checked_positions:
                    continue
                checked_positions.add(match.start())

                context = self._get_context(text, match.start(), match.end())
                issues.append(
                    AmbiguityIssue(
                        type="ambiguous_word",
                        text=match.group(),
                        context=context,
                        start_pos=match.start(),
                        end_pos=match.end(),
                        severity="medium",
                        suggestions=alternatives,
                        confidence=0.7,
                        description=f"模糊用词 '{word}'，建议使用更明确的表述",
                    )
                )

        for pattern, description in self.patterns.QUANTITY_AMBIGUITY:
            for match in re.finditer(pattern, text):
                if match.start() in checked_positions:
                    continue
                checked_positions.add(match.start())

                context = self._get_context(text, match.start(), match.end())
                issues.append(
                    AmbiguityIssue(
                        type="quantity_ambiguity",
                        text=match.group(),
                        context=context,
                        start_pos=match.start(),
                        end_pos=match.end(),
                        severity="high",
                        suggestions=[],
                        confidence=0.8,
                        description=description,
                    )
                )

        for pattern, description in self.patterns.TIME_AMBIGUITY:
            for match in re.finditer(pattern, text):
                if match.start() in checked_positions:
                    continue
                checked_positions.add(match.start())

                context = self._get_context(text, match.start(), match.end())
                issues.append(
                    AmbiguityIssue(
                        type="time_ambiguity",
                        text=match.group(),
                        context=context,
                        start_pos=match.start(),
                        end_pos=match.end(),
                        severity="medium",
                        suggestions=[],
                        confidence=0.75,
                        description=description,
                    )
                )

        for pattern, description in self.patterns.REFERENCE_AMBIGUITY:
            for match in re.finditer(pattern, text):
                if match.start() in checked_positions:
                    continue
                checked_positions.add(match.start())

                context = self._get_context(text, match.start(), match.end())
                issues.append(
                    AmbiguityIssue(
                        type="reference_ambiguity",
                        text=match.group(),
                        context=context,
                        start_pos=match.start(),
                        end_pos=match.end(),
                        severity="medium",
                        suggestions=[],
                        confidence=0.7,
                        description=description,
                    )
                )

        for pattern, description in self.patterns.VAGUE_EXPRESSIONS:
            for match in re.finditer(pattern, text):
                if match.start() in checked_positions:
                    continue
                checked_positions.add(match.start())

                context = self._get_context(text, match.start(), match.end())
                issues.append(
                    AmbiguityIssue(
                        type="vague_expression",
                        text=match.group(),
                        context=context,
                        start_pos=match.start(),
                        end_pos=match.end(),
                        severity="low",
                        suggestions=[],
                        confidence=0.65,
                        description=description,
                    )
                )

        return issues

    def _check_domain_specific(self, text: str, domain: str) -> List[AmbiguityIssue]:
        issues = []
        domain_config = self.patterns.get_domain_patterns(domain)

        ambiguous_words = domain_config.get("ambiguous_words", [])
        for word in ambiguous_words:
            for match in re.finditer(re.escape(word), text):
                context = self._get_context(text, match.start(), match.end())
                issues.append(
                    AmbiguityIssue(
                        type=f"{domain}_ambiguity",
                        text=match.group(),
                        context=context,
                        start_pos=match.start(),
                        end_pos=match.end(),
                        severity="medium",
                        suggestions=[],
                        confidence=0.6,
                        description=f"{domain}文档中建议明确 '{word}' 的具体含义",
                    )
                )

        return issues

    def _check_ai_based(self, text: str, domain: str) -> List[AmbiguityIssue]:
        issues = []

        if not self.inference_scheduler:
            return issues

        try:
            prompt = self._build_proofreading_prompt(text, domain)
            response = self.inference_scheduler.generate(prompt, max_tokens=1024)

            ai_issues = self._parse_ai_response(response, text)
            issues.extend(ai_issues)

        except Exception as e:
            logger.warning(f"AI-based ambiguity check failed: {e}")

        return issues

    def _build_proofreading_prompt(self, text: str, domain: str) -> str:
        return f"""你是一个专业的{domain}文档校对专家。请检查以下文本中存在的歧义、模糊、不明确的内容。

待检查文本：
{text}

请找出所有可能导致误解的问题，包括但不限于：
1. 指代不明确（如"上述"、"以下"等）
2. 数量不具体（如"若干"、"大量"等）
3. 时间不明确（如"近期"、"尽快"等）
4. 模糊用词（如"可能"、"大约"等）
5. 引用不具体（如"相关规定"等）

请严格按照JSON格式返回结果：
{{
  "issues": [
    {{
      "text": "有问题的文本片段",
      "type": "问题类型",
      "description": "问题描述",
      "severity": "high/medium/low",
      "suggestions": ["建议1", "建议2"]
    }}
  ]
}}

只返回JSON，不要包含其他说明文字。
"""

    def _parse_ai_response(self, response: str, original_text: str) -> List[AmbiguityIssue]:
        issues = []

        try:
            response = response.strip()
            json_start = response.find("{")
            json_end = response.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                data = json.loads(response[json_start:json_end])
                ai_issues = data.get("issues", [])

                for issue_data in ai_issues:
                    text_fragment = issue_data.get("text", "")
                    if not text_fragment:
                        continue

                    pos = original_text.find(text_fragment)
                    if pos >= 0:
                        context = self._get_context(original_text, pos, pos + len(text_fragment))
                        issues.append(
                            AmbiguityIssue(
                                type=issue_data.get("type", "ai_detected"),
                                text=text_fragment,
                                context=context,
                                start_pos=pos,
                                end_pos=pos + len(text_fragment),
                                severity=issue_data.get("severity", "medium"),
                                suggestions=issue_data.get("suggestions", []),
                                confidence=0.6,
                                description=issue_data.get("description", ""),
                            )
                        )
        except Exception as e:
            logger.warning(f"Failed to parse AI proofreading response: {e}")

        return issues

    def _get_context(self, text: str, start: int, end: int, window: int = 30) -> str:
        context_start = max(0, start - window)
        context_end = min(len(text), end + window)
        prefix = "..." if context_start > 0 else ""
        suffix = "..." if context_end < len(text) else ""
        return prefix + text[context_start:context_end] + suffix

    def _deduplicate_issues(self, issues: List[AmbiguityIssue]) -> List[AmbiguityIssue]:
        unique = []
        seen = set()

        for issue in issues:
            key = (issue.start_pos, issue.end_pos, issue.type)
            if key not in seen:
                seen.add(key)
                unique.append(issue)
            else:
                for i, existing in enumerate(unique):
                    if (existing.start_pos, existing.end_pos, existing.type) == key:
                        if issue.confidence > existing.confidence:
                            unique[i] = issue
                        break

        return unique

    def _generate_corrected_text(self, text: str, issues: List[AmbiguityIssue]) -> str:
        if not issues:
            return text

        corrections = []
        for issue in issues:
            if issue.suggestions:
                corrections.append(
                    (issue.start_pos, issue.end_pos, f"[{issue.text} -> {issue.suggestions[0]}]")
                )

        corrections.sort(key=lambda x: x[0], reverse=True)
        result = text
        for start, end, replacement in corrections:
            result = result[:start] + replacement + result[end:]

        return result

    def _generate_summary(self, text: str, issues: List[AmbiguityIssue]) -> Dict[str, Any]:
        type_counts: Dict[str, int] = {}
        severity_counts: Dict[str, int] = {"high": 0, "medium": 0, "low": 0}

        for issue in issues:
            type_counts[issue.type] = type_counts.get(issue.type, 0) + 1
            if issue.severity in severity_counts:
                severity_counts[issue.severity] += 1

        return {
            "total_issues": len(issues),
            "by_type": type_counts,
            "by_severity": severity_counts,
            "text_length": len(text),
            "issue_density": len(issues) / max(1, len(text) / 100),
        }

    @staticmethod
    def format_issues_report(result: ProofreadingResult) -> str:
        lines = []
        lines.append("=" * 60)
        lines.append("文档歧义校对报告")
        lines.append("=" * 60)
        lines.append("")
        lines.append(f"文本长度: {result.summary.get('text_length', 0)} 字符")
        lines.append(f"发现问题: {result.summary.get('total_issues', 0)} 个")
        lines.append(f"整体置信度: {result.confidence:.2f}")
        lines.append("")

        if result.issues:
            lines.append("问题详情:")
            lines.append("-" * 60)

            for i, issue in enumerate(result.issues, 1):
                severity_icon = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(issue.severity, "⚪")
                lines.append(f"{severity_icon} [{i}] {issue.description}")
                lines.append(f"   文本: {issue.text}")
                lines.append(f"   上下文: {issue.context}")
                lines.append(f"   类型: {issue.type}, 置信度: {issue.confidence:.2f}")
                if issue.suggestions:
                    lines.append(f"   建议: {', '.join(issue.suggestions[:3])}")
                lines.append("")

            lines.append("-" * 60)
            lines.append(f"严重程度统计:")
            for sev, count in result.summary.get("by_severity", {}).items():
                lines.append(f"  {sev}: {count} 个")
            lines.append("")
            lines.append(f"问题类型统计:")
            for typ, count in result.summary.get("by_type", {}).items():
                lines.append(f"  {typ}: {count} 个")
        else:
            lines.append("✅ 未发现明显的歧义问题")

        lines.append("=" * 60)
        return "\n".join(lines)
