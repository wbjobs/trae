from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import numpy as np
from scipy import interpolate
from enum import Enum
from .rule_parser import RuleParser, ConfigRule, RuleType
from src.core.models import TagPoint


class CalibrationMethod(Enum):
    LINEAR = "linear"
    POLYNOMIAL = "polynomial"
    SPLINE = "spline"
    MULTIPOINT = "multipoint"


@dataclass
class CalibrationPoint:
    raw_value: float
    expected_value: float
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class CalibrationConfig:
    tag_name: str
    method: CalibrationMethod = CalibrationMethod.LINEAR
    degree: int = 1
    points: List[CalibrationPoint] = field(default_factory=list)
    coefficient: float = 1.0
    offset: float = 0.0


class ParameterEngine:
    def __init__(self):
        self._rule_parser = RuleParser()
        self._calibrations: Dict[str, CalibrationConfig] = {}
        self._tag_history: Dict[str, List[Tuple[datetime, Any]]] = {}
        self._max_history = 1000

    def add_calibration(self, config: CalibrationConfig):
        self._calibrations[config.tag_name] = config
        self._update_calibration_params(config)

    def remove_calibration(self, tag_name: str):
        if tag_name in self._calibrations:
            del self._calibrations[tag_name]

    def add_calibration_point(self, tag_name: str, raw_value: float, expected_value: float):
        if tag_name not in self._calibrations:
            self._calibrations[tag_name] = CalibrationConfig(tag_name=tag_name)
        self._calibrations[tag_name].points.append(CalibrationPoint(raw_value, expected_value))
        self._update_calibration_params(self._calibrations[tag_name])

    def _update_calibration_params(self, config: CalibrationConfig):
        if len(config.points) < 2:
            return
        raw_values = [p.raw_value for p in config.points]
        expected_values = [p.expected_value for p in config.points]
        if config.method == CalibrationMethod.LINEAR:
            coeffs = np.polyfit(raw_values, expected_values, 1)
            config.coefficient = float(coeffs[0])
            config.offset = float(coeffs[1])
        elif config.method == CalibrationMethod.POLYNOMIAL:
            degree = min(config.degree, len(config.points) - 1)
            coeffs = np.polyfit(raw_values, expected_values, degree)
            config.coefficient = float(coeffs[0])
            config.offset = float(coeffs[-1]) if len(coeffs) > 1 else 0.0

    def apply_calibration(self, tag_name: str, raw_value: float) -> float:
        if tag_name not in self._calibrations:
            return raw_value
        config = self._calibrations[tag_name]
        if config.method == CalibrationMethod.LINEAR:
            return raw_value * config.coefficient + config.offset
        elif config.method == CalibrationMethod.SPLINE and len(config.points) >= 3:
            raw_values = sorted([p.raw_value for p in config.points])
            expected_values = sorted([p.expected_value for p in config.points])
            tck = interpolate.splrep(raw_values, expected_values, k=3)
            return float(interpolate.splev(raw_value, tck))
        return raw_value

    def batch_calibrate(self, tag_names: List[str], raw_values: Dict[str, float]) -> Dict[str, float]:
        results = {}
        for tag_name in tag_names:
            if tag_name in raw_values:
                results[tag_name] = self.apply_calibration(tag_name, raw_values[tag_name])
        return results

    def add_rule(self, rule: ConfigRule):
        self._rule_parser.add_rule(rule)

    def remove_rule(self, rule_id: str):
        self._rule_parser.remove_rule(rule_id)

    def validate_rule(self, rule: ConfigRule) -> Tuple[bool, Optional[str]]:
        return self._rule_parser.validate_rule(rule)

    def process_tags(self, tags: Dict[str, TagPoint]) -> Dict[str, Any]:
        tag_values = {name: tag.current_value for name, tag in tags.items()}
        calibrated_values = self.batch_calibrate(list(tags.keys()), tag_values)
        rule_results = self._rule_parser.execute_rules(calibrated_values)
        results = dict(calibrated_values)
        results.update(rule_results)
        for name, value in results.items():
            self._record_history(name, value)
        return results

    def _record_history(self, tag_name: str, value: Any):
        if tag_name not in self._tag_history:
            self._tag_history[tag_name] = []
        self._tag_history[tag_name].append((datetime.now(), value))
        if len(self._tag_history[tag_name]) > self._max_history:
            self._tag_history[tag_name] = self._tag_history[tag_name][-self._max_history:]

    def get_tag_history(self, tag_name: str, start_time: Optional[datetime] = None) -> List[Tuple[datetime, Any]]:
        history = self._tag_history.get(tag_name, [])
        if start_time:
            return [(t, v) for t, v in history if t >= start_time]
        return history

    def validate_parameter(self, tag: TagPoint, value: Any) -> Tuple[bool, Optional[str]]:
        try:
            numeric_value = float(value)
        except (ValueError, TypeError):
            return False, f"Invalid numeric value: {value}"
        if numeric_value < tag.min_value:
            return False, f"Value {numeric_value} below minimum {tag.min_value}"
        if numeric_value > tag.max_value:
            return False, f"Value {numeric_value} above maximum {tag.max_value}"
        return True, None

    def auto_tune_pid(self, tag_name: str, process_values: List[float], setpoints: List[float]) -> Dict[str, float]:
        if len(process_values) < 3 or len(setpoints) < 3:
            return {"kp": 1.0, "ki": 0.0, "kd": 0.0}
        pv = np.array(process_values)
        sp = np.array(setpoints)
        error = sp - pv
        kp = float(np.mean(np.abs(error))) * 0.6
        ki = kp * 0.5 if kp > 0 else 0.1
        kd = kp * 0.1 if kp > 0 else 0.01
        return {"kp": kp, "ki": ki, "kd": kd}
