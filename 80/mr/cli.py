import os
import sys
import time
import threading
import click
import yaml

from .task import Job, JobConfig, TaskStatus, generate_job_id, save_job_state, load_job_state, list_jobs
from .scheduler import RoundRobinScheduler, JobExecutor, create_tasks_for_job
from .rpc import start_worker
from .skew_handler import SKEW_THRESHOLD


DEFAULT_BASE_DIR = os.path.expanduser("~/.mapreduce")
DEFAULT_STATE_DIR = os.path.join(DEFAULT_BASE_DIR, "state")
DEFAULT_WORK_DIR = os.path.join(DEFAULT_BASE_DIR, "work")


def get_cluster_config(config_path: str = None) -> list:
    if config_path and os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return data.get("workers", [])
    return [("localhost", 18861), ("localhost", 18862)]


@click.group()
def cli():
    """MapReduce CLI - 分布式MapReduce任务执行工具"""
    pass


@cli.command()
@click.argument("config_file", type=click.Path(exists=True))
@click.option("--cluster-config", "-c", type=click.Path(exists=True), help="集群配置文件")
@click.option("--base-dir", default=DEFAULT_BASE_DIR, help="基础工作目录")
@click.option("--skew-threshold", default=SKEW_THRESHOLD, type=float,
              help=f"数据倾斜检测阈值（默认: {SKEW_THRESHOLD}倍平均值）")
def submit(config_file, cluster_config, base_dir, skew_threshold):
    """提交MapReduce任务到集群执行"""
    state_dir = os.path.join(base_dir, "state")
    work_dir = os.path.join(base_dir, "work")

    os.makedirs(state_dir, exist_ok=True)
    os.makedirs(work_dir, exist_ok=True)

    job_config = JobConfig.from_yaml(config_file)
    job_id = generate_job_id()

    job = Job(id=job_id, config=job_config)
    job.add_log(f"Job created: {job_id}")
    job.add_log(f"Job config: {job_config.name}")
    job.add_log(f"Skew threshold: {skew_threshold}x")

    os.makedirs(job_config.output_dir, exist_ok=True)

    create_tasks_for_job(job, work_dir)
    save_job_state(job, state_dir)

    click.echo(f"Job submitted: {job_id}")
    click.echo(f"Task counts: {len(job.map_tasks)} mappers, {len(job.reduce_tasks)} reducers")
    click.echo(f"Skew threshold: {skew_threshold}x average")

    workers = get_cluster_config(cluster_config)
    scheduler = RoundRobinScheduler(workers, state_dir)

    healthy_workers = scheduler.check_worker_health()
    if not healthy_workers:
        click.echo("Error: No healthy workers available!", err=True)
        return

    click.echo(f"Healthy workers: {len(healthy_workers)}/{len(workers)}")

    executor = JobExecutor(scheduler, work_dir, state_dir, skew_threshold=skew_threshold)

    job_thread = threading.Thread(target=executor.execute_job, args=(job,))
    job_thread.daemon = True
    job_thread.start()

    try:
        while job_thread.is_alive():
            job = load_job_state(job_id, state_dir)
            progress = job.get_progress()

            click.echo("\r" + " " * 80, nl=False)
            click.echo(f"\rStatus: {progress['status']:10} | Map: {progress['map_progress']:8} ({progress['map_percent']:.0f}%) | Reduce: {progress['reduce_progress']:8} ({progress['reduce_percent']:.0f}%)", nl=False)

            time.sleep(1)

        click.echo()

        job = load_job_state(job_id, state_dir)
        progress = job.get_progress()

        if job.status == TaskStatus.COMPLETED:
            click.echo(click.style(f"Job {job_id} completed successfully!", fg="green"))
            click.echo(f"Output: {os.path.join(job_config.output_dir, 'part-00000')}")
        else:
            click.echo(click.style(f"Job {job_id} failed!", fg="red"))
            if progress["logs"]:
                click.echo("Recent logs:")
                for log in progress["logs"][-5:]:
                    click.echo(f"  {log}")

    except KeyboardInterrupt:
        click.echo("\nInterrupted. Check job status with: mr logs " + job_id)


@cli.command()
@click.argument("job_id")
@click.option("--follow", "-f", is_flag=True, help="持续跟踪日志输出")
@click.option("--base-dir", default=DEFAULT_BASE_DIR, help="基础工作目录")
def logs(job_id, follow, base_dir):
    """查看任务执行日志和进度"""
    state_dir = os.path.join(base_dir, "state")

    job = load_job_state(job_id, state_dir)
    if not job:
        click.echo(f"Job not found: {job_id}", err=True)
        return

    progress = job.get_progress()

    click.echo(f"Job ID: {job_id}")
    click.echo(f"Name: {job.config.name}")
    click.echo(f"Status: {progress['status']}")
    click.echo(f"Map: {progress['map_progress']} ({progress['map_percent']:.0f}%)")
    click.echo(f"Reduce: {progress['reduce_progress']} ({progress['reduce_percent']:.0f}%)")

    if progress["failed_tasks"] > 0:
        click.echo(click.style(f"Failed tasks: {progress['failed_tasks']}", fg="red"))

    click.echo("\nLogs:")
    for log in job.logs:
        click.echo(log)

    if follow and job.status in [TaskStatus.RUNNING, TaskStatus.PENDING]:
        click.echo("\nFollowing logs (Ctrl+C to exit)...")
        last_log_count = len(job.logs)
        try:
            while True:
                job = load_job_state(job_id, state_dir)
                if len(job.logs) > last_log_count:
                    for log in job.logs[last_log_count:]:
                        click.echo(log)
                    last_log_count = len(job.logs)

                if job.status not in [TaskStatus.RUNNING, TaskStatus.PENDING]:
                    click.echo(f"\nJob finished with status: {job.status.value}")
                    break

                time.sleep(1)
        except KeyboardInterrupt:
            pass


@cli.command("list")
@click.option("--base-dir", default=DEFAULT_BASE_DIR, help="基础工作目录")
def list_jobs_cmd(base_dir):
    """列出所有任务"""
    state_dir = os.path.join(base_dir, "state")
    jobs = list_jobs(state_dir)

    if not jobs:
        click.echo("No jobs found")
        return

    click.echo(f"Found {len(jobs)} jobs:")
    for job_id in sorted(jobs, reverse=True):
        job = load_job_state(job_id, state_dir)
        if job:
            progress = job.get_progress()
            status_color = {
                "completed": "green",
                "running": "yellow",
                "pending": "blue",
                "failed": "red",
            }.get(progress["status"], "white")
            click.echo(
                f"  {job_id}  {job.config.name:20}  "
                f"{click.style(progress['status'], fg=status_color):10}  "
                f"Map: {progress['map_progress']}  "
                f"Reduce: {progress['reduce_progress']}"
            )


@cli.command()
@click.option("--worker-id", required=True, help="Worker ID")
@click.option("--host", default="0.0.0.0", help="监听地址")
@click.option("--port", default=18861, type=int, help="监听端口")
@click.option("--work-dir", default=DEFAULT_WORK_DIR, help="工作目录")
def worker(worker_id, host, port, work_dir):
    """启动工作节点"""
    worker_work_dir = os.path.join(work_dir, worker_id)
    click.echo(f"Starting worker {worker_id} on {host}:{port}")
    click.echo(f"Work directory: {worker_work_dir}")
    try:
        start_worker(worker_id, host, port, worker_work_dir)
    except KeyboardInterrupt:
        click.echo("Worker stopped")


@cli.command()
def example():
    """生成示例任务配置文件"""
    example_config = """name: wordcount
mapper: word_count_mapper
reducer: word_count_reducer
input_dir: ./input
output_dir: ./output
num_mappers: 2
num_reducers: 2
max_retries: 3
"""
    click.echo(example_config)
    click.echo("\n# Save this as job.yaml and run: mr submit job.yaml")


@cli.group()
def cluster():
    """集群管理命令"""
    pass


@cluster.command("status")
@click.option("--cluster-config", "-c", type=click.Path(exists=True), help="集群配置文件")
@click.option("--base-dir", default=DEFAULT_BASE_DIR, help="基础工作目录")
def cluster_status(cluster_config, base_dir):
    """查看集群节点状态"""
    state_dir = os.path.join(base_dir, "state")
    workers = get_cluster_config(cluster_config)

    if not workers:
        click.echo("No workers configured")
        return

    scheduler = RoundRobinScheduler(workers, state_dir)

    click.echo("Cluster Status:")
    click.echo("-" * 60)

    for worker in scheduler.workers:
        try:
            is_alive = worker.client.ping()
            status = "ALIVE" if is_alive else "DEAD"
            status_color = "green" if is_alive else "red"
        except Exception:
            status = "UNREACHABLE"
            status_color = "red"
            is_alive = False

        if worker.blacklisted:
            bl_status = click.style(f"BLACKLISTED ({worker.blacklist_reason})", fg="red")
        else:
            bl_status = click.style("OK", fg="green")

        click.echo(
            f"  {worker.address:25}  "
            f"{click.style(status, fg=status_color):15}  "
            f"Failures: {worker.consecutive_failures:3}  "
            f"{bl_status}"
        )

    click.echo("-" * 60)
    available = len(scheduler.get_available_workers())
    blacklisted = len(scheduler.get_blacklisted_workers())
    click.echo(f"Total: {len(workers)}  Available: {available}  Blacklisted: {blacklisted}")

    scheduler.stop()


@cluster.command("unblacklist")
@click.argument("worker_address")
@click.option("--cluster-config", "-c", type=click.Path(exists=True), help="集群配置文件")
@click.option("--base-dir", default=DEFAULT_BASE_DIR, help="基础工作目录")
def unblacklist_worker(worker_address, cluster_config, base_dir):
    """将节点从黑名单中移除"""
    state_dir = os.path.join(base_dir, "state")
    workers = get_cluster_config(cluster_config)

    scheduler = RoundRobinScheduler(workers, state_dir)

    if scheduler.unblacklist_worker(worker_address):
        click.echo(click.style(f"Worker {worker_address} removed from blacklist", fg="green"))
    else:
        click.echo(click.style(f"Failed to unblacklist {worker_address}. Worker not found or still unreachable.", fg="red"))

    scheduler.stop()


@cluster.command("blacklist")
@click.option("--cluster-config", "-c", type=click.Path(exists=True), help="集群配置文件")
@click.option("--base-dir", default=DEFAULT_BASE_DIR, help="基础工作目录")
def list_blacklisted(cluster_config, base_dir):
    """查看黑名单节点"""
    state_dir = os.path.join(base_dir, "state")
    workers = get_cluster_config(cluster_config)

    scheduler = RoundRobinScheduler(workers, state_dir)
    blacklisted = scheduler.get_blacklisted_workers()

    if not blacklisted:
        click.echo("No blacklisted workers")
    else:
        click.echo("Blacklisted Workers:")
        click.echo("-" * 60)
        for worker in blacklisted:
            click.echo(f"  {worker.address:25}  Reason: {worker.blacklist_reason}")
        click.echo("-" * 60)

    scheduler.stop()


if __name__ == "__main__":
    cli()
