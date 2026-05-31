import random
import time
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime


class FaultType(Enum):
    COMMUNICATION_TIMEOUT = "communication_timeout"
    DATA_CORRUPTION = "data_corruption"
    VALUE_DRIFT = "value_drift"
    SIGNAL_NOISE = "signal_noise"
    DEVICE_OFFLINE = "device_offline"
    TAG_STUCK = "tag_stuck"
    VALUE_FLUCTUATION = "value_fluctuation"
    ABNORMAL_SPIKE = "abnormal_spike"
    PERIODIC_DISTURBANCE = "periodic_disturbance"
    GRADUAL_DEGRADATION = "gradual_degradation"


class FaultSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class FaultInjection:
    fault_id: str
    fault_type: FaultType
    target_tag: str
    severity: FaultSeverity = FaultSeverity.MEDIUM
    start_time: float = 0.0
    duration: float = 60.0
    parameters: Dict[str, Any] = field(default_factory=dict)
    enabled: bool = True
    description: str = ""


@dataclass
class FaultScenario:
    scenario_id: str
    scenario_name: str
    description: str = ""
    faults: List[FaultInjection] = field(default_factory=list)
    enabled: bool = True
    start_delay: float = 0.0


class FaultSimulator:
    def __init__(self, simulator=None):
        self._simulator = simulator
        self._active_faults: Dict[str, FaultInjection] = {}
        self._active_scenarios: Dict[str, FaultScenario] = {}
        self._fault_timers: Dict[str, threading.Timer] = {}
        self._running = False
        self._monitor_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._fault_callbacks: List[Callable] = []
        self._fault_history: List[Dict[str, Any]] = []
        self._base_values: Dict[str, float] = {}
        self._drift_accumulators: Dict[str, float] = {}
        self._degradation_factors: Dict[str, float] = {}

    def add_fault(self, fault: FaultInjection) -> bool:
        with self._lock:
            if fault.fault_id in self._active_faults:
                return False
            self._active_faults[fault.fault_id] = fault
            self._drift_accumulators[fault.target_tag] = 0.0
            self._degradation_factors[fault.target_tag] = 1.0
            return True

    def remove_fault(self, fault_id: str) -> bool:
        with self._lock:
            if fault_id in self._active_faults:
                self._stop_fault_timer(fault_id)
                del self._active_faults[fault_id]
                if fault_id in self._drift_accumulators:
                    del self._drift_accumulators[fault_id]
                if fault_id in self._degradation_factors:
                    del self._degradation_factors[fault_id]
                return True
            return False

    def add_scenario(self, scenario: FaultScenario) -> bool:
        with self._lock:
            if scenario.scenario_id in self._active_scenarios:
                return False
            self._active_scenarios[scenario.scenario_id] = scenario
            return True

    def remove_scenario(self, scenario_id: str) -> bool:
        with self._lock:
            if scenario_id in self._active_scenarios:
                for fault in self._active_scenarios[scenario_id].faults:
                    self.remove_fault(fault.fault_id)
                del self._active_scenarios[scenario_id]
                return True
            return False

    def start_scenario(self, scenario_id: str) -> bool:
        if scenario_id not in self._active_scenarios:
            return False
        scenario = self._active_scenarios[scenario_id]
        for fault in scenario.faults:
            self._schedule_fault(fault, scenario.start_delay)
        return True

    def stop_scenario(self, scenario_id: str) -> bool:
        if scenario_id not in self._active_scenarios:
            return False
        scenario = self._active_scenarios[scenario_id]
        for fault in scenario.faults:
            self.remove_fault(fault.fault_id)
        return True

    def _schedule_fault(self, fault: FaultInjection, delay: float):
        def activate():
            self.add_fault(fault)
            self._record_fault_event(fault, "activated")
            if fault.duration > 0:
                def deactivate():
                    self.remove_fault(fault.fault_id)
                    self._record_fault_event(fault, "deactivated")
                timer = threading.Timer(fault.duration, deactivate)
                timer.start()
                self._fault_timers[fault.fault_id] = timer

        if delay > 0:
            timer = threading.Timer(delay, activate)
            timer.start()
        else:
            activate()

    def _stop_fault_timer(self, fault_id: str):
        if fault_id in self._fault_timers:
            try:
                self._fault_timers[fault_id].cancel()
            except:
                pass
            del self._fault_timers[fault_id]

    def apply_faults(self, tag_name: str, original_value: Any, simulation_time: float) -> Any:
        try:
            numeric_value = float(original_value)
        except (ValueError, TypeError):
            return original_value

        modified_value = numeric_value
        affected = False

        with self._lock:
            for fault in self._active_faults.values():
                if not fault.enabled:
                    continue
                if fault.target_tag != tag_name and fault.target_tag != "*":
                    continue

                affected = True
                modified_value = self._apply_fault_effect(
                    fault, modified_value, simulation_time
                )

        if affected:
            self._record_fault_application(tag_name, original_value, modified_value)

        return modified_value

    def _apply_fault_effect(self, fault: FaultInjection, value: float, simulation_time: float) -> float:
        severity_factor = {
            FaultSeverity.LOW: 0.1,
            FaultSeverity.MEDIUM: 0.3,
            FaultSeverity.HIGH: 0.6,
            FaultSeverity.CRITICAL: 1.0
        }.get(fault.severity, 0.3)

        if fault.fault_type == FaultType.VALUE_DRIFT:
            drift_rate = fault.parameters.get('drift_rate', 0.1) * severity_factor
            self._drift_accumulators[fault.target_tag] += drift_rate
            return value + self._drift_accumulators[fault.target_tag]

        elif fault.fault_type == FaultType.SIGNAL_NOISE:
            noise_level = fault.parameters.get('noise_level', 5.0) * severity_factor
            noise = random.uniform(-noise_level, noise_level)
            return value + noise

        elif fault.fault_type == FaultType.ABNORMAL_SPIKE:
            spike_probability = fault.parameters.get('probability', 0.05) * severity_factor
            spike_magnitude = fault.parameters.get('magnitude', 50.0) * severity_factor
            if random.random() < spike_probability:
                direction = random.choice([-1, 1])
                return value + direction * spike_magnitude
            return value

        elif fault.fault_type == FaultType.VALUE_FLUCTUATION:
            amplitude = fault.parameters.get('amplitude', 10.0) * severity_factor
            frequency = fault.parameters.get('frequency', 0.1)
            phase = fault.parameters.get('phase', 0.0)
            import math
            return value + amplitude * math.sin(2 * math.pi * frequency * simulation_time + phase)

        elif fault.fault_type == FaultType.PERIODIC_DISTURBANCE:
            period = fault.parameters.get('period', 10.0)
            amplitude = fault.parameters.get('amplitude', 15.0) * severity_factor
            import math
            cycle_pos = (simulation_time % period) / period
            if cycle_pos < 0.5:
                return value + amplitude * math.sin(2 * math.pi * cycle_pos)
            return value

        elif fault.fault_type == FaultType.DATA_CORRUPTION:
            corruption_probability = fault.parameters.get('probability', 0.1) * severity_factor
            if random.random() < corruption_probability:
                corruption_factor = random.uniform(0.5, 2.0)
                return value * corruption_factor
            return value

        elif fault.fault_type == FaultType.GRADUAL_DEGRADATION:
            degradation_rate = fault.parameters.get('degradation_rate', 0.01) * severity_factor
            self._degradation_factors[fault.target_tag] *= (1 - degradation_rate)
            return value * self._degradation_factors[fault.target_tag]

        elif fault.fault_type == FaultType.TAG_STUCK:
            if fault.target_tag not in self._base_values:
                self._base_values[fault.target_tag] = value
            return self._base_values[fault.target_tag]

        elif fault.fault_type == FaultType.COMMUNICATION_TIMEOUT:
            timeout_probability = fault.parameters.get('probability', 0.2) * severity_factor
            if random.random() < timeout_probability:
                return None
            return value

        return value

    def _record_fault_event(self, fault: FaultInjection, action: str):
        event = {
            "timestamp": datetime.now().isoformat(),
            "fault_id": fault.fault_id,
            "fault_type": fault.fault_type.value,
            "target_tag": fault.target_tag,
            "action": action,
            "severity": fault.severity.value
        }
        self._fault_history.append(event)
        for callback in self._fault_callbacks:
            try:
                callback(event)
            except Exception as e:
                print(f"Fault callback error: {e}")

    def _record_fault_application(self, tag_name: str, original: Any, modified: Any):
        if len(self._fault_history) > 10000:
            self._fault_history = self._fault_history[-5000:]

    def start(self):
        if self._running:
            return
        self._running = True
        self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._monitor_thread.start()

    def stop(self):
        self._running = False
        if self._monitor_thread:
            self._monitor_thread.join(timeout=2)
            self._monitor_thread = None
        for fault_id in list(self._fault_timers.keys()):
            self._stop_fault_timer(fault_id)

    def _monitor_loop(self):
        while self._running:
            try:
                time.sleep(0.1)
            except Exception as e:
                print(f"Fault monitor error: {e}")

    def get_active_faults(self) -> List[FaultInjection]:
        with self._lock:
            return list(self._active_faults.values())

    def get_active_scenarios(self) -> List[FaultScenario]:
        with self._lock:
            return list(self._active_scenarios.values())

    def get_fault_history(self) -> List[Dict[str, Any]]:
        return list(self._fault_history)

    def clear_fault_history(self):
        self._fault_history.clear()

    def clear_all_faults(self):
        with self._lock:
            for fault_id in list(self._active_faults.keys()):
                self.remove_fault(fault_id)
            self._active_faults.clear()
            self._base_values.clear()
            self._drift_accumulators.clear()
            self._degradation_factors.clear()

    def add_fault_callback(self, callback: Callable):
        self._fault_callbacks.append(callback)

    def remove_fault_callback(self, callback: Callable):
        if callback in self._fault_callbacks:
            self._fault_callbacks.remove(callback)

    def create_standard_scenario(self, scenario_type: str) -> FaultScenario:
        import uuid
        scenarios = {
            "sensor_drift": FaultScenario(
                scenario_id=str(uuid.uuid4()),
                scenario_name="传感器漂移故障",
                description="模拟温度传感器缓慢漂移",
                faults=[
                    FaultInjection(
                        fault_id=str(uuid.uuid4()),
                        fault_type=FaultType.VALUE_DRIFT,
                        target_tag="AI_TEMP_01",
                        severity=FaultSeverity.MEDIUM,
                        duration=120,
                        parameters={"drift_rate": 0.5},
                        description="温度传感器漂移"
                    )
                ]
            ),
            "communication_intermittent": FaultScenario(
                scenario_id=str(uuid.uuid4()),
                scenario_name="间歇性通信故障",
                description="模拟网络不稳定导致的通信中断",
                faults=[
                    FaultInjection(
                        fault_id=str(uuid.uuid4()),
                        fault_type=FaultType.COMMUNICATION_TIMEOUT,
                        target_tag="*",
                        severity=FaultSeverity.HIGH,
                        duration=60,
                        parameters={"probability": 0.3},
                        description="间歇性通信超时"
                    )
                ]
            ),
            "signal_noise": FaultScenario(
                scenario_id=str(uuid.uuid4()),
                scenario_name="信号干扰",
                description="模拟电磁干扰导致的信号噪声",
                faults=[
                    FaultInjection(
                        fault_id=str(uuid.uuid4()),
                        fault_type=FaultType.SIGNAL_NOISE,
                        target_tag="AI_PRESS_01",
                        severity=FaultSeverity.MEDIUM,
                        duration=180,
                        parameters={"noise_level": 3.0},
                        description="压力信号干扰"
                    )
                ]
            ),
            "abnormal_spike": FaultScenario(
                scenario_id=str(uuid.uuid4()),
                scenario_name="异常尖峰",
                description="模拟传感器异常尖峰信号",
                faults=[
                    FaultInjection(
                        fault_id=str(uuid.uuid4()),
                        fault_type=FaultType.ABNORMAL_SPIKE,
                        target_tag="AI_FLOW_01",
                        severity=FaultSeverity.HIGH,
                        duration=90,
                        parameters={"probability": 0.1, "magnitude": 80.0},
                        description="流量信号异常尖峰"
                    )
                ]
            ),
            "system_degradation": FaultScenario(
                scenario_id=str(uuid.uuid4()),
                scenario_name="系统性能衰减",
                description="模拟设备老化导致的性能衰减",
                faults=[
                    FaultInjection(
                        fault_id=str(uuid.uuid4()),
                        fault_type=FaultType.GRADUAL_DEGRADATION,
                        target_tag="AO_FLOW_01",
                        severity=FaultSeverity.LOW,
                        duration=300,
                        parameters={"degradation_rate": 0.005},
                        description="阀门执行器衰减"
                    )
                ]
            ),
            "comprehensive_fault": FaultScenario(
                scenario_id=str(uuid.uuid4()),
                scenario_name="综合故障场景",
                description="包含多种故障类型的综合测试场景",
                faults=[
                    FaultInjection(
                        fault_id=str(uuid.uuid4()),
                        fault_type=FaultType.SIGNAL_NOISE,
                        target_tag="AI_TEMP_01",
                        severity=FaultSeverity.LOW,
                        duration=0,
                        parameters={"noise_level": 2.0},
                        description="温度信号噪声"
                    ),
                    FaultInjection(
                        fault_id=str(uuid.uuid4()),
                        fault_type=FaultType.PERIODIC_DISTURBANCE,
                        target_tag="AI_PRESS_01",
                        severity=FaultSeverity.MEDIUM,
                        duration=0,
                        parameters={"period": 15.0, "amplitude": 8.0},
                        description="压力周期性波动"
                    ),
                    FaultInjection(
                        fault_id=str(uuid.uuid4()),
                        fault_type=FaultType.VALUE_DRIFT,
                        target_tag="AI_LEVEL_01",
                        severity=FaultSeverity.LOW,
                        duration=0,
                        parameters={"drift_rate": 0.2},
                        description="液位缓慢漂移"
                    )
                ]
            )
        }
        return scenarios.get(scenario_type, scenarios["comprehensive_fault"])

    def get_available_scenarios(self) -> List[str]:
        return [
            "sensor_drift",
            "communication_intermittent",
            "signal_noise",
            "abnormal_spike",
            "system_degradation",
            "comprehensive_fault"
        ]
