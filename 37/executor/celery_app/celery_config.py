import os
from celery import Celery
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.celery import CeleryInstrumentor

redis_host = os.getenv('REDIS_HOST', 'localhost')
redis_port = os.getenv('REDIS_PORT', '6379')
redis_password = os.getenv('REDIS_PASSWORD', '')

if redis_password:
    broker_url = f'redis://:{redis_password}@{redis_host}:{redis_port}/0'
    result_backend = f'redis://:{redis_password}@{redis_host}:{redis_port}/1'
else:
    broker_url = f'redis://{redis_host}:{redis_port}/0'
    result_backend = f'redis://{redis_host}:{redis_port}/1'

app = Celery(
    'task_executor',
    broker=broker_url,
    result_backend=result_backend
)

app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Asia/Shanghai',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
)

otel_enabled = os.getenv('OTEL_ENABLED', 'true').lower() == 'true'
otel_endpoint = os.getenv('OTEL_ENDPOINT', 'http://localhost:4317')
service_name = os.getenv('OTEL_SERVICE_NAME', 'task-executor')

if otel_enabled:
    resource = Resource(attributes={
        "service.name": service_name
    })
    
    trace.set_tracer_provider(TracerProvider(resource=resource))
    
    otlp_exporter = OTLPSpanExporter(endpoint=otel_endpoint, insecure=True)
    span_processor = BatchSpanProcessor(otlp_exporter)
    trace.get_tracer_provider().add_span_processor(span_processor)
    
    CeleryInstrumentor().instrument()

app.autodiscover_tasks(['celery_app.tasks'])
