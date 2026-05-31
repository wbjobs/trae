import clickhouse_connect
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from collections import defaultdict
import json


SCHEMA_SNAPSHOT_TABLE = """
CREATE TABLE IF NOT EXISTS schema_snapshots (
    id UInt64 DEFAULT 0,
    snapshot_time DateTime64(3) DEFAULT now64(3),
    format_type String,
    field_name String,
    field_type String,
    sample_count UInt64 DEFAULT 0,
    null_count UInt64 DEFAULT 0,
    enum_values Array(String) DEFAULT [],
    is_enum UInt8 DEFAULT 0,
    max_length UInt32 DEFAULT 0,
    min_length UInt32 DEFAULT 0,
    avg_length Float64 DEFAULT 0.0,
    numeric_min Float64 DEFAULT 0.0,
    numeric_max Float64 DEFAULT 0.0,
    numeric_avg Float64 DEFAULT 0.0,
    window_start DateTime64(3),
    window_end DateTime64(3)
)
ENGINE = MergeTree()
ORDER BY (window_start, window_end, format_type, field_name)
PARTITION BY toYYYYMM(window_start)
TTL window_start + INTERVAL 90 DAY
"""

SCHEMA_CHANGE_EVENTS_TABLE = """
CREATE TABLE IF NOT EXISTS schema_change_events (
    id UInt64 DEFAULT 0,
    event_time DateTime64(3) DEFAULT now64(3),
    change_type String,
    format_type String,
    field_name String,
    old_value String,
    new_value String,
    affected_logs UInt64 DEFAULT 0,
    detection_window_start DateTime64(3),
    detection_window_end DateTime64(3),
    details String DEFAULT ''
)
ENGINE = MergeTree()
ORDER BY (event_time, change_type, format_type, field_name)
PARTITION BY toYYYYMM(event_time)
TTL event_time + INTERVAL 365 DAY
"""

LOG_ENTRIES_TABLE = """
CREATE TABLE IF NOT EXISTS log_entries (
    id UInt64 DEFAULT 0,
    timestamp DateTime64(3),
    format_type String,
    raw_log String,
    parsed_fields Map(String, String),
    field_signature Map(String, String),
    ingestion_time DateTime64(3) DEFAULT now64(3)
)
ENGINE = MergeTree()
ORDER BY (timestamp, format_type)
PARTITION BY toYYYYMM(timestamp)
TTL timestamp + INTERVAL 90 DAY
"""

SCHEMA_VERSIONS_TABLE = """
CREATE TABLE IF NOT EXISTS schema_versions (
    id UInt64 DEFAULT 0,
    version_time DateTime64(3) DEFAULT now64(3),
    format_type String,
    version_number UInt32,
    schema_hash String,
    fields Map(String, String),
    is_active UInt8 DEFAULT 1,
    sample_count UInt64 DEFAULT 0
)
ENGINE = MergeTree()
ORDER BY (version_time, format_type)
PARTITION BY toYYYYMM(version_time)
TTL version_time + INTERVAL 365 DAY
"""


class ClickHouseStorage:
    def __init__(self, host: str = "localhost", port: int = 9000,
                 user: str = "default", password: str = "",
                 database: str = "log_evolution"):
        self.client = clickhouse_connect.get_client(
            host=host,
            port=port,
            username=user,
            password=password,
            database=database
        )
        self.database = database
        self._initialize_tables()

    def _initialize_tables(self):
        for table_ddl in [
            SCHEMA_SNAPSHOT_TABLE,
            SCHEMA_CHANGE_EVENTS_TABLE,
            LOG_ENTRIES_TABLE,
            SCHEMA_VERSIONS_TABLE
        ]:
            self.client.command(table_ddl)

    def insert_log_entries(self, entries: List[Dict[str, Any]]):
        if not entries:
            return

        columns = ['timestamp', 'format_type', 'raw_log', 'parsed_fields', 'field_signature']
        data = []
        for entry in entries:
            data.append([
                entry.get('timestamp'),
                entry.get('format_type', 'unknown'),
                entry.get('raw_log', ''),
                entry.get('parsed_fields', {}),
                entry.get('field_signature', {})
            ])

        self.client.insert('log_entries', data, column_names=columns)

    def insert_schema_snapshot(self, snapshot: Dict[str, Any]):
        columns = [
            'snapshot_time', 'format_type', 'field_name', 'field_type',
            'sample_count', 'null_count', 'enum_values', 'is_enum',
            'max_length', 'min_length', 'avg_length',
            'numeric_min', 'numeric_max', 'numeric_avg',
            'window_start', 'window_end'
        ]
        data = [[snapshot.get(col) for col in columns]]
        self.client.insert('schema_snapshots', data, column_names=columns)

    def insert_schema_change_event(self, event: Dict[str, Any]):
        columns = [
            'event_time', 'change_type', 'format_type', 'field_name',
            'old_value', 'new_value', 'affected_logs',
            'detection_window_start', 'detection_window_end', 'details'
        ]
        data = [[event.get(col) for col in columns]]
        self.client.insert('schema_change_events', data, column_names=columns)

    def insert_schema_version(self, version: Dict[str, Any]):
        columns = [
            'version_time', 'format_type', 'version_number',
            'schema_hash', 'fields', 'is_active', 'sample_count'
        ]
        data = [[version.get(col) for col in columns]]
        self.client.insert('schema_versions', data, column_names=columns)

    def get_schema_snapshots(self, format_type: Optional[str] = None,
                              window_start: Optional[datetime] = None,
                              window_end: Optional[datetime] = None) -> List[Dict]:
        query = "SELECT * FROM schema_snapshots WHERE 1=1"
        params = {}

        if format_type:
            query += " AND format_type = %(format_type)s"
            params['format_type'] = format_type
        if window_start:
            query += " AND window_start >= %(window_start)s"
            params['window_start'] = window_start
        if window_end:
            query += " AND window_end <= %(window_end)s"
            params['window_end'] = window_end

        query += " ORDER BY window_start, field_name"

        result = self.client.query(query, params)
        columns = result.column_names
        return [dict(zip(columns, row)) for row in result.result_rows]

    def get_change_events(self, change_type: Optional[str] = None,
                          format_type: Optional[str] = None,
                          start_time: Optional[datetime] = None,
                          end_time: Optional[datetime] = None) -> List[Dict]:
        query = "SELECT * FROM schema_change_events WHERE 1=1"
        params = {}

        if change_type:
            query += " AND change_type = %(change_type)s"
            params['change_type'] = change_type
        if format_type:
            query += " AND format_type = %(format_type)s"
            params['format_type'] = format_type
        if start_time:
            query += " AND event_time >= %(start_time)s"
            params['start_time'] = start_time
        if end_time:
            query += " AND event_time <= %(end_time)s"
            params['end_time'] = end_time

        query += " ORDER BY event_time"

        result = self.client.query(query, params)
        columns = result.column_names
        return [dict(zip(columns, row)) for row in result.result_rows]

    def get_schema_versions(self, format_type: Optional[str] = None,
                            is_active: Optional[bool] = None) -> List[Dict]:
        query = "SELECT * FROM schema_versions WHERE 1=1"
        params = {}

        if format_type:
            query += " AND format_type = %(format_type)s"
            params['format_type'] = format_type
        if is_active is not None:
            query += " AND is_active = %(is_active)s"
            params['is_active'] = 1 if is_active else 0

        query += " ORDER BY version_time DESC"

        result = self.client.query(query, params)
        columns = result.column_names
        return [dict(zip(columns, row)) for row in result.result_rows]

    def get_field_distribution(self, field_name: str,
                                start_time: Optional[datetime] = None,
                                end_time: Optional[datetime] = None,
                                limit: int = 100) -> List[Dict]:
        query = f"""
            SELECT 
                parsed_fields['{field_name}'] as field_value,
                count() as cnt
            FROM log_entries
            WHERE parsed_fields['{field_name}'] != ''
        """
        params = {}

        if start_time:
            query += " AND timestamp >= %(start_time)s"
            params['start_time'] = start_time
        if end_time:
            query += " AND timestamp <= %(end_time)s"
            params['end_time'] = end_time

        query += " GROUP BY field_value ORDER BY cnt DESC LIMIT %(limit)s"
        params['limit'] = limit

        result = self.client.query(query, params)
        columns = result.column_names
        return [dict(zip(columns, row)) for row in result.result_rows]

    def get_log_count(self, start_time: Optional[datetime] = None,
                      end_time: Optional[datetime] = None,
                      format_type: Optional[str] = None) -> int:
        query = "SELECT count() as cnt FROM log_entries WHERE 1=1"
        params = {}

        if start_time:
            query += " AND timestamp >= %(start_time)s"
            params['start_time'] = start_time
        if end_time:
            query += " AND timestamp <= %(end_time)s"
            params['end_time'] = end_time
        if format_type:
            query += " AND format_type = %(format_type)s"
            params['format_type'] = format_type

        result = self.client.query(query, params)
        return result.result_rows[0][0] if result.result_rows else 0

    def get_unique_fields(self, start_time: Optional[datetime] = None,
                          end_time: Optional[datetime] = None) -> List[str]:
        query = """
            SELECT DISTINCT arrayJoin(mapKeys(parsed_fields)) as field_name
            FROM log_entries
            WHERE 1=1
        """
        params = {}

        if start_time:
            query += " AND timestamp >= %(start_time)s"
            params['start_time'] = start_time
        if end_time:
            query += " AND timestamp <= %(end_time)s"
            params['end_time'] = end_time

        query += " ORDER BY field_name"

        result = self.client.query(query, params)
        return [row[0] for row in result.result_rows]

    def get_sankey_data(self, start_time: Optional[datetime] = None,
                        end_time: Optional[datetime] = None) -> Dict[str, Any]:
        change_events = self.get_change_events(start_time=start_time, end_time=end_time)

        nodes = []
        links = []
        node_ids = set()

        for event in change_events:
            field_name = event.get('field_name', 'unknown')
            change_type = event.get('change_type', 'unknown')
            format_type = event.get('format_type', 'unknown')

            source_id = f"{format_type}_{event.get('old_value', 'none')}"
            target_id = f"{format_type}_{event.get('new_value', 'none')}"

            if source_id not in node_ids:
                nodes.append({
                    'id': source_id,
                    'name': event.get('old_value', 'none'),
                    'category': format_type
                })
                node_ids.add(source_id)

            if target_id not in node_ids:
                nodes.append({
                    'id': target_id,
                    'name': event.get('new_value', 'none'),
                    'category': format_type
                })
                node_ids.add(target_id)

            links.append({
                'source': source_id,
                'target': target_id,
                'value': event.get('affected_logs', 0),
                'change_type': change_type,
                'field_name': field_name,
                'event_time': event.get('event_time', '').isoformat() if event.get('event_time') else ''
            })

        return {
            'nodes': nodes,
            'links': links,
            'total_events': len(change_events)
        }

    def get_evolution_timeline(self, start_time: Optional[datetime] = None,
                                end_time: Optional[datetime] = None) -> List[Dict]:
        change_events = self.get_change_events(start_time=start_time, end_time=end_time)

        timeline = []
        for event in change_events:
            timeline.append({
                'time': event.get('event_time', '').isoformat() if event.get('event_time') else '',
                'change_type': event.get('change_type', ''),
                'format_type': event.get('format_type', ''),
                'field_name': event.get('field_name', ''),
                'old_value': event.get('old_value', ''),
                'new_value': event.get('new_value', ''),
                'affected_logs': event.get('affected_logs', 0),
                'details': event.get('details', '')
            })

        return timeline

    def get_impact_analysis(self, field_name: str,
                            start_time: Optional[datetime] = None,
                            end_time: Optional[datetime] = None) -> Dict[str, Any]:
        query = """
            SELECT 
                format_type,
                count() as total_count,
                countIf(parsed_fields[%(field_name)s] != '') as field_present_count,
                countIf(parsed_fields[%(field_name)s] = '') as field_absent_count
            FROM log_entries
            WHERE 1=1
        """
        params = {'field_name': field_name}

        if start_time:
            query += " AND timestamp >= %(start_time)s"
            params['start_time'] = start_time
        if end_time:
            query += " AND timestamp <= %(end_time)s"
            params['end_time'] = end_time

        query += " GROUP BY format_type"

        result = self.client.query(query, params)

        impact_data = []
        for row in result.result_rows:
            total = row[1]
            present = row[2]
            absent = row[3]
            impact_data.append({
                'format_type': row[0],
                'total_logs': total,
                'field_present': present,
                'field_absent': absent,
                'presence_rate': round(present / total * 100, 2) if total > 0 else 0
            })

        return {
            'field_name': field_name,
            'impact_by_format': impact_data,
            'total_impact': sum(d['field_absent'] for d in impact_data)
        }
