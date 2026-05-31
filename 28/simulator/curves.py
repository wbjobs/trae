import math
import time
from abc import ABC, abstractmethod
from typing import Any, List, Dict


class BaseCurve(ABC):
    @abstractmethod
    def get_value(self, timestamp: float) -> Any:
        pass


class SineCurve(BaseCurve):
    def __init__(self, amplitude: float, offset: float, period: float):
        self.amplitude = amplitude
        self.offset = offset
        self.period = period

    def get_value(self, timestamp: float) -> float:
        return self.offset + self.amplitude * math.sin(2 * math.pi * timestamp / self.period)


class StepCurve(BaseCurve):
    def __init__(self, steps: List[Dict]):
        self.steps = steps
        self.cycle_duration = sum(step["duration"] for step in steps)

    def get_value(self, timestamp: float) -> Any:
        if self.cycle_duration == 0:
            return self.steps[0]["value"]

        position = timestamp % self.cycle_duration
        elapsed = 0
        for step in self.steps:
            elapsed += step["duration"]
            if position < elapsed:
                return step["value"]
        return self.steps[-1]["value"]


class CurveFactory:
    @staticmethod
    def create(curve_config: Dict) -> BaseCurve:
        curve_type = curve_config.get("type", "").lower()
        if curve_type == "sine":
            return SineCurve(
                amplitude=curve_config.get("amplitude", 1.0),
                offset=curve_config.get("offset", 0.0),
                period=curve_config.get("period", 10.0),
            )
        elif curve_type == "step":
            return StepCurve(steps=curve_config.get("steps", []))
        else:
            raise ValueError(f"Unknown curve type: {curve_type}")
