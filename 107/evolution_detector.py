from typing import Dict, List, Any, Optional, Set, Tuple
from datetime import datetime, timedelta
from collections import defaultdict
import hashlib
import json


FIELD_ADD_THRESHOLD = 0.01
FIELD_REMOVE_THRESHOLD = 0.01
TYPE_CHANGE_THRESHOLD = 0.05
ENUM_ADD_THRESHOLD = 0.02
RENAME_SIMILARITY_THRESHOLD = 0.7


class SchemaSignature:
    def __init__(self, format_type: str = "unknown"):
        self.format_type = format_type
        self.fields: Dict[str, str] = {}
        self.field_order: List[str] = []
        self.enum_values: Dict[str, Set[str]] = defaultdict(set)
        self.field_counts: Dict[str, int] = defaultdict(int)
        self.field_sample_values: Dict[str, List[str]] = defaultdict(list)
        self.total_samples: int = 0
        self.null_counts: Dict[str, int] = defaultdict(int)

    def add_sample(self, fields: Dict[str, Any], field_types: Dict[str, str]):
        self.total_samples += 1

        for field_name in fields.keys():
            if field_name not in self.field_order:
                self.field_order.append(field_name)

        for field_name, field_value in fields.items():
            self.field_counts[field_name] += 1
            self.fields[field_name] = field_types.get(field_name, 'string')

            if field_value is None or (isinstance(field_value, str) and field_value == ''):
                self.null_counts[field_name] += 1
            else:
                if len(self.field_sample_values[field_name]) < 20:
                    self.field_sample_values[field_name].append(str(field_value))

            if field_name in ['status', 'request_method', 'server_protocol', 'http_referer']:
                if field_value:
                    self.enum_values[field_name].add(str(field_value))

    def get_field_presence_rate(self, field_name: str) -> float:
        if self.total_samples == 0:
            return 0.0
        return self.field_counts.get(field_name, 0) / self.total_samples

    def get_null_rate(self, field_name: str) -> float:
        count = self.field_counts.get(field_name, 0)
        if count == 0:
            return 0.0
        return self.null_counts.get(field_name, 0) / count

    def is_field_set_equivalent(self, other: 'SchemaSignature') -> bool:
        current_field_types = {k: v for k, v in self.fields.items()}
        other_field_types = {k: v for k, v in other.fields.items()}
        return current_field_types == other_field_types

    def get_field_order_diff(self, other: 'SchemaSignature') -> Tuple[List[str], List[str]]:
        current_order = [f for f in self.field_order if f in self.fields]
        other_order = [f for f in other.field_order if f in other.fields]

        common_fields = set(current_order) & set(other_order)

        current_common = [f for f in current_order if f in common_fields]
        other_common = [f for f in other_order if f in common_fields]

        return current_common, other_common

    def compute_field_similarity(self, field1: str, sig1: 'SchemaSignature',
                                  field2: str, sig2: 'SchemaSignature') -> float:
        type1 = sig1.fields.get(field1, '')
        type2 = sig2.fields.get(field2, '')

        if type1 != type2:
            return 0.0

        values1 = set(sig1.field_sample_values.get(field1, []))
        values2 = set(sig2.field_sample_values.get(field2, []))

        if not values1 or not values2:
            return 0.5

        intersection = values1 & values2
        union = values1 | values2

        if not union:
            return 0.5

        jaccard = len(intersection) / len(union)

        null_rate1 = sig1.get_null_rate(field1)
        null_rate2 = sig2.get_null_rate(field2)
        null_rate_sim = 1.0 - abs(null_rate1 - null_rate2)

        presence1 = sig1.get_field_presence_rate(field1)
        presence2 = sig2.get_field_presence_rate(field2)
        presence_sim = 1.0 - abs(presence1 - presence2)

        return 0.5 * jaccard + 0.25 * null_rate_sim + 0.25 * presence_sim

    def to_dict(self) -> Dict[str, Any]:
        return {
            'format_type': self.format_type,
            'fields': dict(self.fields),
            'field_order': list(self.field_order),
            'enum_values': {k: list(v) for k, v in self.enum_values.items()},
            'total_samples': self.total_samples,
            'field_counts': dict(self.field_counts),
            'null_counts': dict(self.null_counts),
            'field_sample_values': dict(self.field_sample_values)
        }

    def compute_hash(self) -> str:
        sorted_fields = sorted(self.fields.items())
        hash_input = json.dumps(sorted_fields, sort_keys=True)
        return hashlib.md5(hash_input.encode()).hexdigest()


class EvolutionChange:
    def __init__(self, change_type: str, field_name: str,
                 old_value: str, new_value: str,
                 affected_samples: int, details: str = "",
                 severity: str = "info"):
        self.change_type = change_type
        self.field_name = field_name
        self.old_value = old_value
        self.new_value = new_value
        self.affected_samples = affected_samples
        self.details = details
        self.severity = severity
        self.timestamp = datetime.now()

    def to_dict(self) -> Dict[str, Any]:
        return {
            'change_type': self.change_type,
            'field_name': self.field_name,
            'old_value': self.old_value,
            'new_value': self.new_value,
            'affected_samples': self.affected_samples,
            'details': self.details,
            'severity': self.severity,
            'timestamp': self.timestamp.isoformat()
        }


class PatternEvolutionDetector:
    def __init__(self):
        self.current_signatures: Dict[str, SchemaSignature] = {}
        self.previous_signatures: Dict[str, SchemaSignature] = {}
        self.change_history: List[EvolutionChange] = []
        self.schema_versions: List[Dict[str, Any]] = []
        self.version_counters: Dict[str, int] = defaultdict(int)

    def process_batch(self, parsed_logs: List, format_type: str = "unknown"):
        if format_type not in self.current_signatures:
            self.current_signatures[format_type] = SchemaSignature(format_type)

        signature = self.current_signatures[format_type]

        for parsed_log in parsed_logs:
            if not parsed_log.parse_success:
                continue

            field_types = {}
            for key, value in parsed_log.fields.items():
                if value is None:
                    field_types[key] = 'null'
                elif isinstance(value, bool):
                    field_types[key] = 'bool'
                elif isinstance(value, int):
                    field_types[key] = 'int'
                elif isinstance(value, float):
                    field_types[key] = 'float'
                elif isinstance(value, str):
                    field_types[key] = 'string'
                elif isinstance(value, dict):
                    field_types[key] = 'object'
                elif isinstance(value, list):
                    field_types[key] = 'array'
                else:
                    field_types[key] = type(value).__name__

            signature.add_sample(parsed_log.fields, field_types)

    def detect_changes(self, format_type: str = "unknown") -> List[EvolutionChange]:
        if format_type not in self.current_signatures:
            return []

        current = self.current_signatures[format_type]
        previous = self.previous_signatures.get(format_type)

        if previous is None or previous.total_samples == 0:
            self.previous_signatures[format_type] = self._copy_signature(current)
            self._create_version(format_type, current)
            return []

        changes = []

        if current.is_field_set_equivalent(previous):
            current_order, prev_order = current.get_field_order_diff(previous)
            if current_order != prev_order:
                changes.append(EvolutionChange(
                    change_type='field_reordered',
                    field_name='schema',
                    old_value=' → '.join(prev_order),
                    new_value=' → '.join(current_order),
                    affected_samples=current.total_samples,
                    details=f"Field order changed, but field set remains identical. "
                            f"Previous order: {prev_order}, Current order: {current_order}",
                    severity='low'
                ))
                self.change_history.extend(changes)
                self.previous_signatures[format_type] = self._copy_signature(current)
                self._create_version(format_type, current)
                return changes

        new_fields = set(current.fields.keys()) - set(previous.fields.keys())
        removed_fields = set(previous.fields.keys()) - set(current.fields.keys())

        potential_renames = []
        if new_fields and removed_fields:
            for new_field in list(new_fields):
                best_match = None
                best_similarity = 0.0

                for removed_field in list(removed_fields):
                    similarity = current.compute_field_similarity(
                        new_field, current, removed_field, previous
                    )
                    if similarity > best_similarity:
                        best_similarity = similarity
                        best_match = removed_field

                if best_similarity >= RENAME_SIMILARITY_THRESHOLD and best_match:
                    potential_renames.append((best_match, new_field, best_similarity))
                    new_fields.discard(new_field)
                    removed_fields.discard(best_match)

        for old_field, new_field, similarity in potential_renames:
            changes.append(EvolutionChange(
                change_type='field_renamed',
                field_name=new_field,
                old_value=old_field,
                new_value=new_field,
                affected_samples=current.field_counts.get(new_field, 0),
                details=f"Field likely renamed from '{old_field}' to '{new_field}' "
                        f"(similarity: {similarity*100:.1f}%), "
                        f"type: {current.fields.get(new_field, 'unknown')}",
                severity='medium'
            ))

        for field_name in new_fields:
            presence_rate = current.get_field_presence_rate(field_name)
            if presence_rate >= FIELD_ADD_THRESHOLD:
                changes.append(EvolutionChange(
                    change_type='field_added',
                    field_name=field_name,
                    old_value='',
                    new_value=current.fields[field_name],
                    affected_samples=int(current.total_samples * presence_rate),
                    details=f"New field '{field_name}' detected with type '{current.fields[field_name]}', "
                            f"present in {presence_rate*100:.2f}% of samples",
                    severity='high'
                ))

        for field_name in removed_fields:
            prev_presence = previous.get_field_presence_rate(field_name)
            if prev_presence >= FIELD_REMOVE_THRESHOLD:
                changes.append(EvolutionChange(
                    change_type='field_removed',
                    field_name=field_name,
                    old_value=previous.fields[field_name],
                    new_value='',
                    affected_samples=int(previous.total_samples * prev_presence),
                    details=f"Field '{field_name}' removed, previously present in {prev_presence*100:.2f}% of samples",
                    severity='high'
                ))

        common_fields = set(current.fields.keys()) & set(previous.fields.keys())
        for field_name in common_fields:
            old_type = previous.fields[field_name]
            new_type = current.fields[field_name]

            if old_type != new_type:
                type_change_rate = abs(
                    current.get_field_presence_rate(field_name) -
                    previous.get_field_presence_rate(field_name)
                )
                if type_change_rate >= TYPE_CHANGE_THRESHOLD:
                    changes.append(EvolutionChange(
                        change_type='type_changed',
                        field_name=field_name,
                        old_value=old_type,
                        new_value=new_type,
                        affected_samples=current.field_counts.get(field_name, 0),
                        details=f"Field '{field_name}' type changed from '{old_type}' to '{new_type}'",
                        severity='high'
                    ))

        for field_name in current.enum_values:
            if field_name in previous.enum_values:
                new_enum_values = current.enum_values[field_name] - previous.enum_values[field_name]
                for new_value in new_enum_values:
                    changes.append(EvolutionChange(
                        change_type='enum_added',
                        field_name=field_name,
                        old_value='',
                        new_value=new_value,
                        affected_samples=current.total_samples,
                        details=f"New enum value '{new_value}' added to field '{field_name}'",
                        severity='medium'
                    ))

        for field_name in previous.enum_values:
            if field_name in current.enum_values:
                removed_enum_values = previous.enum_values[field_name] - current.enum_values[field_name]
                for removed_value in removed_enum_values:
                    changes.append(EvolutionChange(
                        change_type='enum_removed',
                        field_name=field_name,
                        old_value=removed_value,
                        new_value='',
                        affected_samples=previous.total_samples,
                        details=f"Enum value '{removed_value}' removed from field '{field_name}'",
                        severity='medium'
                    ))

        if changes:
            self.change_history.extend(changes)
            self.previous_signatures[format_type] = self._copy_signature(current)
            self._create_version(format_type, current)

        return changes

    def _copy_signature(self, signature: SchemaSignature) -> SchemaSignature:
        new_sig = SchemaSignature(signature.format_type)
        new_sig.fields = dict(signature.fields)
        new_sig.field_order = list(signature.field_order)
        new_sig.enum_values = {k: set(v) for k, v in signature.enum_values.items()}
        new_sig.field_counts = dict(signature.field_counts)
        new_sig.field_sample_values = {k: list(v) for k, v in signature.field_sample_values.items()}
        new_sig.null_counts = dict(signature.null_counts)
        new_sig.total_samples = signature.total_samples
        return new_sig

    def _create_version(self, format_type: str, signature: SchemaSignature):
        self.version_counters[format_type] += 1
        version = {
            'format_type': format_type,
            'version_number': self.version_counters[format_type],
            'schema_hash': signature.compute_hash(),
            'fields': dict(signature.fields),
            'field_order': list(signature.field_order),
            'sample_count': signature.total_samples,
            'version_time': datetime.now().isoformat()
        }
        self.schema_versions.append(version)

    def get_change_history(self) -> List[Dict[str, Any]]:
        return [change.to_dict() for change in self.change_history]

    def get_schema_versions(self) -> List[Dict[str, Any]]:
        return self.schema_versions

    def get_current_schema(self, format_type: str = "unknown") -> Optional[Dict[str, Any]]:
        if format_type in self.current_signatures:
            return self.current_signatures[format_type].to_dict()
        return None

    def reset(self):
        self.current_signatures = {}
        self.previous_signatures = {}
        self.change_history = []
        self.schema_versions = []
        self.version_counters = defaultdict(int)
