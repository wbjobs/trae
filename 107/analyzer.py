from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from collections import defaultdict


CHANGE_TYPE_LABELS = {
    'field_added': '字段新增',
    'field_removed': '字段移除',
    'field_renamed': '字段重命名',
    'field_reordered': '字段顺序调整',
    'type_changed': '类型变更',
    'enum_added': '枚举值新增',
    'enum_removed': '枚举值移除'
}

CHANGE_TYPE_COLORS = {
    'field_added': '#52c41a',
    'field_removed': '#ff4d4f',
    'field_renamed': '#13c2c2',
    'field_reordered': '#8c8c8c',
    'type_changed': '#faad14',
    'enum_added': '#1890ff',
    'enum_removed': '#722ed1'
}

SEVERITY_LABELS = {
    'low': '低',
    'medium': '中',
    'high': '高',
    'info': '信息'
}

SEVERITY_COLORS = {
    'low': '#8c8c8c',
    'medium': '#faad14',
    'high': '#ff4d4f',
    'info': '#1890ff'
}

STRUCTURAL_CHANGE_TYPES = {'field_added', 'field_removed', 'type_changed'}
ORDER_ONLY_CHANGE_TYPES = {'field_reordered'}
RENAME_CHANGE_TYPES = {'field_renamed'}


class TimelineAnalyzer:
    def __init__(self):
        self.events: List[Dict[str, Any]] = []

    def add_event(self, event: Dict[str, Any]):
        self.events.append(event)

    def add_events(self, events: List[Dict[str, Any]]):
        self.events.extend(events)

    def get_timeline(self, start_time: Optional[datetime] = None,
                     end_time: Optional[datetime] = None,
                     change_types: Optional[List[str]] = None,
                     format_type: Optional[str] = None) -> List[Dict[str, Any]]:
        filtered = self.events

        if change_types:
            filtered = [e for e in filtered if e.get('change_type') in change_types]

        if format_type:
            filtered = [e for e in filtered if e.get('format_type') == format_type]

        if start_time:
            filtered = [e for e in filtered
                        if isinstance(e.get('event_time'), datetime) and e['event_time'] >= start_time]

        if end_time:
            filtered = [e for e in filtered
                        if isinstance(e.get('event_time'), datetime) and e['event_time'] <= end_time]

        filtered.sort(key=lambda x: x.get('event_time', datetime.min))

        timeline = []
        for event in filtered:
            change_type = event.get('change_type', '')
            severity = event.get('severity', 'info')
            timeline.append({
                'id': event.get('id', ''),
                'time': event.get('event_time', '').isoformat() if isinstance(event.get('event_time'), datetime) else str(event.get('event_time', '')),
                'change_type': change_type,
                'change_type_label': CHANGE_TYPE_LABELS.get(change_type, change_type),
                'format_type': event.get('format_type', ''),
                'field_name': event.get('field_name', ''),
                'old_value': event.get('old_value', ''),
                'new_value': event.get('new_value', ''),
                'affected_logs': event.get('affected_logs', 0),
                'details': event.get('details', ''),
                'severity': severity,
                'severity_label': SEVERITY_LABELS.get(severity, severity),
                'is_structural': change_type in STRUCTURAL_CHANGE_TYPES,
                'is_order_only': change_type in ORDER_ONLY_CHANGE_TYPES,
                'is_rename': change_type in RENAME_CHANGE_TYPES,
                'color': CHANGE_TYPE_COLORS.get(change_type, '#1890ff'),
                'severity_color': SEVERITY_COLORS.get(severity, '#1890ff')
            })

        return timeline

    def get_summary(self, start_time: Optional[datetime] = None,
                    end_time: Optional[datetime] = None) -> Dict[str, Any]:
        filtered = self.events

        if start_time:
            filtered = [e for e in filtered
                        if isinstance(e.get('event_time'), datetime) and e['event_time'] >= start_time]

        if end_time:
            filtered = [e for e in filtered
                        if isinstance(e.get('event_time'), datetime) and e['event_time'] <= end_time]

        summary = {
            'total_events': len(filtered),
            'by_change_type': defaultdict(int),
            'by_format_type': defaultdict(int),
            'by_field': defaultdict(int),
            'total_affected_logs': 0,
            'time_range': {
                'start': None,
                'end': None
            }
        }

        if filtered:
            times = [e['event_time'] for e in filtered if isinstance(e.get('event_time'), datetime)]
            if times:
                summary['time_range']['start'] = min(times).isoformat()
                summary['time_range']['end'] = max(times).isoformat()

        for event in filtered:
            change_type = event.get('change_type', 'unknown')
            format_type = event.get('format_type', 'unknown')
            field_name = event.get('field_name', 'unknown')

            summary['by_change_type'][change_type] += 1
            summary['by_format_type'][format_type] += 1
            summary['by_field'][field_name] += 1
            summary['total_affected_logs'] += event.get('affected_logs', 0)

        summary['by_change_type'] = dict(summary['by_change_type'])
        summary['by_format_type'] = dict(summary['by_format_type'])
        summary['by_field'] = dict(summary['by_field'])

        return summary


class ImpactAnalyzer:
    def __init__(self):
        self.field_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            'total_samples': 0,
            'present_count': 0,
            'absent_count': 0,
            'null_count': 0,
            'type_distribution': defaultdict(int),
            'sample_values': []
        })

    def analyze_log_entry(self, parsed_fields: Dict[str, Any], field_signature: Dict[str, str]):
        all_fields = set(parsed_fields.keys()) | set(field_signature.keys())

        for field_name in all_fields:
            stats = self.field_stats[field_name]
            stats['total_samples'] += 1

            if field_name in parsed_fields:
                stats['present_count'] += 1
                value = parsed_fields[field_name]

                if value is None or (isinstance(value, str) and value == ''):
                    stats['null_count'] += 1
                else:
                    if len(stats['sample_values']) < 10:
                        stats['sample_values'].append(str(value))
            else:
                stats['absent_count'] += 1

            if field_name in field_signature:
                field_type = field_signature[field_name]
                stats['type_distribution'][field_type] += 1

    def get_field_impact(self, field_name: str) -> Dict[str, Any]:
        if field_name not in self.field_stats:
            return {'field_name': field_name, 'exists': False}

        stats = self.field_stats[field_name]
        total = stats['total_samples']

        return {
            'field_name': field_name,
            'exists': True,
            'total_samples': total,
            'present_count': stats['present_count'],
            'absent_count': stats['absent_count'],
            'null_count': stats['null_count'],
            'presence_rate': round(stats['present_count'] / total * 100, 2) if total > 0 else 0,
            'null_rate': round(stats['null_count'] / stats['present_count'] * 100, 2) if stats['present_count'] > 0 else 0,
            'type_distribution': dict(stats['type_distribution']),
            'sample_values': stats['sample_values']
        }

    def get_all_fields_impact(self) -> List[Dict[str, Any]]:
        results = []
        for field_name in self.field_stats:
            results.append(self.get_field_impact(field_name))
        results.sort(key=lambda x: x.get('presence_rate', 0), reverse=True)
        return results

    def get_impact_summary(self) -> Dict[str, Any]:
        total_fields = len(self.field_stats)
        fields_with_high_presence = 0
        fields_with_low_presence = 0
        fields_with_issues = 0

        for field_name, stats in self.field_stats.items():
            total = stats['total_samples']
            if total == 0:
                continue

            presence_rate = stats['present_count'] / total
            if presence_rate >= 0.9:
                fields_with_high_presence += 1
            elif presence_rate < 0.1:
                fields_with_low_presence += 1

            null_rate = stats['null_count'] / max(stats['present_count'], 1)
            if null_rate > 0.5:
                fields_with_issues += 1

        return {
            'total_fields_tracked': total_fields,
            'high_presence_fields': fields_with_high_presence,
            'low_presence_fields': fields_with_low_presence,
            'fields_with_issues': fields_with_issues,
            'fields_detail': self.get_all_fields_impact()
        }


class SankeyDataBuilder:
    def __init__(self):
        self.nodes: Dict[str, Dict[str, Any]] = {}
        self.links: List[Dict[str, Any]] = []

    def build_from_changes(self, changes: List[Dict[str, Any]]) -> Dict[str, Any]:
        self.nodes = {}
        self.links = []

        for change in changes:
            change_type = change.get('change_type', '')
            field_name = change.get('field_name', '')
            format_type = change.get('format_type', 'unknown')
            old_value = change.get('old_value', '')
            new_value = change.get('new_value', '')
            affected = change.get('affected_logs', 0)

            source_node_id = self._get_or_create_node(
                f"{format_type}_{field_name}_old",
                f"{field_name}: {old_value}" if old_value else f"{field_name}: 无",
                format_type
            )

            target_node_id = self._get_or_create_node(
                f"{format_type}_{field_name}_new",
                f"{field_name}: {new_value}" if new_value else f"{field_name}: 无",
                format_type
            )

            self.links.append({
                'source': source_node_id,
                'target': target_node_id,
                'value': max(affected, 1),
                'change_type': change_type,
                'field_name': field_name,
                'format_type': format_type
            })

        return {
            'nodes': list(self.nodes.values()),
            'links': self.links,
            'categories': self._get_categories()
        }

    def _get_or_create_node(self, node_id: str, name: str, category: str) -> str:
        if node_id not in self.nodes:
            self.nodes[node_id] = {
                'id': node_id,
                'name': name,
                'category': category,
                'value': 0
            }
        return node_id

    def _get_categories(self) -> List[Dict[str, str]]:
        categories = set()
        for node in self.nodes.values():
            categories.add(node['category'])

        return [{'name': cat} for cat in sorted(categories)]

    def build_simple_evolution(self, schema_versions: List[Dict[str, Any]]) -> Dict[str, Any]:
        self.nodes = {}
        self.links = []

        sorted_versions = sorted(schema_versions, key=lambda x: x.get('version_time', ''))

        prev_node_id = None
        for i, version in enumerate(sorted_versions):
            version_num = version.get('version_number', i)
            format_type = version.get('format_type', 'unknown')
            fields = version.get('fields', {})
            field_count = len(fields)

            node_id = f"v{version_num}"
            self.nodes[node_id] = {
                'id': node_id,
                'name': f"v{version_num} ({field_count} fields)",
                'category': format_type,
                'value': version.get('sample_count', 0)
            }

            if prev_node_id:
                self.links.append({
                    'source': prev_node_id,
                    'target': node_id,
                    'value': 1,
                    'change_type': 'schema_evolution',
                    'field_name': 'schema',
                    'format_type': format_type
                })

            prev_node_id = node_id

        return {
            'nodes': list(self.nodes.values()),
            'links': self.links,
            'categories': self._get_categories()
        }
