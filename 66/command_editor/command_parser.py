import re
import time
from typing import Dict, Any, Optional, List
import logging

logger = logging.getLogger(__name__)


class ExpressionEvaluator:
    def __init__(self):
        self._variables: Dict[str, Any] = {}
        self._functions = {
            'now': lambda: time.time(),
            'timestamp': lambda: int(time.time()),
            'datetime': lambda: time.strftime('%Y-%m-%d %H:%M:%S'),
            'upper': lambda s: str(s).upper(),
            'lower': lambda s: str(s).lower(),
            'len': lambda x: len(x) if hasattr(x, '__len__') else 0,
            'int': lambda x: int(x),
            'float': lambda x: float(x),
            'str': lambda x: str(x),
            'bool': lambda x: bool(x)
        }

    def set_variable(self, name: str, value: Any) -> None:
        self._variables[name] = value

    def get_variable(self, name: str) -> Any:
        return self._variables.get(name)

    def clear_variables(self) -> None:
        self._variables.clear()

    def evaluate_expression(self, expression: str, context: Dict[str, Any] = None) -> Any:
        if not expression:
            return True

        context = context or {}
        full_context = {**self._variables, **context}

        try:
            for func_name, func in self._functions.items():
                pattern = rf'\b{func_name}\('
                if re.search(pattern, expression):
                    expression = self._replace_function_calls(expression, func_name, func)

            return eval(expression, {"__builtins__": {}}, full_context)
        except Exception as e:
            logger.error(f'Expression evaluation error: {e}, expression: {expression}')
            return False

    def _replace_function_calls(self, expression: str, func_name: str, func) -> str:
        pattern = rf'{func_name}\(([^)]*)\)'

        def replace_match(match):
            args_str = match.group(1).strip()
            try:
                if args_str:
                    args = [self._parse_arg(arg.strip()) for arg in args_str.split(',')]
                    result = func(*args)
                else:
                    result = func()
                return repr(result)
            except Exception:
                return match.group(0)

        return re.sub(pattern, replace_match, expression)

    def _parse_arg(self, arg_str: str) -> Any:
        if (arg_str.startswith('"') and arg_str.endswith('"')) or \
           (arg_str.startswith("'") and arg_str.endswith("'")):
            return arg_str[1:-1]
        try:
            return int(arg_str)
        except ValueError:
            pass
        try:
            return float(arg_str)
        except ValueError:
            pass
        if arg_str.lower() == 'true':
            return True
        if arg_str.lower() == 'false':
            return False
        if arg_str.lower() == 'none' or arg_str.lower() == 'null':
            return None
        return arg_str

    def evaluate_condition(self, condition: str, context: Dict[str, Any] = None) -> bool:
        result = self.evaluate_expression(condition, context)
        return bool(result)

    def substitute_variables(self, template: str, context: Dict[str, Any] = None) -> str:
        if not isinstance(template, str):
            return template

        context = context or {}
        full_context = {**self._variables, **context}

        def replace_var(match):
            var_name = match.group(1)
            value = full_context.get(var_name, match.group(0))
            return str(value)

        return re.sub(r'\$\{([^}]+)\}', replace_var, template)

    def substitute_dict(self, data: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        result = {}
        for key, value in data.items():
            if isinstance(value, str):
                result[key] = self.substitute_variables(value, context)
            elif isinstance(value, dict):
                result[key] = self.substitute_dict(value, context)
            elif isinstance(value, list):
                result[key] = [self.substitute_variables(v, context) if isinstance(v, str) else v for v in value]
            else:
                result[key] = value
        return result


class CommandParser:
    def __init__(self):
        self.evaluator = ExpressionEvaluator()

    def parse_command_text(self, text: str) -> Dict[str, Any]:
        lines = text.strip().split('\n')
        result = {
            'steps': [],
            'variables': {}
        }

        for line in lines:
            line = line.strip()
            if not line or line.startswith('#'):
                continue

            if line.startswith('$'):
                var_match = re.match(r'\$(\w+)\s*=\s*(.+)', line)
                if var_match:
                    var_name = var_match.group(1)
                    var_value = var_match.group(2).strip()
                    result['variables'][var_name] = var_value
                continue

            step_match = re.match(r'(\w+)\.(\w+)\((.*?)\)', line)
            if step_match:
                device_id = step_match.group(1)
                command = step_match.group(2)
                params_str = step_match.group(3).strip()
                params = self._parse_params(params_str)
                result['steps'].append({
                    'device_id': device_id,
                    'command': command,
                    'params': params
                })

        return result

    def _parse_params(self, params_str: str) -> Dict[str, Any]:
        params = {}
        if not params_str:
            return params

        param_parts = self._split_params(params_str)
        for part in param_parts:
            part = part.strip()
            if '=' in part:
                key, value = part.split('=', 1)
                key = key.strip()
                value = value.strip()
                params[key] = self._parse_value(value)
        return params

    def _split_params(self, params_str: str) -> List[str]:
        parts = []
        current = ''
        depth = 0
        in_string = False
        string_char = ''

        for char in params_str:
            if char in ('"', "'") and not in_string:
                in_string = True
                string_char = char
                current += char
            elif char == string_char and in_string:
                in_string = False
                current += char
            elif char == ',' and depth == 0 and not in_string:
                parts.append(current)
                current = ''
            elif char in ('(', '[', '{') and not in_string:
                depth += 1
                current += char
            elif char in (')', ']', '}') and not in_string:
                depth -= 1
                current += char
            else:
                current += char

        if current:
            parts.append(current)
        return parts

    def _parse_value(self, value_str: str) -> Any:
        if (value_str.startswith('"') and value_str.endswith('"')) or \
           (value_str.startswith("'") and value_str.endswith("'")):
            return value_str[1:-1]

        if value_str.startswith('${') and value_str.endswith('}'):
            return value_str

        try:
            return int(value_str)
        except ValueError:
            pass

        try:
            return float(value_str)
        except ValueError:
            pass

        if value_str.lower() == 'true':
            return True
        if value_str.lower() == 'false':
            return False
        if value_str.lower() in ('none', 'null'):
            return None

        return value_str

    def generate_command_text(self, command_dict: Dict[str, Any]) -> str:
        lines = []

        for var_name, var_value in command_dict.get('variables', {}).items():
            lines.append(f'${var_name} = {var_value}')

        if lines:
            lines.append('')

        for step in command_dict.get('steps', []):
            params_str = ', '.join([f'{k}={v}' for k, v in step.get('params', {}).items()])
            lines.append(f"{step['device_id']}.{step['command']}({params_str})")

        return '\n'.join(lines)
