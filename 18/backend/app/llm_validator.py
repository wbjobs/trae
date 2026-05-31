import os
import re
from typing import List, Dict, Any, Optional
from datetime import datetime


class LLMValidator:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
        self._reasoning_chains = []
        self._highlight_regions = []
        self._use_mock = not bool(self.api_key)

    def validate(self, extracted_data: Dict, custom_rules: Optional[List[str]] = None) -> List[Dict]:
        self._reasoning_chains = []
        self._highlight_regions = []
        
        validation_results = []
        
        default_rules = [
            "end_date_after_start_date",
            "liquidated_damages_not_exceed_30_percent",
            "sign_date_before_start_date",
            "amount_positive"
        ]
        
        rules = custom_rules if custom_rules else default_rules
        
        for rule in rules:
            if isinstance(rule, str) and rule in default_rules:
                result = self._validate_builtin_rule(rule, extracted_data)
            else:
                result = self._validate_custom_rule(str(rule), extracted_data)
            validation_results.append(result)
        
        return validation_results

    def _validate_builtin_rule(self, rule: str, extracted_data: Dict) -> Dict:
        if rule == "end_date_after_start_date":
            return self._check_end_after_start(extracted_data)
        elif rule == "liquidated_damages_not_exceed_30_percent":
            return self._check_damages_percentage(extracted_data)
        elif rule == "sign_date_before_start_date":
            return self._check_sign_before_start(extracted_data)
        elif rule == "amount_positive":
            return self._check_amount_positive(extracted_data)
        else:
            return {
                "rule": rule,
                "status": "error",
                "message": f"Unknown rule: {rule}"
            }

    def _check_end_after_start(self, extracted_data: Dict) -> Dict:
        dates = extracted_data.get("dates", {})
        start_date = dates.get("start_date", "")
        end_date = dates.get("end_date", "")
        
        chain = {
            "rule": "end_date_after_start_date",
            "description": "检查结束日期是否晚于开始日期",
            "steps": [],
            "conclusion": ""
        }
        
        chain["steps"].append({
            "action": "提取日期字段",
            "detail": f"开始日期: {start_date}, 结束日期: {end_date}"
        })
        
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
            
            chain["steps"].append({
                "action": "日期解析",
                "detail": f"解析成功: 开始={start_dt}, 结束={end_dt}"
            })
            
            if end_dt > start_dt:
                chain["conclusion"] = "PASS: 结束日期晚于开始日期"
                chain["steps"].append({
                    "action": "比较日期",
                    "detail": f"{end_date} > {start_date} ✓"
                })
                
                result = {
                    "rule": "end_date_after_start_date",
                    "status": "pass",
                    "severity": "info",
                    "message": "结束日期合理",
                    "evidence": {
                        "start_date": start_date,
                        "end_date": end_date
                    }
                }
                
                self._add_highlight("start_date", f"开始日期: {start_date}", "#4CAF50")
                self._add_highlight("end_date", f"结束日期: {end_date}", "#4CAF50")
            else:
                chain["conclusion"] = "FAIL: 结束日期早于开始日期"
                chain["steps"].append({
                    "action": "比较日期",
                    "detail": f"{end_date} <= {start_date} ✗"
                })
                
                result = {
                    "rule": "end_date_after_start_date",
                    "status": "fail",
                    "severity": "critical",
                    "message": "结束日期早于开始日期，存在逻辑错误",
                    "evidence": {
                        "start_date": start_date,
                        "end_date": end_date,
                        "suggestion": "请检查合同期限条款，确保结束日期在开始日期之后"
                    }
                }
                
                self._add_highlight("start_date", f"开始日期: {start_date}", "#FF5722")
                self._add_highlight("end_date", f"结束日期: {end_date} (早于开始日期)", "#FF5722")
                
        except Exception as e:
            chain["conclusion"] = f"ERROR: 日期解析失败 - {str(e)}"
            result = {
                "rule": "end_date_after_start_date",
                "status": "error",
                "severity": "warning",
                "message": "无法解析日期格式",
                "evidence": {"error": str(e)}
            }
        
        self._reasoning_chains.append(chain)
        return result

    def _check_damages_percentage(self, extracted_data: Dict) -> Dict:
        damages = extracted_data.get("liquidated_damages", {})
        amount = extracted_data.get("amount", {})
        
        percentage_str = damages.get("percentage", "0%")
        amount_value = amount.get("value", "0")
        
        chain = {
            "rule": "liquidated_damages_not_exceed_30_percent",
            "description": "检查违约金是否超过总金额的30%",
            "steps": [],
            "conclusion": ""
        }
        
        chain["steps"].append({
            "action": "提取金额和违约金",
            "detail": f"合同金额: {amount_value}, 违约金比例: {percentage_str}"
        })
        
        try:
            percentage = float(percentage_str.replace("%", ""))
            
            chain["steps"].append({
                "action": "解析违约金比例",
                "detail": f"违约金比例: {percentage}%"
            })
            
            if percentage <= 30:
                chain["conclusion"] = f"PASS: 违约金{percentage}%不超过30%"
                chain["steps"].append({
                    "action": "比较阈值",
                    "detail": f"{percentage}% <= 30% ✓"
                })
                
                result = {
                    "rule": "liquidated_damages_not_exceed_30_percent",
                    "status": "pass",
                    "severity": "info",
                    "message": f"违约金比例{percentage}%在合理范围内",
                    "evidence": {
                        "percentage": percentage,
                        "threshold": 30
                    }
                }
                
                self._add_highlight("damages", f"违约金: {percentage_str}", "#4CAF50")
            else:
                chain["conclusion"] = f"WARN: 违约金{percentage}%超过30%阈值"
                chain["steps"].append({
                    "action": "比较阈值",
                    "detail": f"{percentage}% > 30% ⚠"
                })
                
                result = {
                    "rule": "liquidated_damages_not_exceed_30_percent",
                    "status": "warn",
                    "severity": "high",
                    "message": f"违约金比例{percentage}%超过30%，可能存在过高风险",
                    "evidence": {
                        "percentage": percentage,
                        "threshold": 30,
                        "excess": percentage - 30,
                        "suggestion": "建议协商降低违约金比例至合理范围"
                    }
                }
                
                self._add_highlight("damages", f"违约金: {percentage_str} (超过30%)", "#FFC107")
                
        except Exception as e:
            chain["conclusion"] = f"ERROR: 解析失败 - {str(e)}"
            result = {
                "rule": "liquidated_damages_not_exceed_30_percent",
                "status": "error",
                "severity": "warning",
                "message": "无法解析违约金比例",
                "evidence": {"error": str(e)}
            }
        
        self._reasoning_chains.append(chain)
        return result

    def _check_sign_before_start(self, extracted_data: Dict) -> Dict:
        dates = extracted_data.get("dates", {})
        sign_date = dates.get("sign_date", "")
        start_date = dates.get("start_date", "")
        
        chain = {
            "rule": "sign_date_before_start_date",
            "description": "检查签订日期是否早于开始日期",
            "steps": [],
            "conclusion": ""
        }
        
        chain["steps"].append({
            "action": "提取日期字段",
            "detail": f"签订日期: {sign_date}, 开始日期: {start_date}"
        })
        
        try:
            sign_dt = datetime.strptime(sign_date, "%Y-%m-%d")
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            
            chain["steps"].append({
                "action": "日期解析",
                "detail": f"解析成功: 签订={sign_dt}, 开始={start_dt}"
            })
            
            if sign_dt <= start_dt:
                chain["conclusion"] = "PASS: 签订日期早于开始日期"
                chain["steps"].append({
                    "action": "比较日期",
                    "detail": f"{sign_date} <= {start_date} ✓"
                })
                
                result = {
                    "rule": "sign_date_before_start_date",
                    "status": "pass",
                    "severity": "info",
                    "message": "签订日期合理",
                    "evidence": {
                        "sign_date": sign_date,
                        "start_date": start_date
                    }
                }
                
                self._add_highlight("sign_date", f"签订日期: {sign_date}", "#4CAF50")
            else:
                chain["conclusion"] = "WARN: 签订日期晚于开始日期"
                chain["steps"].append({
                    "action": "比较日期",
                    "detail": f"{sign_date} > {start_date} ⚠"
                })
                
                result = {
                    "rule": "sign_date_before_start_date",
                    "status": "warn",
                    "severity": "medium",
                    "message": "签订日期晚于开始日期，建议确认",
                    "evidence": {
                        "sign_date": sign_date,
                        "start_date": start_date,
                        "suggestion": "合同通常应在开始前签订，请确认是否存在倒签情况"
                    }
                }
                
                self._add_highlight("sign_date", f"签订日期: {sign_date} (晚于开始日期)", "#FFC107")
                
        except Exception as e:
            chain["conclusion"] = f"ERROR: 日期解析失败 - {str(e)}"
            result = {
                "rule": "sign_date_before_start_date",
                "status": "error",
                "severity": "warning",
                "message": "无法解析日期格式",
                "evidence": {"error": str(e)}
            }
        
        self._reasoning_chains.append(chain)
        return result

    def _check_amount_positive(self, extracted_data: Dict) -> Dict:
        amount = extracted_data.get("amount", {})
        value_str = amount.get("value", "0")
        
        chain = {
            "rule": "amount_positive",
            "description": "检查合同金额是否为正数",
            "steps": [],
            "conclusion": ""
        }
        
        chain["steps"].append({
            "action": "提取金额字段",
            "detail": f"合同金额: {value_str}"
        })
        
        try:
            value = float(value_str.replace(",", ""))
            
            chain["steps"].append({
                "action": "解析金额",
                "detail": f"金额数值: {value}"
            })
            
            if value > 0:
                chain["conclusion"] = f"PASS: 金额{value}为正数"
                chain["steps"].append({
                    "action": "检查金额",
                    "detail": f"{value} > 0 ✓"
                })
                
                result = {
                    "rule": "amount_positive",
                    "status": "pass",
                    "severity": "info",
                    "message": "合同金额为正数",
                    "evidence": {"amount": value}
                }
                
                self._add_highlight("amount", f"金额: {value_str}", "#4CAF50")
            else:
                chain["conclusion"] = f"FAIL: 金额{value}非正数"
                chain["steps"].append({
                    "action": "检查金额",
                    "detail": f"{value} <= 0 ✗"
                })
                
                result = {
                    "rule": "amount_positive",
                    "status": "fail",
                    "severity": "critical",
                    "message": "合同金额应为正数",
                    "evidence": {"amount": value}
                }
                
                self._add_highlight("amount", f"金额: {value_str} (异常)", "#FF5722")
                
        except Exception as e:
            chain["conclusion"] = f"ERROR: 金额解析失败 - {str(e)}"
            result = {
                "rule": "amount_positive",
                "status": "error",
                "severity": "warning",
                "message": "无法解析金额",
                "evidence": {"error": str(e)}
            }
        
        self._reasoning_chains.append(chain)
        return result

    def _validate_custom_rule(self, rule: str, extracted_data: Dict) -> Dict:
        chain = {
            "rule": rule,
            "description": "自定义规则验证",
            "steps": [
                {"action": "接收自定义规则", "detail": rule},
                {"action": "分析规则逻辑", "detail": "正在分析自定义规则的验证逻辑"}
            ],
            "conclusion": "自定义规则已记录（需要LLM支持完整验证）"
        }
        
        result = {
            "rule": rule,
            "status": "pending",
            "severity": "info",
            "message": "自定义规则需要配置OpenAI API进行完整验证",
            "evidence": {"rule": rule}
        }
        
        self._reasoning_chains.append(chain)
        return result

    def _add_highlight(self, field: str, label: str, color: str):
        mock_positions = {
            "party_a": {"x": 50, "y": 100, "width": 300, "height": 40},
            "party_b": {"x": 50, "y": 145, "width": 300, "height": 40},
            "amount": {"x": 50, "y": 265, "width": 450, "height": 30},
            "start_date": {"x": 70, "y": 330, "width": 380, "height": 25},
            "end_date": {"x": 70, "y": 355, "width": 380, "height": 25},
            "sign_date": {"x": 50, "y": 520, "width": 250, "height": 25},
            "damages": {"x": 50, "y": 485, "width": 450, "height": 30}
        }
        
        position = mock_positions.get(field, {"x": 100, "y": 200, "width": 200, "height": 30})
        
        self._highlight_regions.append({
            "field": field,
            "label": label,
            "color": color,
            "page": 1,
            "bbox": [
                position["x"],
                position["y"],
                position["x"] + position["width"],
                position["y"] + position["height"]
            ]
        })

    def get_reasoning_chains(self) -> List[Dict]:
        return self._reasoning_chains

    def get_highlight_regions(self) -> List[Dict]:
        return self._highlight_regions
