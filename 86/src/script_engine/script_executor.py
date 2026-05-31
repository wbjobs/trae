import threading
import time
import math
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime
from .script_compiler import ScriptInfo, ScriptCompiler, ScriptType
from src.core.event_bus import EventBus, EventType


class ScriptExecutionContext:
    def __init__(self):
        self._tags: Dict[str, Any] = {}
        self._parameters: Dict[str, Any] = {}
        self._results: Dict[str, Any] = {}
        self._execution_time: float = 0.0

    def set_tags(self, tags: Dict[str, Any]):
        self._tags = tags

    def get_tag(self, name: str) -> Any:
        return self._tags.get(name)

    def set_tag(self, name: str, value: Any):
        self._tags[name] = value

    def set_parameter(self, name: str, value: Any):
        self._parameters[name] = value

    def get_parameter(self, name: str) -> Any:
        return self._parameters.get(name)

    def set_result(self, name: str, value: Any):
        self._results[name] = value

    def get_result(self, name: str) -> Any:
        return self._results.get(name)

    @property
    def tags(self) -> Dict[str, Any]:
        return self._tags

    @property
    def parameters(self) -> Dict[str, Any]:
        return self._parameters

    @property
    def results(self) -> Dict[str, Any]:
        return self._results


class ScriptExecutor:
    def __init__(self):
        self._compiler = ScriptCompiler()
        self._scripts: Dict[str, ScriptInfo] = {}
        self._context = ScriptExecutionContext()
        self._running = False
        self._execution_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._event_bus = EventBus()
        self._tag_change_listeners: Dict[str, List[str]] = {}
        self._last_tag_values: Dict[str, Any] = {}

    def set_tag_names(self, tag_names: List[str]):
        self._compiler.set_tag_names(tag_names)

    def add_script(self, script_info: ScriptInfo) -> Tuple[bool, List]:
        is_valid, errors = self._compiler.compile_script(script_info)
        if is_valid:
            self._scripts[script_info.script_id] = script_info
            if script_info.script_type == ScriptType.ON_CHANGE:
                for tag_name in script_info.trigger_tags:
                    if tag_name not in self._tag_change_listeners:
                        self._tag_change_listeners[tag_name] = []
                    self._tag_change_listeners[tag_name].append(script_info.script_id)
        return is_valid, errors

    def remove_script(self, script_id: str):
        if script_id in self._scripts:
            del self._scripts[script_id]
        for tag_name, script_ids in self._tag_change_listeners.items():
            if script_id in script_ids:
                script_ids.remove(script_id)

    def validate_script(self, content: str) -> Tuple[bool, List]:
        return self._compiler.validate_script(content)

    def execute_script(self, script_id: str, tag_values: Dict[str, Any]) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        if script_id not in self._scripts:
            return False, f"Script {script_id} not found", {}
        script_info = self._scripts[script_id]
        if not script_info.enabled:
            return False, "Script is disabled", {}
        compiled = self._compiler.get_compiled_script(script_id)
        if compiled is None:
            return False, "Script not compiled", {}
        try:
            self._context.set_tags(dict(tag_values))
            safe_globals = self._create_safe_globals()
            safe_locals = self._create_safe_locals()
            import signal
            def timeout_handler(signum, frame):
                raise TimeoutError("Script execution timed out")
            old_handler = None
            if hasattr(signal, 'SIGALRM'):
                old_handler = signal.signal(signal.SIGALRM, timeout_handler)
                signal.alarm(5)
            try:
                exec(compiled, safe_globals, safe_locals)
            finally:
                if hasattr(signal, 'SIGALRM') and old_handler is not None:
                    signal.signal(signal.SIGALRM, old_handler)
                    signal.alarm(0)
            script_info.last_execution = time.time()
            script_info.execution_count += 1
            self._event_bus.publish(EventType.SCRIPT_COMPILED, {
                "script_id": script_id,
                "success": True
            })
            return True, None, dict(self._context.tags)
        except TimeoutError as e:
            error_msg = f"Script execution timed out after 5 seconds"
            self._event_bus.publish(EventType.SCRIPT_ERROR, {
                "script_id": script_id,
                "error": error_msg
            })
            return False, error_msg, {}
        except Exception as e:
            error_msg = f"Execution error: {str(e)}"
            self._event_bus.publish(EventType.SCRIPT_ERROR, {
                "script_id": script_id,
                "error": error_msg
            })
            return False, error_msg, {}

    def _create_safe_globals(self) -> Dict[str, Any]:
        return {
            "__builtins__": self._create_safe_builtins(),
            "math": math,
            "time": time,
            "datetime": datetime,
        }

    def _create_safe_builtins(self) -> Dict[str, Any]:
        import builtins
        allowed = {
            'abs': builtins.abs,
            'round': builtins.round,
            'min': builtins.min,
            'max': builtins.max,
            'int': builtins.int,
            'float': builtins.float,
            'bool': builtins.bool,
            'str': builtins.str,
            'len': builtins.len,
            'sum': builtins.sum,
            'sorted': builtins.sorted,
            'range': builtins.range,
            'enumerate': builtins.enumerate,
            'zip': builtins.zip,
            'print': builtins.print,
            'isinstance': builtins.isinstance,
            'type': builtins.type,
            'True': True,
            'False': False,
            'None': None,
        }
        return allowed

    def _create_safe_locals(self) -> Dict[str, Any]:
        return {
            'tags': self._TagAccessor(self._context),
            'tag': self._context.tags,
            'params': self._context.parameters,
            'results': self._context.results,
        }

    class _TagAccessor:
        def __init__(self, context: ScriptExecutionContext):
            self._context = context

        def __getitem__(self, key: str) -> Any:
            return self._context.get_tag(key)

        def __setitem__(self, key: str, value: Any):
            self._context.set_tag(key, value)

        def __contains__(self, key: str) -> bool:
            return key in self._context.tags

    def start_execution(self, tag_values_provider: Callable[[], Dict[str, Any]]):
        if self._running:
            return
        self._running = True
        self._tag_values_provider = tag_values_provider
        self._execution_thread = threading.Thread(target=self._execution_loop, daemon=True)
        self._execution_thread.start()

    def stop_execution(self):
        self._running = False
        if self._execution_thread:
            self._execution_thread.join(timeout=2)
            self._execution_thread = None

    def _execution_loop(self):
        last_execution_times: Dict[str, float] = {}
        while self._running:
            try:
                tag_values = self._tag_values_provider() if hasattr(self, '_tag_values_provider') else {}
                current_time = time.time()
                for script_id, script_info in self._scripts.items():
                    if not script_info.enabled:
                        continue
                    should_execute = False
                    if script_info.script_type == ScriptType.PERIODIC:
                        last = last_execution_times.get(script_id, 0)
                        if current_time - last >= script_info.interval / 1000:
                            should_execute = True
                            last_execution_times[script_id] = current_time
                    if should_execute:
                        self.execute_script(script_id, tag_values)
                time.sleep(0.05)
            except Exception as e:
                print(f"Script execution loop error: {e}")

    def on_tag_changed(self, tag_name: str, new_value: Any, tag_values: Dict[str, Any]):
        if tag_name in self._tag_change_listeners:
            for script_id in self._tag_change_listeners[tag_name]:
                self.execute_script(script_id, tag_values)

    def execute_startup_scripts(self, tag_values: Dict[str, Any]) -> Dict[str, Any]:
        current_tags = dict(tag_values)
        for script_info in self._scripts.values():
            if script_info.script_type == ScriptType.STARTUP and script_info.enabled:
                success, _, updated_tags = self.execute_script(script_info.script_id, current_tags)
                if success:
                    current_tags.update(updated_tags)
        return current_tags

    def execute_shutdown_scripts(self, tag_values: Dict[str, Any]):
        for script_info in self._scripts.values():
            if script_info.script_type == ScriptType.SHUTDOWN and script_info.enabled:
                self.execute_script(script_info.script_id, tag_values)

    def get_script_info(self, script_id: str) -> Optional[ScriptInfo]:
        return self._scripts.get(script_id)

    def get_all_scripts(self) -> List[ScriptInfo]:
        return list(self._scripts.values())
