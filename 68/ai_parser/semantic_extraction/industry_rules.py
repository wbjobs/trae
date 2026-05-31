import os
import json
import yaml
import logging
from typing import List, Dict, Any, Optional, Union
from dataclasses import dataclass, field, asdict
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class ExtractionRule:
    name: str
    type: str = "keyword"
    pattern: Optional[str] = None
    keywords: Optional[List[str]] = None
    case_sensitive: bool = False
    weight: float = 1.0
    description: str = ""
    category: str = ""
    enabled: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class IndustryRuleSet:
    industry: str
    version: str = "1.0"
    description: str = ""
    extraction_rules: List[ExtractionRule] = field(default_factory=list)
    correction_rules: List[Dict[str, str]] = field(default_factory=list)
    domain_keywords: List[str] = field(default_factory=list)
    stop_words: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "industry": self.industry,
            "version": self.version,
            "description": self.description,
            "extraction_rules": [r.to_dict() for r in self.extraction_rules],
            "correction_rules": self.correction_rules,
            "domain_keywords": self.domain_keywords,
            "stop_words": self.stop_words,
            "metadata": self.metadata,
        }


class IndustryRuleManager:
    def __init__(self, rules_dir: Optional[str] = None):
        self.rules_dir = rules_dir or os.environ.get("INDUSTRY_RULES_DIR", "./industry_rules")
        self._rules: Dict[str, IndustryRuleSet] = {}
        self._active_rules: Optional[str] = None
        self._ensure_rules_dir()

    def _ensure_rules_dir(self) -> None:
        if not os.path.exists(self.rules_dir):
            os.makedirs(self.rules_dir, exist_ok=True)
            logger.info(f"Created industry rules directory: {self.rules_dir}")

    def load_rules(self, rule_path: str) -> IndustryRuleSet:
        if not os.path.exists(rule_path):
            raise FileNotFoundError(f"Rule file not found: {rule_path}")

        ext = Path(rule_path).suffix.lower()
        try:
            with open(rule_path, "r", encoding="utf-8") as f:
                if ext in [".yaml", ".yml"]:
                    data = yaml.safe_load(f)
                elif ext == ".json":
                    data = json.load(f)
                else:
                    raise ValueError(f"Unsupported rule file format: {ext}")

            rule_set = self._parse_rule_set(data)
            self._rules[rule_set.industry] = rule_set
            logger.info(f"Loaded rules for industry: {rule_set.industry}")
            return rule_set

        except Exception as e:
            logger.error(f"Failed to load rules from {rule_path}: {e}")
            raise

    def import_rules(self, file_path: str) -> IndustryRuleSet:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Import file not found: {file_path}")

        dest_path = os.path.join(
            self.rules_dir,
            os.path.basename(file_path)
        )

        import shutil
        shutil.copy2(file_path, dest_path)
        logger.info(f"Copied rule file to: {dest_path}")

        return self.load_rules(dest_path)

    def load_all_rules(self) -> Dict[str, IndustryRuleSet]:
        self._rules.clear()

        for file_name in os.listdir(self.rules_dir):
            file_path = os.path.join(self.rules_dir, file_name)
            if not os.path.isfile(file_path):
                continue

            ext = Path(file_name).suffix.lower()
            if ext not in [".yaml", ".yml", ".json"]:
                continue

            try:
                self.load_rules(file_path)
            except Exception as e:
                logger.warning(f"Skipping rule file {file_name}: {e}")

        return self._rules

    def _parse_rule_set(self, data: Dict[str, Any]) -> IndustryRuleSet:
        extraction_rules = []
        for rule_data in data.get("extraction_rules", []):
            rule = ExtractionRule(
                name=rule_data.get("name", ""),
                type=rule_data.get("type", "keyword"),
                pattern=rule_data.get("pattern"),
                keywords=rule_data.get("keywords", []),
                case_sensitive=rule_data.get("case_sensitive", False),
                weight=rule_data.get("weight", 1.0),
                description=rule_data.get("description", ""),
                category=rule_data.get("category", ""),
                enabled=rule_data.get("enabled", True),
            )
            extraction_rules.append(rule)

        return IndustryRuleSet(
            industry=data.get("industry", "default"),
            version=data.get("version", "1.0"),
            description=data.get("description", ""),
            extraction_rules=extraction_rules,
            correction_rules=data.get("correction_rules", []),
            domain_keywords=data.get("domain_keywords", []),
            stop_words=data.get("stop_words", []),
            metadata=data.get("metadata", {}),
        )

    def get_rules(self, industry: str) -> Optional[IndustryRuleSet]:
        return self._rules.get(industry)

    def set_active_industry(self, industry: str) -> bool:
        if industry in self._rules:
            self._active_rules = industry
            logger.info(f"Set active industry rules: {industry}")
            return True
        logger.warning(f"Industry rules not found: {industry}")
        return False

    def get_active_rules(self) -> Optional[IndustryRuleSet]:
        if self._active_rules:
            return self._rules.get(self._active_rules)
        return None

    def create_rules(self, rule_set: IndustryRuleSet, overwrite: bool = False) -> str:
        if rule_set.industry in self._rules and not overwrite:
            raise ValueError(f"Rules for industry '{rule_set.industry}' already exist")

        self._rules[rule_set.industry] = rule_set

        file_name = f"{rule_set.industry.lower().replace(' ', '_')}_rules.json"
        file_path = os.path.join(self.rules_dir, file_name)

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(rule_set.to_dict(), f, ensure_ascii=False, indent=2)

        logger.info(f"Created rules file: {file_path}")
        return file_path

    def update_rules(self, industry: str, rule_set: IndustryRuleSet) -> bool:
        if industry not in self._rules:
            return False
        self._rules[industry] = rule_set
        return True

    def delete_rules(self, industry: str) -> bool:
        if industry not in self._rules:
            return False
        del self._rules[industry]
        return True

    def list_industries(self) -> List[str]:
        return list(self._rules.keys())

    def get_extraction_rules(
        self,
        industry: Optional[str] = None,
        category: Optional[str] = None,
    ) -> List[ExtractionRule]:
        if industry:
            rule_set = self._rules.get(industry)
        else:
            rule_set = self.get_active_rules()

        if not rule_set:
            return []

        rules = [r for r in rule_set.extraction_rules if r.enabled]

        if category:
            rules = [r for r in rules if r.category == category]

        return rules

    def get_domain_keywords(self, industry: Optional[str] = None) -> List[str]:
        if industry:
            rule_set = self._rules.get(industry)
        else:
            rule_set = self.get_active_rules()

        return rule_set.domain_keywords if rule_set else []

    def get_correction_rules(self, industry: Optional[str] = None) -> List[Dict[str, str]]:
        if industry:
            rule_set = self._rules.get(industry)
        else:
            rule_set = self.get_active_rules()

        return rule_set.correction_rules if rule_set else []

    def export_rules(self, industry: str, output_path: str) -> bool:
        rule_set = self._rules.get(industry)
        if not rule_set:
            return False

        ext = Path(output_path).suffix.lower()
        with open(output_path, "w", encoding="utf-8") as f:
            if ext in [".yaml", ".yml"]:
                yaml.dump(rule_set.to_dict(), f, allow_unicode=True)
            else:
                json.dump(rule_set.to_dict(), f, ensure_ascii=False, indent=2)

        logger.info(f"Exported rules to: {output_path}")
        return True

    def validate_rules(self, data: Dict[str, Any]) -> tuple[bool, List[str]]:
        errors = []

        if "industry" not in data:
            errors.append("Missing required field: 'industry'")

        if "extraction_rules" in data:
            for i, rule in enumerate(data["extraction_rules"]):
                if "name" not in rule:
                    errors.append(f"Rule {i}: Missing required field 'name'")
                if "type" not in rule:
                    errors.append(f"Rule {i}: Missing required field 'type'")
                if rule.get("type") == "keyword" and "keywords" not in rule:
                    errors.append(f"Rule {i}: Keyword type requires 'keywords' field")
                if rule.get("type") == "regex" and "pattern" not in rule:
                    errors.append(f"Rule {i}: Regex type requires 'pattern' field")

        return len(errors) == 0, errors

    def add_extraction_rule(self, industry: str, rule: ExtractionRule) -> bool:
        rule_set = self._rules.get(industry)
        if not rule_set:
            return False
        rule_set.extraction_rules.append(rule)
        return True

    def remove_extraction_rule(self, industry: str, rule_name: str) -> bool:
        rule_set = self._rules.get(industry)
        if not rule_set:
            return False
        rule_set.extraction_rules = [
            r for r in rule_set.extraction_rules if r.name != rule_name
        ]
        return True
