import re
import ast
import operator
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum


class RuleType(Enum):
    CALCULATION = "calculation"
    ALARM = "alarm"
    CONTROL = "control"
    VALIDATION = "validation"


@dataclass
class ConfigRule:
    rule_id: str
    rule_type: RuleType
    expression: str
    target_tag: str
    description: str = ""
    priority: int = 0
    enabled: bool = True


class RuleParser:
    _SAFE_OPERATORS = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
        ast.Lt: operator.lt,
        ast.LtE: operator.le,
        ast.Gt: operator.gt,
        ast.GtE: operator.ge,
        ast.Eq: operator.eq,
        ast.NotEq: operator.ne,
        ast.And: lambda a, b: a and b,
        ast.Or: lambda a, b: a or b,
        ast.Not: operator.not_,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }

    _SAFE_FUNCTIONS = {
        'abs': abs,
        'round': round,
        'min': min,
        'max': max,
        'int': int,
        'float': float,
        'bool': bool,
        'str': str,
        'sqrt': lambda x: x ** 0.5,
        'sin': __import__('math').sin,
        'cos': __import__('math').cos,
        'tan': __import__('math').tan,
        'log': __import__('math').log,
        'exp': __import__('math').exp,
        'PI': __import__('math').pi,
        'E': __import__('math').e,
    }

    def __init__(self):
        self._rules: Dict[str, ConfigRule] = {}
        self._tag_values: Dict[str, Any] = {}

    def add_rule(self, rule: ConfigRule):
        self._rules[rule.rule_id] = rule

    def remove_rule(self, rule_id: str):
        if rule_id in self._rules:
            del self._rules[rule_id]

    def set_tag_value(self, tag_name: str, value: Any):
        self._tag_values[tag_name] = value

    def parse_expression(self, expression: str, tag_values: Optional[Dict[str, Any]] = None) -> Tuple[bool, Any, Optional[str]]:
        try:
            values = tag_values if tag_values is not None else self._tag_values
            tree = ast.parse(expression, mode='eval')
            result = self._eval_node(tree.body, values)
            return True, result, None
        except SyntaxError as e:
            return False, None, f"Syntax error: {e}"
        except Exception as e:
            return False, None, str(e)

    def _eval_node(self, node, tag_values: Dict[str, Any]):
        if isinstance(node, ast.Constant):
            return node.value
        elif isinstance(node, ast.Name):
            if node.id in self._SAFE_FUNCTIONS:
                return self._SAFE_FUNCTIONS[node.id]
            if node.id in tag_values:
                return tag_values[node.id]
            raise NameError(f"Unknown identifier '{node.id}'")
        elif isinstance(node, ast.BinOp):
            op_type = type(node.op)
            if op_type in self._SAFE_OPERATORS:
                left = self._eval_node(node.left, tag_values)
                right = self._eval_node(node.right, tag_values)
                return self._SAFE_OPERATORS[op_type](left, right)
            raise ValueError(f"Unsupported operator: {op_type.__name__}")
        elif isinstance(node, ast.UnaryOp):
            op_type = type(node.op)
            if op_type in self._SAFE_OPERATORS:
                operand = self._eval_node(node.operand, tag_values)
                return self._SAFE_OPERATORS[op_type](operand)
            raise ValueError(f"Unsupported unary operator: {op_type.__name__}")
        elif isinstance(node, ast.BoolOp):
            op_type = type(node.op)
            if op_type in self._SAFE_OPERATORS:
                values = [self._eval_node(v, tag_values) for v in node.values]
                result = values[0]
                for v in values[1:]:
                    result = self._SAFE_OPERATORS[op_type](result, v)
                return result
            raise ValueError(f"Unsupported boolean operator: {op_type.__name__}")
        elif isinstance(node, ast.Compare):
            left = self._eval_node(node.left, tag_values)
            for op, comparator in zip(node.ops, node.comparators):
                right = self._eval_node(comparator, tag_values)
                op_type = type(op)
                if op_type not in self._SAFE_OPERATORS:
                    raise ValueError(f"Unsupported comparator: {op_type.__name__}")
                if not self._SAFE_OPERATORS[op_type](left, right):
                    return False
            return True
        elif isinstance(node, ast.IfExp):
            test = self._eval_node(node.test, tag_values)
            if test:
                return self._eval_node(node.body, tag_values)
            else:
                return self._eval_node(node.orelse, tag_values)
        elif isinstance(node, ast.Call):
            func = self._eval_node(node.func, tag_values)
            args = [self._eval_node(arg, tag_values) for arg in node.args]
            return func(*args)
        else:
            raise ValueError(f"Unsupported node type: {type(node).__name__}")

    def validate_rule(self, rule: ConfigRule) -> Tuple[bool, Optional[str]]:
        return self.parse_expression(rule.expression)

    def execute_rules(self, tag_values: Dict[str, Any]) -> Dict[str, Any]:
        results = {}
        sorted_rules = sorted(
            [r for r in self._rules.values() if r.enabled],
            key=lambda x: x.priority,
            reverse=True
        )
        current_values = dict(tag_values)
        for rule in sorted_rules:
            try:
                success, result, error = self.parse_expression(rule.expression, current_values)
                if success:
                    results[rule.target_tag] = result
                    current_values[rule.target_tag] = result
            except Exception as e:
                print(f"Rule execution error {rule.rule_id}: {e}")
        return results

    def extract_tag_references(self, expression: str) -> List[str]:
        try:
            tree = ast.parse(expression, mode='eval')
            return self._extract_names(tree.body)
        except:
            return []

    def _extract_names(self, node) -> List[str]:
        names = []
        if isinstance(node, ast.Name):
            if node.id not in self._SAFE_FUNCTIONS:
                names.append(node.id)
        for child in ast.iter_child_nodes(node):
            names.extend(self._extract_names(child))
        return list(set(names))
