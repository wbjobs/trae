import uuid
import time
import threading
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass, field
from enum import Enum
import logging
import re

logger = logging.getLogger(__name__)


class LinkageConditionType(Enum):
    DEVICE_STATUS = 'device_status'
    DEVICE_VALUE = 'device_value'
    TIME_SCHEDULE = 'time_schedule'
    COMMAND_RESULT = 'command_result'
    CUSTOM_EXPRESSION = 'custom_expression'


class LinkageActionType(Enum):
    SEND_COMMAND = 'send_command'
    EXECUTE_COMMAND = 'execute_command'
    DELAY = 'delay'
    NOTIFY = 'notify'
    WEBHOOK = 'webhook'


@dataclass
class LinkageCondition:
    condition_type: LinkageConditionType
    parameters: Dict[str, Any] = field(default_factory=dict)
    expression: str = ''

    def to_dict(self) -> Dict[str, Any]:
        return {
            'condition_type': self.condition_type.value,
            'parameters': self.parameters,
            'expression': self.expression
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'LinkageCondition':
        return cls(
            condition_type=LinkageConditionType(data['condition_type']),
            parameters=data.get('parameters', {}),
            expression=data.get('expression', '')
        )


@dataclass
class LinkageAction:
    action_type: LinkageActionType
    parameters: Dict[str, Any] = field(default_factory=dict)
    delay: float = 0.0
    last_error: str = ''

    def to_dict(self) -> Dict[str, Any]:
        return {
            'action_type': self.action_type.value,
            'parameters': self.parameters,
            'delay': self.delay
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'LinkageAction':
        return cls(
            action_type=LinkageActionType(data['action_type']),
            parameters=data.get('parameters', {}),
            delay=data.get('delay', 0.0)
        )


@dataclass
class LinkageRule:
    rule_id: str
    name: str
    description: str = ''
    enabled: bool = True
    conditions: List[LinkageCondition] = field(default_factory=list)
    actions: List[LinkageAction] = field(default_factory=list)
    trigger_count: int = 0
    last_triggered: float = 0.0
    cooldown: float = 1.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            'rule_id': self.rule_id,
            'name': self.name,
            'description': self.description,
            'enabled': self.enabled,
            'conditions': [c.to_dict() for c in self.conditions],
            'actions': [a.to_dict() for a in self.actions],
            'trigger_count': self.trigger_count,
            'last_triggered': self.last_triggered,
            'cooldown': self.cooldown
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'LinkageRule':
        return cls(
            rule_id=data['rule_id'],
            name=data['name'],
            description=data.get('description', ''),
            enabled=data.get('enabled', True),
            conditions=[LinkageCondition.from_dict(c) for c in data.get('conditions', [])],
            actions=[LinkageAction.from_dict(a) for a in data.get('actions', [])],
            trigger_count=data.get('trigger_count', 0),
            last_triggered=data.get('last_triggered', 0.0),
            cooldown=data.get('cooldown', 1.0)
        )


class LinkageEngine:
    def __init__(self, device_manager=None, command_manager=None, scheduler=None):
        self._device_manager = device_manager
        self._command_manager = command_manager
        self._scheduler = scheduler
        self._rules: Dict[str, LinkageRule] = {}
        self._lock = threading.RLock()
        self._monitor_thread = None
        self._stop_event = threading.Event()
        self._device_states: Dict[str, Dict[str, Any]] = {}
        self._on_rule_triggered: Optional[Callable[[LinkageRule], None]] = None
        self._on_action_executed: Optional[Callable[[LinkageAction, bool], None]] = None
        self._on_rule_failed: Optional[Callable[[LinkageRule, str], None]] = None
        self._variables: Dict[str, Any] = {}

    def set_device_manager(self, device_manager) -> None:
        self._device_manager = device_manager

    def set_command_manager(self, command_manager) -> None:
        self._command_manager = command_manager

    def set_scheduler(self, scheduler) -> None:
        self._scheduler = scheduler

    def set_on_rule_triggered(self, callback: Callable[[LinkageRule], None]) -> None:
        self._on_rule_triggered = callback

    def set_on_action_executed(self, callback: Callable[[LinkageAction, bool], None]) -> None:
        self._on_action_executed = callback

    def set_on_rule_failed(self, callback: Callable[[LinkageRule, str], None]) -> None:
        self._on_rule_failed = callback

    def add_rule(self, rule: LinkageRule) -> None:
        with self._lock:
            self._rules[rule.rule_id] = rule
            logger.info(f'Linkage rule added: {rule.rule_id} - {rule.name}')

    def remove_rule(self, rule_id: str) -> None:
        with self._lock:
            if rule_id in self._rules:
                del self._rules[rule_id]
            logger.info(f'Linkage rule removed: {rule_id}')

    def get_rule(self, rule_id: str) -> Optional[LinkageRule]:
        with self._lock:
            return self._rules.get(rule_id)

    def get_all_rules(self) -> List[LinkageRule]:
        with self._lock:
            return list(self._rules.values())

    def enable_rule(self, rule_id: str) -> None:
        with self._lock:
            rule = self._rules.get(rule_id)
            if rule:
                rule.enabled = True
                logger.info(f'Rule enabled: {rule_id}')

    def disable_rule(self, rule_id: str) -> None:
        with self._lock:
            rule = self._rules.get(rule_id)
            if rule:
                rule.enabled = False
                logger.info(f'Rule disabled: {rule_id}')

    def start(self) -> None:
        if self._monitor_thread and self._monitor_thread.is_alive():
            return

        self._stop_event.clear()
        self._monitor_thread = threading.Thread(
            target=self._monitor_loop,
            daemon=True,
            name='LinkageMonitor'
        )
        self._monitor_thread.start()
        logger.info('Linkage engine started')

    def stop(self) -> None:
        self._stop_event.set()
        if self._monitor_thread:
            self._monitor_thread.join(timeout=2.0)
        logger.info('Linkage engine stopped')

    def trigger_rule(self, rule_id: str) -> bool:
        rule = self.get_rule(rule_id)
        if not rule or not rule.enabled:
            return False
        self._execute_rule(rule)
        return True

    def update_device_state(self, device_id: str, state: Dict[str, Any]) -> None:
        with self._lock:
            if device_id not in self._device_states:
                self._device_states[device_id] = {}
            self._device_states[device_id].update(state)

    def set_variable(self, name: str, value: Any) -> None:
        with self._lock:
            self._variables[name] = value

    def _monitor_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                self._check_all_rules()
            except Exception as e:
                logger.error(f'Linkage monitor loop error: {e}')
            time.sleep(0.5)

    def _check_all_rules(self) -> None:
        with self._lock:
            rules = list(self._rules.values())

        for rule in rules:
            if not rule.enabled:
                continue

            current_time = time.time()
            if current_time - rule.last_triggered < rule.cooldown:
                continue

            if self._evaluate_rule_conditions(rule):
                self._execute_rule(rule)

    def _evaluate_rule_conditions(self, rule: LinkageRule) -> bool:
        if not rule.conditions:
            return True

        for condition in rule.conditions:
            if not self._evaluate_condition(condition):
                return False

        return True

    def _evaluate_condition(self, condition: LinkageCondition) -> bool:
        params = condition.parameters

        try:
            if condition.condition_type == LinkageConditionType.DEVICE_STATUS:
                device_id = params.get('device_id')
                expected_status = params.get('status')
                if not device_id or not self._device_manager:
                    return False
                device = self._device_manager.get_device(device_id)
                if not device:
                    return False
                return device.status.value == expected_status

            elif condition.condition_type == LinkageConditionType.DEVICE_VALUE:
                device_id = params.get('device_id')
                field = params.get('field')
                operator = params.get('operator', '==')
                expected_value = params.get('value')

                if not device_id or not field:
                    return False

                device_state = self._device_states.get(device_id, {})
                actual_value = device_state.get(field)

                if actual_value is None:
                    return False

                return self._compare_values(actual_value, expected_value, operator)

            elif condition.condition_type == LinkageConditionType.TIME_SCHEDULE:
                return self._evaluate_time_condition(params)

            elif condition.condition_type == LinkageConditionType.CUSTOM_EXPRESSION:
                return self._evaluate_expression(condition.expression)

            return False

        except Exception as e:
            logger.error(f'Condition evaluation error: {e}')
            return False

    def _compare_values(self, actual: Any, expected: Any, operator: str) -> bool:
        try:
            if operator == '==':
                return actual == expected
            elif operator == '!=':
                return actual != expected
            elif operator == '>':
                return float(actual) > float(expected)
            elif operator == '>=':
                return float(actual) >= float(expected)
            elif operator == '<':
                return float(actual) < float(expected)
            elif operator == '<=':
                return float(actual) <= float(expected)
            elif operator == 'contains':
                return str(expected) in str(actual)
            elif operator == 'in':
                return actual in expected
        except (ValueError, TypeError):
            pass
        return False

    def _evaluate_time_condition(self, params: Dict[str, Any]) -> bool:
        now = time.localtime()
        current_time = now.tm_hour * 3600 + now.tm_min * 60 + now.tm_sec

        start_time = params.get('start_time', '00:00')
        end_time = params.get('end_time', '23:59')
        days = params.get('days', list(range(7)))

        start_seconds = self._time_to_seconds(start_time)
        end_seconds = self._time_to_seconds(end_time)

        if now.tm_wday not in days:
            return False

        if start_seconds <= end_seconds:
            return start_seconds <= current_time <= end_seconds
        else:
            return current_time >= start_seconds or current_time <= end_seconds

    def _time_to_seconds(self, time_str: str) -> int:
        parts = time_str.split(':')
        hours = int(parts[0]) if len(parts) > 0 else 0
        minutes = int(parts[1]) if len(parts) > 1 else 0
        seconds = int(parts[2]) if len(parts) > 2 else 0
        return hours * 3600 + minutes * 60 + seconds

    def _evaluate_expression(self, expression: str) -> bool:
        if not expression:
            return True

        context = {
            'device_states': dict(self._device_states),
            'vars': dict(self._variables),
            'time': time.time()
        }

        try:
            for device_id, state in self._device_states.items():
                context[device_id] = state

            result = eval(expression, {"__builtins__": {}}, context)
            return bool(result)
        except Exception as e:
            logger.error(f'Expression evaluation error: {e}')
            return False

    def _execute_rule(self, rule: LinkageRule) -> None:
        rule.last_triggered = time.time()
        rule.trigger_count += 1

        logger.info(f'Rule triggered: {rule.rule_id} - {rule.name}')

        if self._on_rule_triggered:
            try:
                self._on_rule_triggered(rule)
            except Exception as e:
                logger.error(f'Rule triggered callback error: {e}')

        def execute_with_error_handling():
            failed_actions = []
            for action in rule.actions:
                if self._stop_event.is_set():
                    break
                if action.delay > 0:
                    time.sleep(action.delay)
                success = self._execute_single_action(action)
                if self._on_action_executed:
                    try:
                        self._on_action_executed(action, success)
                    except Exception as e:
                        logger.error(f'Action executed callback error: {e}')
                if not success:
                    failed_actions.append(f'{action.action_type.value}: {action.last_error}')
                    logger.warning(f'Action failed: {action.action_type.value} - {action.last_error}')
            if failed_actions and self._on_rule_failed:
                error_msg = '; '.join(failed_actions)
                try:
                    self._on_rule_failed(rule, error_msg)
                except Exception as e:
                    logger.error(f'Rule failed callback error: {e}')

        threading.Thread(
            target=execute_with_error_handling,
            daemon=True
        ).start()

    def _execute_actions(self, actions: List[LinkageAction]) -> None:
        for action in actions:
            if self._stop_event.is_set():
                break

            if action.delay > 0:
                time.sleep(action.delay)

            success = self._execute_single_action(action)

            if self._on_action_executed:
                try:
                    self._on_action_executed(action, success)
                except Exception as e:
                    logger.error(f'Action executed callback error: {e}')

            if not success:
                logger.warning(f'Action failed: {action.action_type.value}')

    def _execute_single_action(self, action: LinkageAction) -> bool:
        params = action.parameters
        error_msg = ''

        try:
            if action.action_type == LinkageActionType.SEND_COMMAND:
                device_id = params.get('device_id')
                command = params.get('command')
                command_params = params.get('params', {})
                if not device_id or not command:
                    error_msg = '缺少设备ID或指令'
                    return False
                if not self._device_manager:
                    error_msg = '设备管理器未初始化'
                    return False
                success = self._device_manager.send_command(device_id, command, command_params)
                if not success:
                    error_msg = f'设备 {device_id} 指令 {command} 执行失败'
                return success

            elif action.action_type == LinkageActionType.EXECUTE_COMMAND:
                command_id = params.get('command_id')
                if not command_id:
                    error_msg = '缺少指令ID'
                    return False
                if not self._command_manager:
                    error_msg = '指令管理器未初始化'
                    return False
                self._command_manager.execute_command_async(command_id)
                return True

            elif action.action_type == LinkageActionType.DELAY:
                delay = params.get('seconds', 1.0)
                time.sleep(delay)
                return True

            elif action.action_type == LinkageActionType.NOTIFY:
                title = params.get('title', '联动通知')
                message = params.get('message', '')
                from platform_adapter import platform
                platform.show_notification(title, message)
                return True

            elif action.action_type == LinkageActionType.WEBHOOK:
                import requests
                url = params.get('url')
                if not url:
                    error_msg = '缺少Webhook URL'
                    return False
                method = params.get('method', 'POST')
                data = params.get('data', {})
                response = requests.request(method, url, json=data, timeout=5.0)
                if not response.ok:
                    error_msg = f'Webhook请求失败: HTTP {response.status_code}'
                return response.ok

            else:
                error_msg = f'未知的动作类型: {action.action_type.value}'
                return False

        except Exception as e:
            error_msg = f'执行异常: {str(e)}'
            logger.error(f'Action execution error: {e}')
            return False
        finally:
            if error_msg:
                action.last_error = error_msg
