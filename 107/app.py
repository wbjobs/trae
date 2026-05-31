from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import json
import os

from log_parser import NginxLogParser, ParsedLog
from storage import ClickHouseStorage
from evolution_detector import PatternEvolutionDetector, EvolutionChange
from analyzer import TimelineAnalyzer, ImpactAnalyzer, SankeyDataBuilder
from predictor import EvolutionPredictor
from config import settings


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="日志模式演化分析系统 - 自动检测日志格式变化并可视化展示"
)

storage = ClickHouseStorage(
    host=settings.CLICKHOUSE_HOST,
    port=settings.CLICKHOUSE_PORT,
    user=settings.CLICKHOUSE_USER,
    password=settings.CLICKHOUSE_PASSWORD,
    database=settings.CLICKHOUSE_DATABASE
)

log_parser = NginxLogParser()
evolution_detector = PatternEvolutionDetector()
timeline_analyzer = TimelineAnalyzer()
impact_analyzer = ImpactAnalyzer()
sankey_builder = SankeyDataBuilder()
evolution_predictor = EvolutionPredictor()


class LogIngestionRequest(BaseModel):
    logs: List[str]
    format_type: Optional[str] = "auto"


class DetectionResponse(BaseModel):
    changes_detected: int
    changes: List[Dict[str, Any]]
    timeline: List[Dict[str, Any]]


class EvolutionQuery(BaseModel):
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    format_type: Optional[str] = None
    change_type: Optional[str] = None


@app.get("/", response_class=HTMLResponse)
async def root():
    with open(os.path.join(os.path.dirname(__file__), "templates", "index.html"), "r", encoding="utf-8") as f:
        return f.read()


@app.post("/api/v1/logs/ingest")
async def ingest_logs(request: LogIngestionRequest):
    parsed_entries = []
    parsed_logs = []

    for line in request.logs:
        parsed_log = log_parser.parse_line(line)
        if not parsed_log.parse_success:
            continue

        parsed_logs.append(parsed_log)

        timestamp = parsed_log.timestamp if parsed_log.timestamp else datetime.now()

        parsed_fields = {}
        for key, value in parsed_log.fields.items():
            parsed_fields[key] = str(value) if value is not None else ''

        field_signature = log_parser.extract_field_signature(parsed_log)

        parsed_entries.append({
            'timestamp': timestamp,
            'format_type': parsed_log.format_type,
            'raw_log': line,
            'parsed_fields': parsed_fields,
            'field_signature': field_signature
        })

    if parsed_entries:
        storage.insert_log_entries(parsed_entries)

    evolution_detector.process_batch(parsed_logs, request.format_type if request.format_type != "auto" else "unknown")

    for entry in parsed_entries:
        impact_analyzer.analyze_log_entry(
            entry.get('parsed_fields', {}),
            entry.get('field_signature', {})
        )

    return {
        'success': True,
        'ingested_count': len(parsed_entries),
        'failed_count': len(request.logs) - len(parsed_entries),
        'format_types': list(set(e['format_type'] for e in parsed_entries))
    }


@app.post("/api/v1/logs/ingest-file")
async def ingest_log_file(file: UploadFile = File(...), format_type: str = "auto"):
    content = await file.read()
    lines = content.decode('utf-8', errors='ignore').split('\n')
    lines = [line.strip() for line in lines if line.strip()]

    request = LogIngestionRequest(logs=lines, format_type=format_type)
    return await ingest_logs(request)


@app.post("/api/v1/detection/detect")
async def detect_changes(format_type: Optional[str] = "unknown"):
    changes = evolution_detector.detect_changes(format_type)

    if changes:
        for change in changes:
            event = {
                'event_time': change.timestamp,
                'change_type': change.change_type,
                'format_type': format_type,
                'field_name': change.field_name,
                'old_value': change.old_value,
                'new_value': change.new_value,
                'affected_logs': change.affected_samples,
                'detection_window_start': change.timestamp - timedelta(hours=1),
                'detection_window_end': change.timestamp,
                'details': change.details,
                'severity': change.severity
            }
            storage.insert_schema_change_event(event)
            timeline_analyzer.add_event(event)

    schema_versions = evolution_detector.get_schema_versions()
    evolution_predictor.ingest_schema_versions(schema_versions)

    recent_events = storage.get_change_events()
    if recent_events:
        evolution_predictor.ingest_change_events(recent_events)

    timeline = timeline_analyzer.get_timeline()

    return DetectionResponse(
        changes_detected=len(changes),
        changes=[c.to_dict() for c in changes],
        timeline=timeline
    )


@app.get("/api/v1/evolution/timeline")
async def get_evolution_timeline(
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    change_type: Optional[str] = None,
    format_type: Optional[str] = None
):
    start_dt = datetime.fromisoformat(start_time) if start_time else None
    end_dt = datetime.fromisoformat(end_time) if end_time else None

    db_timeline = storage.get_evolution_timeline(start_dt, end_dt)

    change_types = [change_type] if change_type else None
    local_timeline = timeline_analyzer.get_timeline(start_dt, end_dt, change_types, format_type)

    combined = db_timeline + local_timeline
    combined.sort(key=lambda x: x.get('time', ''))

    return {
        'timeline': combined,
        'total_events': len(combined)
    }


@app.get("/api/v1/evolution/sankey")
async def get_sankey_data(
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    format_type: Optional[str] = None
):
    start_dt = datetime.fromisoformat(start_time) if start_time else None
    end_dt = datetime.fromisoformat(end_time) if end_time else None

    changes = storage.get_change_events(
        start_time=start_dt,
        end_time=end_dt,
        format_type=format_type
    )

    sankey_data = sankey_builder.build_from_changes(changes)

    schema_versions = storage.get_schema_versions(format_type=format_type)
    if schema_versions:
        version_sankey = sankey_builder.build_simple_evolution(schema_versions)
        sankey_data['version_evolution'] = version_sankey

    return sankey_data


@app.get("/api/v1/evolution/impact")
async def get_impact_analysis(
    field_name: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None
):
    start_dt = datetime.fromisoformat(start_time) if start_time else None
    end_dt = datetime.fromisoformat(end_time) if end_time else None

    if field_name:
        impact = storage.get_impact_analysis(field_name, start_dt, end_dt)
        return impact

    local_impact = impact_analyzer.get_impact_summary()
    return local_impact


@app.get("/api/v1/schema/current")
async def get_current_schema(format_type: Optional[str] = None):
    schemas = {}

    for ft in (evolution_detector.current_signatures.keys()):
        if format_type and ft != format_type:
            continue
        schema = evolution_detector.get_current_schema(ft)
        if schema:
            schemas[ft] = schema

    db_versions = storage.get_schema_versions(format_type=format_type, is_active=True)
    for version in db_versions:
        ft = version.get('format_type', 'unknown')
        if ft not in schemas:
            schemas[ft] = {
                'format_type': ft,
                'fields': version.get('fields', {}),
                'total_samples': version.get('sample_count', 0)
            }

    return {
        'schemas': schemas,
        'format_types': list(schemas.keys())
    }


@app.get("/api/v1/schema/versions")
async def get_schema_versions(
    format_type: Optional[str] = None,
    is_active: Optional[bool] = None
):
    versions = storage.get_schema_versions(format_type=format_type, is_active=is_active)
    local_versions = evolution_detector.get_schema_versions()

    return {
        'database_versions': versions,
        'memory_versions': local_versions
    }


@app.get("/api/v1/stats/summary")
async def get_stats_summary(
    start_time: Optional[str] = None,
    end_time: Optional[str] = None
):
    start_dt = datetime.fromisoformat(start_time) if start_time else None
    end_dt = datetime.fromisoformat(end_time) if end_time else None

    log_count = storage.get_log_count(start_dt, end_dt)
    change_events = storage.get_change_events(start_time=start_dt, end_time=end_dt)
    unique_fields = storage.get_unique_fields(start_dt, end_dt)

    timeline_summary = timeline_analyzer.get_summary(start_dt, end_dt)

    return {
        'total_logs': log_count,
        'total_change_events': len(change_events),
        'unique_fields_count': len(unique_fields),
        'unique_fields': unique_fields,
        'timeline_summary': timeline_summary,
        'time_range': {
            'start': start_time,
            'end': end_time
        }
    }


@app.get("/api/v1/prediction/changes")
async def get_predicted_changes(
    format_type: Optional[str] = "unknown",
    horizon_days: int = 7
):
    recent_events = storage.get_change_events()
    if recent_events:
        evolution_predictor.ingest_change_events(recent_events)

    schema_versions = evolution_detector.get_schema_versions()
    if schema_versions:
        evolution_predictor.ingest_schema_versions(schema_versions)

    evolution_predictor.prediction_horizon_days = horizon_days

    predictions = evolution_predictor.predict_changes(format_type)
    return predictions


@app.get("/api/v1/prediction/advice")
async def get_compatibility_advice(
    format_type: Optional[str] = "unknown"
):
    recent_events = storage.get_change_events()
    if recent_events:
        evolution_predictor.ingest_change_events(recent_events)

    schema_versions = evolution_detector.get_schema_versions()
    if schema_versions:
        evolution_predictor.ingest_schema_versions(schema_versions)

    advice = evolution_predictor.generate_compatibility_advice(format_type)
    return {
        'format_type': format_type,
        'advice_count': len(advice),
        'advice': advice
    }


@app.get("/api/v1/prediction/summary")
async def get_prediction_summary(
    format_type: Optional[str] = "unknown",
    horizon_days: int = 7
):
    recent_events = storage.get_change_events()
    if recent_events:
        evolution_predictor.ingest_change_events(recent_events)

    schema_versions = evolution_detector.get_schema_versions()
    if schema_versions:
        evolution_predictor.ingest_schema_versions(schema_versions)

    evolution_predictor.prediction_horizon_days = horizon_days

    summary = evolution_predictor.get_prediction_summary(format_type)
    return summary


@app.post("/api/v1/prediction/ingest-trends")
async def ingest_field_trends(
    format_type: str,
    field_name: str,
    timestamps: List[str],
    presence_rates: List[float]
):
    parsed_timestamps = [datetime.fromisoformat(ts) for ts in timestamps]

    evolution_predictor.ingest_field_presence_data(
        format_type, field_name, parsed_timestamps, presence_rates
    )

    return {
        'success': True,
        'format_type': format_type,
        'field_name': field_name,
        'data_points': len(timestamps)
    }


@app.get("/api/v1/fields/distribution")
async def get_field_distribution(
    field_name: str,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    limit: int = 100
):
    start_dt = datetime.fromisoformat(start_time) if start_time else None
    end_dt = datetime.fromisoformat(end_time) if end_time else None

    distribution = storage.get_field_distribution(
        field_name, start_dt, end_dt, limit
    )

    return {
        'field_name': field_name,
        'distribution': distribution,
        'total_values': sum(d.get('cnt', 0) for d in distribution)
    }


@app.get("/api/v1/health")
async def health_check():
    return {
        'status': 'healthy',
        'version': settings.APP_VERSION,
        'clickhouse': 'connected' if storage.client else 'disconnected'
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
