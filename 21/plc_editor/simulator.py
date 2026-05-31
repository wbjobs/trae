import time
import threading
from typing import Dict, Callable, Optional
from dataclasses import dataclass, field

from .ast_nodes import ASTVisitor, ProgramNode, RungNode, ContactNode, OutputNode, AndNode, OrNode, NotNode


class Evaluator(ASTVisitor):
    def __init__(self, inputs: Dict[str, bool], outputs: Dict[str, bool]):
        self.inputs = inputs
        self.outputs = outputs

    def visit_contact(self, node: ContactNode) -> bool:
        value = self.inputs.get(node.name, False)
        return not value if node.negated else value

    def visit_output(self, node: OutputNode) -> bool:
        return self.outputs.get(node.name, False)

    def visit_not(self, node: NotNode) -> bool:
        return not node.operand.accept(self)

    def visit_and(self, node: AndNode) -> bool:
        return node.left.accept(self) and node.right.accept(self)

    def visit_or(self, node: OrNode) -> bool:
        return node.left.accept(self) or node.right.accept(self)

    def visit_rung(self, node: RungNode) -> None:
        result = node.condition.accept(self)
        self.outputs[node.output.name] = result

    def visit_program(self, node: ProgramNode) -> None:
        for rung in node.rungs:
            rung.accept(self)


@dataclass
class ScanResult:
    cycle_number: int
    inputs: Dict[str, bool]
    outputs: Dict[str, bool]
    timestamp: float = field(default_factory=time.time)


class PLCSimulator:
    def __init__(self, ast: ProgramNode, scan_interval_ms: int = 100):
        self.ast = ast
        self.scan_interval_ms = scan_interval_ms
        self.inputs: Dict[str, bool] = {}
        self.outputs: Dict[str, bool] = {}
        self._scan_count: int = 0
        self._running: bool = False
        self._paused: bool = False
        self._step_requested: bool = False
        self._on_scan_complete: Optional[Callable[[ScanResult], None]] = None
        self._scan_thread: Optional[threading.Thread] = None
        self._extract_variables()

    def _extract_variables(self):
        for rung in self.ast.rungs:
            self._extract_from_node(rung.condition)
            self._extract_from_node(rung.output)

    def _extract_from_node(self, node):
        if isinstance(node, ContactNode):
            if node.name not in self.inputs:
                self.inputs[node.name] = False
        elif isinstance(node, OutputNode):
            if node.name not in self.outputs:
                self.outputs[node.name] = False
        elif hasattr(node, 'left'):
            self._extract_from_node(node.left)
            self._extract_from_node(node.right)
        elif hasattr(node, 'operand'):
            self._extract_from_node(node.operand)

    def set_input(self, name: str, value: bool) -> None:
        self.inputs[name] = value

    def get_input(self, name: str) -> bool:
        return self.inputs.get(name, False)

    def get_output(self, name: str) -> bool:
        return self.outputs.get(name, False)

    def get_all_inputs(self) -> Dict[str, bool]:
        return dict(self.inputs)

    def get_all_outputs(self) -> Dict[str, bool]:
        return dict(self.outputs)

    def scan(self) -> ScanResult:
        evaluator = Evaluator(self.inputs, self.outputs)
        self.ast.accept(evaluator)
        self._scan_count += 1
        
        result = ScanResult(
            cycle_number=self._scan_count,
            inputs=dict(self.inputs),
            outputs=dict(self.outputs)
        )
        
        if self._on_scan_complete:
            self._on_scan_complete(result)
        
        return result

    def step(self) -> ScanResult:
        return self.scan()

    def run_continuous(self, cycles: Optional[int] = None, debug_mode: bool = False) -> None:
        self._running = True
        self._paused = False
        self._step_requested = False
        cycle_count = 0
        
        try:
            while self._running:
                if self._paused and not self._step_requested:
                    time.sleep(0.05)
                    continue
                
                if self._step_requested:
                    self._step_requested = False
                
                self.scan()
                cycle_count += 1
                
                if cycles is not None and cycle_count >= cycles:
                    break
                
                time.sleep(self.scan_interval_ms / 1000.0)
        except KeyboardInterrupt:
            pass
        finally:
            self._running = False

    def run_continuous_threaded(self, cycles: Optional[int] = None) -> None:
        if self._scan_thread and self._scan_thread.is_alive():
            return
        
        self._scan_thread = threading.Thread(
            target=self.run_continuous,
            args=(cycles,),
            daemon=True
        )
        self._scan_thread.start()

    def pause(self) -> None:
        self._paused = True

    def resume(self) -> None:
        self._paused = False

    def request_step(self) -> None:
        self._step_requested = True

    def is_paused(self) -> bool:
        return self._paused

    def stop(self) -> None:
        self._running = False
        self._paused = False
        self._step_requested = False

    def is_running(self) -> bool:
        return self._running

    def get_scan_count(self) -> int:
        return self._scan_count

    def set_on_scan_complete(self, callback: Callable[[ScanResult], None]) -> None:
        self._on_scan_complete = callback

    def reset(self) -> None:
        for name in self.inputs:
            self.inputs[name] = False
        for name in self.outputs:
            self.outputs[name] = False
        self._scan_count = 0
        self._running = False
        self._paused = False
        self._step_requested = False
