from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from collections import defaultdict
import math
import statistics
from dataclasses import dataclass, field


@dataclass
class FieldTrend:
    field_name: str
    presence_rates: List[float] = field(default_factory=list)
    timestamps: List[datetime] = field(default_factory=list)
    trend_slope: float = 0.0
    predicted_rates: List[float] = field(default_factory=list)
    predicted_timestamps: List[datetime] = field(default_factory=list)
    confidence: float = 0.0
    prediction: str = "stable"


@dataclass
class PredictedChange:
    predicted_time: datetime
    change_type: str
    field_name: str
    predicted_value: str
    confidence: float
    severity: str
    rationale: str
    recommendation: str


@dataclass
class CompatibilityAdvice:
    category: str
    field_name: str
    current_state: str
    recommendation: str
    priority: str
    code_snippet: str


class EvolutionPredictor:
    def __init__(self):
        self.field_trends: Dict[str, Dict[str, FieldTrend]] = defaultdict(dict)
        self.change_history: List[Dict[str, Any]] = []
        self.schema_versions: List[Dict[str, Any]] = []
        self.window_size_days: int = 30
        self.prediction_horizon_days: int = 7

    def ingest_change_events(self, events: List[Dict[str, Any]]):
        self.change_history.extend(events)
        self.change_history.sort(key=lambda x: x.get('event_time', datetime.min))

    def ingest_schema_versions(self, versions: List[Dict[str, Any]]):
        self.schema_versions.extend(versions)
        self.schema_versions.sort(key=lambda x: x.get('version_time', datetime.min))

    def ingest_field_presence_data(self, format_type: str,
                                     field_name: str,
                                     timestamps: List[datetime],
                                     presence_rates: List[float]):
        if format_type not in self.field_trends:
            self.field_trends[format_type] = {}

        if field_name not in self.field_trends[format_type]:
            self.field_trends[format_type][field_name] = FieldTrend(
                field_name=field_name,
                timestamps=[],
                presence_rates=[]
            )

        trend = self.field_trends[format_type][field_name]
        for ts, rate in zip(timestamps, presence_rates):
            trend.timestamps.append(ts)
            trend.presence_rates.append(rate)

    def _calculate_trend_slope(self, values: List[float]) -> float:
        if len(values) < 2:
            return 0.0

        n = len(values)
        x_mean = (n - 1) / 2.0
        y_mean = sum(values) / n

        numerator = 0.0
        denominator = 0.0
        for i, value in enumerate(values):
            numerator += (i - x_mean) * (value - y_mean)
            denominator += (i - x_mean) ** 2

        if denominator == 0:
            return 0.0

        return numerator / denominator

    def _exponential_smoothing(self, values: List[float],
                                   alpha: float = 0.3) -> float:
        if not values:
            return 0.0
        if len(values) == 1:
            return values[0]

        smoothed = values[0]
        for value in values[1:]:
            smoothed = alpha * value + (1 - alpha) * smoothed
        return smoothed

    def _predict_next_values(self, values: List[float],
                                num_predictions: int,
                                alpha: float = 0.3) -> List[float]:
        if not values:
            return [0.0] * num_predictions
        if len(values) < 2:
            return [values[-1]] * num_predictions

        predictions = []
        last_smoothed = values[0]
        for value in values:
            last_smoothed = alpha * value + (1 - alpha) * last_smoothed

        slope = self._calculate_trend_slope(values)

        for i in range(num_predictions):
            prediction = last_smoothed + (i + 1) * slope
            prediction = max(0.0, min(1.0, prediction))
            predictions.append(prediction)

        return predictions

    def _estimate_change_cadence(self) -> Optional[float]:
        if len(self.change_history) < 2:
            return None

        times = []
        for event in self.change_history:
            event_time = event.get('event_time')
            if isinstance(event_time, datetime):
                times.append(event_time)

        if len(times) < 2:
            return None

        times.sort()
        intervals = []
        for i in range(1, len(times)):
            interval = (times[i] - times[i - 1]).total_seconds() / 3600
            if interval > 0:
                intervals.append(interval)

        if not intervals:
            return None

        return statistics.mean(intervals)

    def _detect_acceleration(self) -> str:
        if len(self.change_history) < 4:
            return "stable"

        mid = len(self.change_history) // 2
        first_half = self.change_history[:mid]
        second_half = self.change_history[mid:]

        first_rate = len(first_half)
        second_rate = len(second_half)

        if first_rate == 0:
            return "accelerating"

        ratio = second_rate / first_rate
        if ratio > 1.5:
            return "accelerating"
        elif ratio < 0.7:
            return "decelerating"
        return "stable"

    def _analyze_field_trends(self, format_type: str) -> List[FieldTrend]:
        if format_type not in self.field_trends:
            return []

        trends = []

        for field_name, trend in self.field_trends[format_type].items():
            if len(trend.presence_rates) >= 3:
                trend.trend_slope = self._calculate_trend_slope(trend.presence_rates)

                future_timestamps = []
                last_ts = trend.timestamps[-1] if trend.timestamps else datetime.now()
                for i in range(self.prediction_horizon_days):
                    future_timestamps.append(last_ts + timedelta(days=i + 1))

                trend.predicted_timestamps = future_timestamps
                trend.predicted_rates = self._predict_next_values(
                    trend.presence_rates,
                    self.prediction_horizon_days
                )

                if trend.trend_slope > 0.02:
                    trend.prediction = "increasing"
                elif trend.trend_slope < -0.02:
                    trend.prediction = "decreasing"
                else:
                    trend.prediction = "stable"

                abs_slope = abs(trend.trend_slope)
                if abs_slope > 0.1:
                    trend.confidence = 0.9
                elif abs_slope > 0.05:
                    trend.confidence = 0.7
                elif abs_slope > 0.02:
                    trend.confidence = 0.5
                else:
                    trend.confidence = 0.3

                trends.append(trend)

        return trends

    def predict_changes(self, format_type: str = "unknown") -> Dict[str, Any]:
        predictions: List[PredictedChange] = []
        now = datetime.now()

        field_trends = self._analyze_field_trends(format_type)

        for trend in field_trends:
            if trend.prediction == "decreasing" and trend.confidence >= 0.5:
                final_rate = trend.predicted_rates[-1] if trend.predicted_rates else 0.0

                if final_rate < 0.3 and trend.trend_slope < -0.05:
                    predicted_time = now + timedelta(days=self.prediction_horizon_days)

                    predictions.append(PredictedChange(
                        predicted_time=predicted_time,
                        change_type="field_removal_predicted",
                        field_name=trend.field_name,
                        predicted_value="likely_removed",
                        confidence=trend.confidence,
                        severity="warning" if trend.confidence >= 0.7 else "info",
                        rationale=f"Field '{trend.field_name}' presence rate "
                                  f"trending downwards (slope: {trend.trend_slope:.4f}), "
                                  f"predicted to reach {final_rate*100:.1f}% in {self.prediction_horizon_days} days",
                        recommendation="Consider making this field optional in schema"
                    ))

            elif trend.prediction == "increasing" and trend.confidence >= 0.5:
                final_rate = trend.predicted_rates[-1] if trend.predicted_rates else 0.0

                if final_rate > 0.7 and trend.trend_slope > 0.05:
                    predicted_time = now + timedelta(days=self.prediction_horizon_days)

                    predictions.append(PredictedChange(
                        predicted_time=predicted_time,
                        change_type="new_field_predicted",
                        field_name=trend.field_name,
                        predicted_value="likely_new_or_becoming_required",
                        confidence=trend.confidence,
                        severity="info",
                        rationale=f"Field '{trend.field_name}' presence rate "
                                  f"trending upwards (slope: {trend.trend_slope:.4f}), "
                                  f"predicted to reach {final_rate*100:.1f}% in {self.prediction_horizon_days} days",
                        recommendation="Prepare to add this field to schema as optional"
                    ))

        cadence = self._estimate_change_cadence()
        if cadence and len(self.change_history) >= 2:
            last_change = self.change_history[-1]
            last_time = last_change.get('event_time', now)
            if isinstance(last_time, datetime):
                next_predicted = last_time + timedelta(hours=cadence)
                if next_predicted <= now + timedelta(days=self.prediction_horizon_days):
                    predictions.append(PredictedChange(
                        predicted_time=next_predicted,
                        change_type="schema_evolution_predicted",
                        field_name="schema",
                        predicted_value="next_schema_change_expected",
                        confidence=0.6,
                        severity="info",
                        rationale=f"Average change interval: {cadence:.1f} hours, "
                                  f"last change at {last_time.isoformat()}",
                        recommendation="Review schema compatibility layer for upcoming changes"
                    ))

        acceleration = self._detect_acceleration()
        if acceleration == "accelerating":
            predictions.append(PredictedChange(
                predicted_time=now + timedelta(days=self.prediction_horizon_days),
                change_type="change_frequency_predicted",
                field_name="schema",
                predicted_value="changes_accelerating",
                confidence=0.7,
                severity="warning",
                rationale="Schema changes are occurring more frequently",
                recommendation="Strengthen schema versioning and backward compatibility"
            ))

        field_type_distribution: Dict[str, int] = defaultdict(int)
        recent_changes = self.change_history[-20:] if len(self.change_history) > 20 else self.change_history
        for event in recent_changes:
            ct = event.get('change_type', 'unknown')
            field_type_distribution[ct] += 1

        if field_type_distribution:
                most_common = max(field_type_distribution, key=field_type_distribution.get)
                count = field_type_distribution[most_common]
                total = sum(field_type_distribution.values())
                if total > 0 and count / total > 0.5:
                    predictions.append(PredictedChange(
                        predicted_time=now + timedelta(days=self.prediction_horizon_days),
                        change_type=f"recurring_pattern_predicted",
                        field_name="schema",
                        predicted_value=most_common,
                        confidence=0.5,
                        severity="info",
                        rationale=f"'{most_common}' accounts for {count}/{total} recent changes",
                        recommendation="Focus compatibility efforts on this change type"
                    ))

        return {
            'format_type': format_type,
            'prediction_time': now.isoformat(),
            'prediction_horizon_days': self.prediction_horizon_days,
            'predicted_changes': [
                {
                    'predicted_time': pc.predicted_time.isoformat(),
                    'change_type': pc.change_type,
                    'field_name': pc.field_name,
                    'predicted_value': pc.predicted_value,
                    'confidence': pc.confidence,
                    'severity': pc.severity,
                    'rationale': pc.rationale,
                    'recommendation': pc.recommendation
                }
                for pc in predictions
            ],
            'change_cadence_hours': cadence,
            'change_acceleration': acceleration,
            'total_predictions': len(predictions),
            'field_trends': [
                {
                    'field_name': t.field_name,
                    'trend_slope': t.trend_slope,
                    'prediction': t.prediction,
                    'confidence': t.confidence,
                    'current_rate': t.presence_rates[-1] if t.presence_rates else 0.0,
                    'predicted_rate': t.predicted_rates[-1] if t.predicted_rates else 0.0
                }
                for t in field_trends
            ]
        }

    def generate_compatibility_advice(self, format_type: str = "unknown") -> List[CompatibilityAdvice]:
        advice: List[CompatibilityAdvice] = []
        now = datetime.now()

        if format_type not in self.field_trends:
            return advice

        field_trends = self._analyze_field_trends(format_type)

        for trend in field_trends:
            current_rate = trend.presence_rates[-1] if trend.presence_rates else 0.0
            predicted_rate = trend.predicted_rates[-1] if trend.predicted_rates else current_rate

            if trend.prediction == "decreasing" and trend.confidence >= 0.5:
                if current_rate < 0.5:
                    advice.append(CompatibilityAdvice(
                        category="field_optional",
                        field_name=trend.field_name,
                        current_state=f"Presence rate: {current_rate*100:.1f}%, trending down",
                        recommendation="Make this field optional and provide default values",
                        priority="high" if current_rate < 0.3 else "medium",
                        code_snippet=f"# In your schema definition\n"
                                      f"# Before: {trend.field_name}: {trend.field_name} type Required\n"
                                      f"# After:  {trend.field_name}: Optional[{trend.field_name}] = None"
                    ))

            if trend.prediction == "increasing" and trend.confidence >= 0.5:
                if predicted_rate > 0.7:
                    advice.append(CompatibilityAdvice(
                        category="field_promotion",
                        field_name=trend.field_name,
                        current_state=f"Presence rate: {current_rate*100:.1f}%, trending up",
                        recommendation="Promote this field from optional to required after monitoring",
                        priority="medium",
                        code_snippet=f"# Monitor this field for 2 more weeks\n"
                                      f"# If trend continues, promote to required"
                    ))

        recent_changes = self.change_history[-10:] if len(self.change_history) > 10 else self.change_history
        change_types = set(c.get('change_type', '') for c in recent_changes)

        if 'type_changed' in change_types:
            advice.append(CompatibilityAdvice(
                    category="type_union",
                    field_name="multiple",
                    current_state="Field type changes detected recently",
                    recommendation="Use union types for fields that change type",
                    priority="high",
                    code_snippet="field_name: Union[int, str, None]  # Allow multiple types"
                ))

        if 'enum_added' in change_types or 'enum_removed' in change_types:
            advice.append(CompatibilityAdvice(
                    category="enum_flexible",
                    field_name="enum_fields",
                    current_state="Enum values are changing",
                    recommendation="Make enum validation non-strict or use pattern matching",
                    priority="medium",
                    code_snippet="if status not in KNOWN_STATUSES:\n"
                                  "    handle_unknown_status(status)"
                ))

        if any(c.get('change_type') in ('field_added', 'field_removed') for c in recent_changes):
            advice.append(CompatibilityAdvice(
                    category="forward_compat",
                    field_name="schema",
                    current_state="Fields being added or removed",
                    recommendation="Implement forward/backward compatibility layer",
                    priority="high",
                    code_snippet="def parse_log(data: Dict) -> ParsedLog:\n"
                                  "    result = {}\n"
                                  "    for field in CURRENT_FIELDS:\n"
                                  "        if field in data:\n"
                                  "            result[field] = data[field]\n"
                                  "        else:\n"
                                  "            result[field] = DEFAULTS.get(field)\n"
                                  "    return result"
                ))

        version_count = len(self.schema_versions)
        if version_count >= 3:
            advice.append(CompatibilityAdvice(
                    category="versioning",
                    field_name="schema",
                    current_state=f"{version_count} schema versions detected",
                    recommendation="Implement schema versioning with migration paths",
                    priority="high" if version_count >= 5 else "medium",
                    code_snippet="SCHEMA_VERSIONS = {\n"
                                  "    1: parse_v1,\n"
                                  "    2: parse_v2,\n"
                                  "    3: parse_v3,\n"
                                  "}\n\n"
                                  "def get_parser(version: int):\n"
                                  "    return SCHEMA_VERSIONS.get(version, parse_latest)"
                ))

        cadence = self._estimate_change_cadence()
        if cadence and cadence < 168:
            advice.append(CompatibilityAdvice(
                    category="monitoring",
                    field_name="schema",
                    current_state=f"Changes every {cadence:.1f} hours",
                    recommendation="Increase monitoring frequency and alert thresholds",
                    priority="medium",
                    code_snippet="# Set up automated alerts\n"
                                  "ALERT_THRESHOLD = {\n"
                                  "    'field_change_rate': 0.1,  # 10% change rate\n"
                                  "    'check_interval': 3600,  # Check every hour\n"
                                  "}"
                ))

        return [
            {
                'category': a.category,
                'field_name': a.field_name,
                'current_state': a.current_state,
                'recommendation': a.recommendation,
                'priority': a.priority,
                'code_snippet': a.code_snippet
            }
            for a in advice
        ]

    def get_prediction_summary(self, format_type: str = "unknown") -> Dict[str, Any]:
        predictions = self.predict_changes(format_type)
        advice = self.generate_compatibility_advice(format_type)

        high_priority_advice = [a for a in advice if a.get('priority') == 'high']
        medium_priority_advice = [a for a in advice if a.get('priority') == 'medium']

        risks = []
        for pc in predictions.get('predicted_changes', []):
            if pc.get('severity') == 'warning':
                risks.append(pc)

        return {
            'format_type': format_type,
            'generated_at': datetime.now().isoformat(),
            'prediction_horizon_days': self.prediction_horizon_days,
            'overall_risk_level': 'high' if len(risks) >= 3 else ('medium' if len(risks) >= 1 else 'low',
            'total_predictions': predictions.get('total_predictions', 0),
            'high_risk_predictions': len(risks),
            'high_priority_advice_count': len(high_priority_advice),
            'medium_priority_advice_count': len(medium_priority_advice),
            'change_cadence_hours': predictions.get('change_cadence_hours'),
            'change_acceleration': predictions.get('change_acceleration'),
            'key_risks': risks,
            'recommended_actions': [
                a for a in advice
                if a.get('priority') in ('high', 'medium')
            ],
            'full_predictions': predictions,
            'full_advice': advice
        }
