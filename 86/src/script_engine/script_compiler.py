import ast
import re
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from src.core.event_bus import EventBus, EventType


class ScriptType(Enum):
    STARTUP = "startup"
    SHUTDOWN = "shutdown"
    PERIODIC = "periodic"
    ON_CHANGE = "on_change"
    ALARM = "alarm"
    CUSTOM = "custom"


@dataclass
class ScriptError:
    line: int
    column: int
    message: str
    severity: str = "error"


@dataclass
class ScriptInfo:
    script_id: str
    script_name: str
    script_type: ScriptType
    content: str
    description: str = ""
    enabled: bool = True
    interval: int = 1000
    trigger_tags: List[str] = field(default_factory=list)
    last_execution: Optional[float] = None
    execution_count: int = 0
    errors: List[ScriptError] = field(default_factory=list)


class ScriptValidator:
    _ALLOWED_MODULES = {'math', 'time', 'datetime', 'random'}
    _ALLOWED_BUILTINS = {
        'abs', 'round', 'min', 'max', 'int', 'float', 'bool', 'str',
        'len', 'sum', 'sorted', 'range', 'enumerate', 'zip',
        'print', 'isinstance', 'type', 'list', 'dict', 'tuple', 'set'
    }
    _FORBIDDEN_NODES = {
        ast.Import, ast.ImportFrom, ast.Global, ast.Nonlocal,
        ast.Yield, ast.YieldFrom, ast.Await, ast.AsyncFunctionDef,
        ast.ClassDef, ast.Delete, ast.Raise, ast.Try,
        ast.Match, ast.MatchAs, ast.MatchCase, ast.MatchClass,
        ast.MatchMapping, ast.MatchOr, ast.MatchSequence, ast.MatchSingleton,
        ast.MatchStar, ast.MatchValue, ast.WalrusOp
    }
    _FORBIDDEN_FUNCTIONS = {
        'eval', 'exec', 'compile', 'open', 'input', 'getattr', 'setattr',
        'hasattr', 'delattr', '__import__', 'globals', 'locals', 'vars',
        'dir', 'help', 'id', 'repr', 'ascii', 'bytes', 'bytearray',
        'memoryview', 'frozenset', 'complex', 'object', 'super',
        '__build_class__', '__debug__', '__doc__', '__loader__',
        '__name__', '__package__', '__spec__', 'breakpoint', 'exit',
        'quit', 'license', 'credits', 'copyright'
    }
    _FORBIDDEN_ATTRIBUTES = {
        '__dict__', '__class__', '__bases__', '__subclasses__',
        '__mro__', '__code__', '__globals__', '__closure__',
        '__func__', '__self__', '__module__', '__doc__',
        '__qualname__', '__annotations__', '__defaults__',
        '__kwdefaults__', '__get__', '__set__', '__delete__',
        '__getattr__', '__setattr__', '__delattr__', '__getattribute__',
        '__init__', '__new__', '__call__', '__enter__', '__exit__',
        'im_class', 'im_func', 'im_self', 'func_closure', 'func_code',
        'func_defaults', 'func_globals', 'func_name'
    }

    def __init__(self):
        self._tag_names: List[str] = []

    def set_tag_names(self, tag_names: List[str]):
        self._tag_names = tag_names

    def validate(self, script_content: str) -> Tuple[bool, List[ScriptError]]:
        errors = []
        try:
            tree = ast.parse(script_content)
            self._check_forbidden_nodes(tree, errors)
            self._check_variable_names(tree, errors)
            self._check_function_calls(tree, errors)
            self._check_string_escapes(tree, errors)
            self._check_subscript_safety(tree, errors)
            self._check_recursion_risk(tree, errors)
            self._check_infinite_loop_risk(tree, errors)
            return len(errors) == 0, errors
        except SyntaxError as e:
            errors.append(ScriptError(
                line=e.lineno or 1,
                column=e.offset or 1,
                message=f"Syntax error: {e.msg}"
            ))
            return False, errors
        except RecursionError:
            errors.append(ScriptError(
                line=1,
                column=1,
                message="Script parsing recursion limit exceeded"
            ))
            return False, errors

    def _check_recursion_risk(self, tree: ast.AST, errors: List[ScriptError]):
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                func_name = node.name
                for sub_node in ast.walk(node):
                    if isinstance(sub_node, ast.Call):
                        if isinstance(sub_node.func, ast.Name) and sub_node.func.id == func_name:
                            errors.append(ScriptError(
                                line=node.lineno,
                                column=node.col_offset,
                                message=f"Potential infinite recursion detected in function '{func_name}'",
                                severity="warning"
                            ))

    def _check_infinite_loop_risk(self, tree: ast.AST, errors: List[ScriptError]):
        for node in ast.walk(tree):
            if isinstance(node, ast.While):
                if isinstance(node.test, ast.Constant) and node.test.value is True:
                    has_break = False
                    for sub_node in ast.walk(node):
                        if isinstance(sub_node, ast.Break):
                            has_break = True
                            break
                    if not has_break:
                        errors.append(ScriptError(
                            line=node.lineno,
                            column=node.col_offset,
                            message="Potential infinite loop: while True without break statement",
                            severity="warning"
                        ))

    def _check_forbidden_nodes(self, tree: ast.AST, errors: List[ScriptError]):
        for node in ast.walk(tree):
            for forbidden in self._FORBIDDEN_NODES:
                if isinstance(node, forbidden):
                    errors.append(ScriptError(
                        line=node.lineno,
                        column=node.col_offset,
                        message=f"Forbidden statement: {forbidden.__name__}",
                        severity="error"
                    ))

    def _check_variable_names(self, tree: ast.AST, errors: List[ScriptError]):
        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                if node.id.startswith('__'):
                    errors.append(ScriptError(
                        line=node.lineno,
                        column=node.col_offset,
                        message=f"Invalid variable name: {node.id} (cannot start with __)",
                        severity="error"
                    ))
            if isinstance(node, ast.Attribute):
                self._check_attribute_chain(node, errors)
                if isinstance(node.value, ast.Name) and node.value.id in ['os', 'sys', 'subprocess', 'builtins', '__builtin__']:
                    errors.append(ScriptError(
                        line=node.lineno,
                        column=node.col_offset,
                        message=f"Forbidden module access: {node.value.id}",
                        severity="error"
                    ))

    def _check_string_escapes(self, tree: ast.AST, errors: List[ScriptError]):
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                if '\\x' in node.value or '\\u' in node.value or '\\U' in node.value:
                    errors.append(ScriptError(
                        line=node.lineno,
                        column=node.col_offset,
                        message="Suspicious string escape sequence detected",
                        severity="warning"
                    ))

    def _check_subscript_safety(self, tree: ast.AST, errors: List[ScriptError]):
        for node in ast.walk(tree):
            if isinstance(node, ast.Subscript):
                if isinstance(node.slice, ast.Slice):
                    if isinstance(node.slice.upper, ast.Constant) and node.slice.upper.value < 0:
                        errors.append(ScriptError(
                            line=node.lineno,
                            column=node.col_offset,
                            message="Negative upper bound in slice may cause unexpected behavior",
                            severity="warning"
                        ))

    def extract_tag_references(self, script_content: str) -> List[str]:
        try:
            tree = ast.parse(script_content)
            tags = []
            for node in ast.walk(tree):
                if isinstance(node, ast.Subscript):
                    if isinstance(node.value, ast.Name) and node.value.id in ['tags', 'TAGS', 'tag']:
                        if isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, str):
                            tags.append(node.slice.value)
            return list(set(tags))
        except:
            return []

    def extract_tag_assignments(self, script_content: str) -> List[str]:
        try:
            tree = ast.parse(script_content)
            assignments = []
            for node in ast.walk(tree):
                if isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Subscript):
                            if isinstance(target.value, ast.Name) and target.value.id in ['tags', 'TAGS', 'tag']:
                                if isinstance(target.slice, ast.Constant) and isinstance(target.slice.value, str):
                                    assignments.append(target.slice.value)
            return list(set(assignments))
        except:
            return []


class ScriptCompiler:
    def __init__(self):
        self._validator = ScriptValidator()
        self._compiled_scripts: Dict[str, Any] = {}

    def set_tag_names(self, tag_names: List[str]):
        self._validator.set_tag_names(tag_names)

    def compile_script(self, script_info: ScriptInfo) -> Tuple[bool, List[ScriptError]]:
        is_valid, errors = self._validator.validate(script_info.content)
        script_info.errors = errors
        if not is_valid:
            return False, errors
        try:
            compiled = compile(script_info.content, f"<script:{script_info.script_id}>", "exec")
            self._compiled_scripts[script_info.script_id] = compiled
            return True, []
        except Exception as e:
            error = ScriptError(
                line=1,
                column=1,
                message=f"Compilation error: {str(e)}"
            )
            script_info.errors = [error]
            return False, [error]

    def get_compiled_script(self, script_id: str) -> Optional[Any]:
        return self._compiled_scripts.get(script_id)

    def validate_script(self, script_content: str) -> Tuple[bool, List[ScriptError]]:
        return self._validator.validate(script_content)

    def extract_tags(self, script_content: str) -> Tuple[List[str], List[str]]:
        references = self._validator.extract_tag_references(script_content)
        assignments = self._validator.extract_tag_assignments(script_content)
        return references, assignments
