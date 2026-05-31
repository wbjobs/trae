import uuid
import threading
import time
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass, field
import logging

from .command_model import Command, CommandStep, CommandGroup, CommandType, StepStatus
from .command_parser import CommandParser, ExpressionEvaluator

logger = logging.getLogger(__name__)


@dataclass
class CommandExecutionResult:
    command_id: str
    success: bool
    start_time: float
    end_time: float
    error_message: str = ''
    step_results: List[Dict[str, Any]] = field(default_factory=list)


class ShortcutManager:
    def __init__(self):
        self._shortcuts: Dict[str, str] = {}
        self._on_shortcut: Optional[Callable[[str], None]] = None

    def set_on_shortcut(self, callback: Callable[[str], None]) -> None:
        self._on_shortcut = callback

    def register_shortcut(self, shortcut_key: str, command_id: str) -> None:
        if shortcut_key:
            self._shortcuts[shortcut_key] = command_id
            logger.info(f'Shortcut registered: {shortcut_key} -> {command_id}')

    def unregister_shortcut(self, shortcut_key: str) -> None:
        if shortcut_key in self._shortcuts:
            del self._shortcuts[shortcut_key]
            logger.info(f'Shortcut unregistered: {shortcut_key}')

    def get_shortcut_command(self, shortcut_key: str) -> Optional[str]:
        return self._shortcuts.get(shortcut_key)

    def get_all_shortcuts(self) -> Dict[str, str]:
        return dict(self._shortcuts)

    def trigger_shortcut(self, shortcut_key: str) -> bool:
        command_id = self._shortcuts.get(shortcut_key)
        if command_id and self._on_shortcut:
            try:
                self._on_shortcut(command_id)
                return True
            except Exception as e:
                logger.error(f'Shortcut trigger error: {e}')
        return False


class CommandManager:
    def __init__(self, device_manager=None):
        self._commands: Dict[str, Command] = {}
        self._groups: Dict[str, CommandGroup] = {}
        self._device_manager = device_manager
        self._parser = CommandParser()
        self._evaluator = ExpressionEvaluator()
        self._shortcut_manager = ShortcutManager()
        self._lock = threading.RLock()
        self._execution_lock = threading.Lock()
        self._is_running = False
        self._stop_requested = False
        self._on_command_started: Optional[Callable[[str], None]] = None
        self._on_command_completed: Optional[Callable[[str, CommandExecutionResult], None]] = None
        self._on_step_started: Optional[Callable[[str, str], None]] = None
        self._on_step_completed: Optional[Callable[[str, str, bool], None]] = None

        self._shortcut_manager.set_on_shortcut(self.execute_command)

    @property
    def shortcut_manager(self) -> ShortcutManager:
        return self._shortcut_manager

    def set_device_manager(self, device_manager) -> None:
        self._device_manager = device_manager

    def set_on_command_started(self, callback: Callable[[str], None]) -> None:
        self._on_command_started = callback

    def set_on_command_completed(self, callback: Callable[[str, CommandExecutionResult], None]) -> None:
        self._on_command_completed = callback

    def set_on_step_started(self, callback: Callable[[str, str], None]) -> None:
        self._on_step_started = callback

    def set_on_step_completed(self, callback: Callable[[str, str, bool], None]) -> None:
        self._on_step_completed = callback

    def add_command(self, command: Command) -> bool:
        if not command.validate():
            logger.error(f'Invalid command: {command.name}')
            return False
        with self._lock:
            self._commands[command.command_id] = command
            if command.shortcut_key:
                self._shortcut_manager.register_shortcut(command.shortcut_key, command.command_id)
            logger.info(f'Command added: {command.command_id} - {command.name}')
            return True

    def remove_command(self, command_id: str) -> None:
        with self._lock:
            command = self._commands.get(command_id)
            if command and command.shortcut_key:
                self._shortcut_manager.unregister_shortcut(command.shortcut_key)
            if command_id in self._commands:
                del self._commands[command_id]
            logger.info(f'Command removed: {command_id}')

    def get_command(self, command_id: str) -> Optional[Command]:
        with self._lock:
            return self._commands.get(command_id)

    def get_all_commands(self) -> List[Command]:
        with self._lock:
            return list(self._commands.values())

    def get_commands_by_category(self, category: str) -> List[Command]:
        with self._lock:
            return [c for c in self._commands.values() if c.category == category]

    def export_commands(self, file_path: str, command_ids: List[str] = None) -> bool:
        try:
            with self._lock:
                if command_ids:
                    commands_to_export = [self._commands[cid] for cid in command_ids if cid in self._commands]
                else:
                    commands_to_export = list(self._commands.values())

                data = {
                    'version': '1.0',
                    'export_time': time.time(),
                    'commands': [cmd.to_dict() for cmd in commands_to_export]
                }

            import json
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            logger.info(f'Exported {len(commands_to_export)} commands to {file_path}')
            return True
        except Exception as e:
            logger.error(f'Export commands error: {e}')
            return False

    def import_commands(self, file_path: str, replace_existing: bool = False) -> int:
        try:
            import json
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            commands_data = data.get('commands', [])
            imported_count = 0

            with self._lock:
                for cmd_data in commands_data:
                    try:
                        command = Command.from_dict(cmd_data)
                        if command.command_id in self._commands and not replace_existing:
                            command.command_id = f'{command.command_id}_{uuid.uuid4().hex[:8]}'
                        self._commands[command.command_id] = command
                        imported_count += 1
                    except Exception as e:
                        logger.error(f'Failed to import command: {e}')

            logger.info(f'Imported {imported_count} commands from {file_path}')
            return imported_count
        except Exception as e:
            logger.error(f'Import commands error: {e}')
            return 0

    def get_categories(self) -> List[str]:
        with self._lock:
            categories = set(c.category for c in self._commands.values())
            return sorted(list(categories))

    def update_command(self, command_id: str, updated_command: Command) -> bool:
        with self._lock:
            if command_id not in self._commands:
                return False
            old_command = self._commands[command_id]
            if old_command.shortcut_key:
                self._shortcut_manager.unregister_shortcut(old_command.shortcut_key)
            self._commands[command_id] = updated_command
            if updated_command.shortcut_key:
                self._shortcut_manager.register_shortcut(updated_command.shortcut_key, command_id)
            logger.info(f'Command updated: {command_id}')
            return True

    def add_group(self, group: CommandGroup) -> None:
        with self._lock:
            self._groups[group.group_id] = group
            logger.info(f'Group added: {group.group_id} - {group.name}')

    def remove_group(self, group_id: str) -> None:
        with self._lock:
            if group_id in self._groups:
                del self._groups[group_id]
            logger.info(f'Group removed: {group_id}')

    def get_group(self, group_id: str) -> Optional[CommandGroup]:
        with self._lock:
            return self._groups.get(group_id)

    def get_all_groups(self) -> List[CommandGroup]:
        with self._lock:
            return list(self._groups.values())

    def execute_command(self, command_id: str, params: Dict[str, Any] = None) -> Optional[CommandExecutionResult]:
        command = self.get_command(command_id)
        if not command:
            logger.error(f'Command not found: {command_id}')
            return None

        with self._execution_lock:
            if self._is_running:
                logger.warning('Another command is already running')
                return None

            self._is_running = True
            self._stop_requested = False

        try:
            if self._on_command_started:
                self._on_command_started(command_id)

            result = self._execute_command_internal(command, params or {})

            if self._on_command_completed:
                self._on_command_completed(command_id, result)

            return result
        finally:
            self._is_running = False

    def execute_command_async(self, command_id: str, params: Dict[str, Any] = None) -> None:
        thread = threading.Thread(
            target=self.execute_command,
            args=(command_id, params),
            daemon=True
        )
        thread.start()

    def stop_execution(self) -> None:
        self._stop_requested = True
        logger.info('Command execution stop requested')

    def is_running(self) -> bool:
        return self._is_running

    def _execute_command_internal(self, command: Command, params: Dict[str, Any]) -> CommandExecutionResult:
        start_time = time.time()
        step_results = []
        success = True
        error_message = ''

        self._evaluator.clear_variables()
        for key, value in params.items():
            self._evaluator.set_variable(key, value)

        for step in command.steps:
            if self._stop_requested:
                logger.info('Command execution stopped by user')
                error_message = 'Stopped by user'
                success = False
                break

            try:
                step_result = self._execute_step(step)
                step_results.append(step_result)

                if not step_result.get('success', False):
                    if step.retry_count > 0:
                        retry_success = False
                        for retry in range(step.retry_count):
                            if self._stop_requested:
                                break
                            logger.info(f'Retry step {step.step_id} ({retry + 1}/{step.retry_count})')
                            time.sleep(0.5)
                            step_result = self._execute_step(step)
                            step_results.append(step_result)
                            if step_result.get('success', False):
                                retry_success = True
                                break
                        if not retry_success:
                            success = False
                            error_message = step_result.get('error', 'Unknown error')
                            break
                    else:
                        success = False
                        error_message = step_result.get('error', 'Unknown error')
                        break

            except Exception as e:
                logger.error(f'Step execution error: {e}')
                success = False
                error_message = str(e)
                break

        end_time = time.time()
        return CommandExecutionResult(
            command_id=command.command_id,
            success=success,
            start_time=start_time,
            end_time=end_time,
            error_message=error_message,
            step_results=step_results
        )

    def _execute_step(self, step: CommandStep) -> Dict[str, Any]:
        result = {
            'step_id': step.step_id,
            'success': False,
            'start_time': time.time(),
            'end_time': 0,
            'error': ''
        }

        if step.condition:
            try:
                if not self._evaluator.evaluate_condition(step.condition):
                    result['success'] = True
                    result['skipped'] = True
                    result['end_time'] = time.time()
                    logger.info(f'Step {step.step_id} skipped due to condition')
                    return result
            except Exception as e:
                result['error'] = f'Condition evaluation failed: {e}'
                result['end_time'] = time.time()
                return result

        if step.delay_before > 0:
            time.sleep(step.delay_before)

        if self._on_step_started:
            self._on_step_started(step.device_id, step.command)

        try:
            if not self._device_manager:
                raise RuntimeError('Device manager not set')

            resolved_params = self._evaluator.substitute_dict(step.params)

            command_success = self._device_manager.send_command(
                step.device_id,
                step.command,
                resolved_params
            )

            if command_success:
                if step.delay_after > 0:
                    time.sleep(step.delay_after)

                result['success'] = True
            else:
                result['error'] = 'Command send failed'

        except Exception as e:
            logger.error(f'Step {step.step_id} execution error: {e}')
            result['error'] = str(e)

        result['end_time'] = time.time()

        if self._on_step_completed:
            self._on_step_completed(step.device_id, step.command, result['success'])

        return result

    def import_command_from_text(self, text: str, name: str = 'Imported Command') -> Command:
        parsed = self._parser.parse_command_text(text)
        command = Command(
            command_id=str(uuid.uuid4()),
            name=name,
            command_type=CommandType.SEQUENCE,
            steps=[]
        )

        for i, step_data in enumerate(parsed['steps']):
            step = CommandStep(
                step_id=f'step_{i}',
                device_id=step_data['device_id'],
                command=step_data['command'],
                params=step_data['params']
            )
            command.steps.append(step)

        for var_name, var_value in parsed['variables'].items():
            self._evaluator.set_variable(var_name, var_value)

        return command

    def export_command_to_text(self, command_id: str) -> Optional[str]:
        command = self.get_command(command_id)
        if not command:
            return None

        command_dict = {
            'variables': {},
            'steps': []
        }

        for param in command.parameters:
            command_dict['variables'][param.name] = param.default_value

        for step in command.steps:
            command_dict['steps'].append({
                'device_id': step.device_id,
                'command': step.command,
                'params': step.params
            })

        return self._parser.generate_command_text(command_dict)
