import os
import json
import click
import requests
from dotenv import load_dotenv
from prettytable import PrettyTable

load_dotenv()

SCHEDULER_URL = os.getenv('SCHEDULER_URL', 'http://localhost:8080')

def api_request(method, path, json_data=None, params=None):
    url = f'{SCHEDULER_URL}{path}'
    try:
        response = requests.request(method, url, json=json_data, params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_data = e.response.json()
                if error_data.get('error') == 'DAG_CYCLE_DETECTED':
                    click.echo(click.style('✗ DAG Cycle Detected!', fg='red', bold=True), err=True)
                    click.echo(click.style(f'Message: {error_data.get("message")}', fg='red'), err=True)
                    if error_data.get('cyclePath'):
                        cycle_path = ' -> '.join(error_data['cyclePath'])
                        click.echo(click.style(f'Cycle Path: {cycle_path}', fg='yellow'), err=True)
                    if error_data.get('dagName'):
                        click.echo(f'DAG: {error_data["dagName"]}', err=True)
                    raise click.Abort()
                else:
                    click.echo(f'Error: {e}', err=True)
                    click.echo(f'Response: {error_data}', err=True)
            except:
                click.echo(f'Error: {e}', err=True)
                click.echo(f'Response: {e.response.text}', err=True)
        else:
            click.echo(f'Error: {e}', err=True)
        raise click.Abort()

def print_table(data, fields):
    if not data:
        click.echo('No data found')
        return
    table = PrettyTable()
    table.field_names = fields
    for item in data:
        row = []
        for field in fields:
            value = item.get(field, '')
            if isinstance(value, dict):
                value = json.dumps(value, ensure_ascii=False)[:50]
            row.append(str(value)[:100])
        table.add_row(row)
    click.echo(table)

@click.group()
@click.option('--url', default=SCHEDULER_URL, help='Scheduler API URL')
def cli(url):
    """Distributed Task Scheduler CLI"""
    global SCHEDULER_URL
    SCHEDULER_URL = url

@cli.group()
def task():
    """Task management commands"""
    pass

@task.command('create')
@click.option('--name', required=True, help='Task name')
@click.option('--type', 'task_type', required=True, help='Task type')
@click.option('--cron', help='Cron expression')
@click.option('--params', help='Task parameters (JSON string)')
@click.option('--description', help='Task description')
@click.option('--max-retry', default=3, help='Max retry times')
@click.option('--retry-interval', default=60, help='Retry interval in seconds')
@click.option('--timeout', default=3600, help='Timeout in seconds')
@click.option('--priority', default=5, type=click.IntRange(1, 10), help='Task priority (1-10, 10=highest)')
@click.option('--preemptible/--non-preemptible', default=True, help='Whether task can be preempted')
def create_task(name, task_type, cron, params, description, max_retry, retry_interval, timeout, priority, preemptible):
    """Create a new task"""
    task_params = json.loads(params) if params else None
    data = {
        'taskName': name,
        'taskType': task_type,
        'cronExpression': cron,
        'taskParams': task_params,
        'description': description,
        'maxRetryTimes': max_retry,
        'retryIntervalSeconds': retry_interval,
        'timeoutSeconds': timeout,
        'priority': priority,
        'preemptible': preemptible
    }
    result = api_request('POST', '/api/tasks', data)
    click.echo(f'Task created successfully: ID={result["id"]}, Name={result["taskName"]}, Priority={result["priority"]}, Preemptible={result["preemptible"]}')

@task.command('list')
def list_tasks():
    """List all tasks"""
    tasks = api_request('GET', '/api/tasks')
    print_table(tasks, ['id', 'taskName', 'taskType', 'priority', 'preemptible', 'status', 'description'])

@task.command('get')
@click.argument('task_id', type=int)
def get_task(task_id):
    """Get task details"""
    task = api_request('GET', f'/api/tasks/{task_id}')
    click.echo(json.dumps(task, indent=2, ensure_ascii=False))

@task.command('update')
@click.argument('task_id', type=int)
@click.option('--name', help='Task name')
@click.option('--type', 'task_type', help='Task type')
@click.option('--cron', help='Cron expression')
@click.option('--params', help='Task parameters (JSON string)')
@click.option('--description', help='Task description')
@click.option('--max-retry', type=int, help='Max retry times')
@click.option('--retry-interval', type=int, help='Retry interval in seconds')
@click.option('--timeout', type=int, help='Timeout in seconds')
def update_task(task_id, name, task_type, cron, params, description, max_retry, retry_interval, timeout):
    """Update a task"""
    existing = api_request('GET', f'/api/tasks/{task_id}')
    data = {
        'taskName': name or existing['taskName'],
        'taskType': task_type or existing['taskType'],
        'cronExpression': cron if cron is not None else existing.get('cronExpression'),
        'taskParams': json.loads(params) if params else existing.get('taskParams'),
        'description': description if description is not None else existing.get('description'),
        'maxRetryTimes': max_retry or existing.get('maxRetryTimes'),
        'retryIntervalSeconds': retry_interval or existing.get('retryIntervalSeconds'),
        'timeoutSeconds': timeout or existing.get('timeoutSeconds')
    }
    result = api_request('PUT', f'/api/tasks/{task_id}', data)
    click.echo(f'Task updated successfully: ID={result["id"]}')

@task.command('delete')
@click.argument('task_id', type=int)
def delete_task(task_id):
    """Delete a task"""
    result = api_request('DELETE', f'/api/tasks/{task_id}')
    click.echo(result.get('message', 'Task deleted successfully'))

@task.command('submit')
@click.option('--name', required=True, help='Task name')
@click.option('--params', help='Task parameters (JSON string)')
def submit_task(name, params):
    """Submit a task for execution"""
    task_params = json.loads(params) if params else None
    data = {'taskName': name, 'params': task_params}
    result = api_request('POST', '/api/tasks/submit', data)
    click.echo(f'Task submitted successfully: Instance ID={result["id"]}, Status={result["status"]}')

@task.command('pause')
@click.argument('task_id', type=int)
def pause_task(task_id):
    """Pause a cron task"""
    result = api_request('POST', f'/api/tasks/{task_id}/pause')
    click.echo(result.get('message', 'Task paused successfully'))

@task.command('resume')
@click.argument('task_id', type=int)
def resume_task(task_id):
    """Resume a cron task"""
    result = api_request('POST', f'/api/tasks/{task_id}/resume')
    click.echo(result.get('message', 'Task resumed successfully'))

@task.command('instances')
@click.argument('task_id', type=int)
def list_task_instances(task_id):
    """List task instances"""
    instances = api_request('GET', f'/api/tasks/{task_id}/instances')
    print_table(instances, ['id', 'status', 'executorId', 'retryTimes', 'createdAt', 'completedAt'])

@cli.group()
def instance():
    """Task instance management commands"""
    pass

@instance.command('get')
@click.argument('instance_id', type=int)
def get_instance(instance_id):
    """Get task instance details"""
    instance = api_request('GET', f'/api/task-instances/{instance_id}')
    click.echo(json.dumps(instance, indent=2, ensure_ascii=False))

@instance.command('list')
@click.option('--status', help='Filter by status')
@click.option('--trace-id', help='Filter by trace ID')
def list_instances(status, trace_id):
    """List task instances"""
    params = {}
    if status:
        params['status'] = status
    if trace_id:
        params['traceId'] = trace_id
    instances = api_request('GET', '/api/task-instances', params=params)
    print_table(instances, ['id', 'taskId', 'priority', 'status', 'executorId', 'retryTimes', 'createdAt'])

@instance.command('cancel')
@click.argument('instance_id', type=int)
def cancel_instance(instance_id):
    """Cancel a task instance"""
    result = api_request('POST', f'/api/task-instances/{instance_id}/cancel')
    click.echo(f'Cancelled: {result["cancelled"]}, Message: {result["message"]}')

@instance.command('retry')
@click.argument('instance_id', type=int)
def retry_instance(instance_id):
    """Retry a task instance"""
    result = api_request('POST', f'/api/task-instances/{instance_id}/retry')
    click.echo(f'Retried: {result["retried"]}, Message: {result["message"]}')

@instance.command('suspend')
@click.argument('instance_id', type=int)
@click.option('--checkpoint', help='Checkpoint data for resume')
def suspend_instance(instance_id, checkpoint):
    """Suspend a running task instance"""
    data = {'checkpointData': checkpoint} if checkpoint else None
    result = api_request('POST', f'/api/task-instances/{instance_id}/suspend', data)
    if result['suspended']:
        click.echo(click.style(f'✓ Task {instance_id} suspended successfully', fg='green'))
    else:
        click.echo(click.style(f'✗ Failed to suspend task: {result["message"]}', fg='red'))

@instance.command('resume')
@click.argument('instance_id', type=int)
def resume_instance(instance_id):
    """Resume a suspended task instance"""
    result = api_request('POST', f'/api/task-instances/{instance_id}/resume')
    if result['resumed']:
        click.echo(click.style(f'✓ Task {instance_id} resumed successfully', fg='green'))
    else:
        click.echo(click.style(f'✗ Failed to resume task: {result["message"]}', fg='red'))

@instance.command('suspended')
def list_suspended_instances():
    """List all suspended task instances"""
    instances = api_request('GET', '/api/task-instances/suspended')
    if not instances:
        click.echo('No suspended tasks')
    else:
        print_table(instances, ['id', 'taskId', 'priority', 'suspendedByInstanceId', 'suspendedAt', 'resumeCount'])

@instance.command('trace')
@click.argument('trace_id')
def get_trace(trace_id):
    """Get all instances by trace ID"""
    instances = api_request('GET', f'/api/task-instances/trace/{trace_id}')
    print_table(instances, ['id', 'taskId', 'status', 'executorId', 'retryTimes', 'createdAt'])

@cli.group()
def dag():
    """DAG management commands"""
    pass

@dag.command('create')
@click.option('--name', required=True, help='DAG name')
@click.option('--description', help='DAG description')
@click.option('--edges', help='DAG edges (JSON array: [{"fromTaskName":"A","toTaskName":"B"}])')
def create_dag(name, description, edges):
    """Create a new DAG"""
    edges_data = json.loads(edges) if edges else []
    data = {
        'dagName': name,
        'description': description,
        'edges': edges_data
    }
    result = api_request('POST', '/api/dags', data)
    click.echo(f'DAG created successfully: ID={result["id"]}, Name={result["dagName"]}')

@dag.command('list')
def list_dags():
    """List all DAGs"""
    dags = api_request('GET', '/api/dags')
    print_table(dags, ['id', 'dagName', 'status', 'description', 'createdAt'])

@dag.command('get')
@click.argument('dag_id', type=int)
def get_dag(dag_id):
    """Get DAG details"""
    dag = api_request('GET', f'/api/dags/{dag_id}')
    click.echo(json.dumps(dag, indent=2, ensure_ascii=False))

@dag.command('edges')
@click.argument('dag_id', type=int)
def get_dag_edges(dag_id):
    """Get DAG edges"""
    edges = api_request('GET', f'/api/dags/{dag_id}/edges')
    print_table(edges, ['id', 'fromTaskId', 'toTaskId', 'createdAt'])

@dag.command('add-edges')
@click.argument('dag_id', type=int)
@click.option('--edges', required=True, help='DAG edges (JSON array)')
def add_dag_edges(dag_id, edges):
    """Add edges to DAG"""
    edges_data = json.loads(edges)
    data = {'edges': edges_data}
    result = api_request('POST', f'/api/dags/{dag_id}/edges', data)
    click.echo(result.get('message', 'Edges added successfully'))

@dag.command('delete')
@click.argument('dag_id', type=int)
def delete_dag(dag_id):
    """Delete a DAG"""
    result = api_request('DELETE', f'/api/dags/{dag_id}')
    click.echo(result.get('message', 'DAG deleted successfully'))

@dag.command('submit')
@click.option('--name', required=True, help='DAG name')
@click.option('--params', help='DAG parameters (JSON string)')
def submit_dag(name, params):
    """Submit a DAG for execution"""
    dag_params = json.loads(params) if params else None
    result = api_request('POST', f'/api/dags/{name}/submit', dag_params)
    click.echo(f'DAG submitted successfully: {len(result)} task instances created')
    print_table(result, ['id', 'taskId', 'status', 'traceId'])

@dag.command('instances')
@click.argument('dag_id', type=int)
def list_dag_instances(dag_id):
    """List DAG instances"""
    instances = api_request('GET', f'/api/dags/{dag_id}/instances')
    print_table(instances, ['id', 'taskId', 'status', 'traceId', 'createdAt'])

@dag.command('validate')
@click.argument('dag_id', type=int)
def validate_dag(dag_id):
    """Validate DAG for cycles"""
    result = api_request('GET', f'/api/dags/{dag_id}/validate')
    if result.get('valid'):
        click.echo(click.style('✓ DAG is valid', fg='green'))
        if result.get('topologicalOrder'):
            click.echo(f'Topological order: {result.get("topologicalOrder")}')
    else:
        click.echo(click.style('✗ DAG is invalid', fg='red'))
        click.echo(f'Message: {result.get("message")}')
        if result.get('cyclePath'):
            click.echo(f'Cycle path: {" -> ".join(result.get('cyclePath'))}')

@cli.group()
def executor():
    """Executor management commands"""
    pass

@executor.command('list')
@click.option('--status', help='Filter by status')
def list_executors(status):
    """List all executors"""
    params = {}
    if status:
        params['status'] = status
    executors = api_request('GET', '/api/executors', params=params)
    print_table(executors, ['id', 'executorName', 'host', 'port', 'status', 'lastHeartbeatAt'])

@executor.command('get')
@click.argument('executor_id')
def get_executor(executor_id):
    """Get executor details"""
    executor = api_request('GET', f'/api/executors/{executor_id}')
    click.echo(json.dumps(executor, indent=2, ensure_ascii=False))

if __name__ == '__main__':
    cli()
