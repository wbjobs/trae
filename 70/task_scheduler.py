import time
import threading
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field, asdict
from enum import Enum
import uuid


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskType(Enum):
    DETECT = "detect"
    INSPECT = "inspect"
    LOGS = "logs"
    EXEC = "exec"
    ALL = "all"


@dataclass
class ScheduledTask:
    id: str
    name: str
    task_type: TaskType
    config_path: str
    schedule: str
    cron_expression: Optional[str] = None
    interval_seconds: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    max_retries: int = 0
    current_retry: int = 0
    status: TaskStatus = TaskStatus.PENDING
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    last_result: Optional[Dict[str, Any]] = None
    silent: bool = True
    save_output: bool = True
    output_dir: str = "./output"
    created_at: datetime = field(default_factory=datetime.now)
    extra_args: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        for key in ['start_time', 'end_time', 'last_run', 'next_run', 'created_at']:
            if data.get(key):
                data[key] = data[key].isoformat()
        data['task_type'] = self.task_type.value
        data['status'] = self.status.value
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ScheduledTask':
        for key in ['start_time', 'end_time', 'last_run', 'next_run', 'created_at']:
            if data.get(key):
                data[key] = datetime.fromisoformat(data[key])
        data['task_type'] = TaskType(data['task_type'])
        data['status'] = TaskStatus(data['status'])
        return cls(**data)


class TaskScheduler:
    def __init__(self, tasks_file: str = "./tasks.json"):
        self.tasks_file = tasks_file
        self.tasks: Dict[str, ScheduledTask] = {}
        self.running = False
        self.scheduler_thread: Optional[threading.Thread] = None
        self.task_executors: Dict[str, threading.Thread] = {}
        self._load_tasks()

    def _load_tasks(self) -> None:
        if os.path.exists(self.tasks_file):
            try:
                with open(self.tasks_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for task_data in data:
                        task = ScheduledTask.from_dict(task_data)
                        self.tasks[task.id] = task
            except Exception as e:
                print(f"加载任务文件失败: {e}")

    def _save_tasks(self) -> None:
        try:
            os.makedirs(os.path.dirname(self.tasks_file) or '.', exist_ok=True)
            with open(self.tasks_file, 'w', encoding='utf-8') as f:
                json.dump([t.to_dict() for t in self.tasks.values()], f, 
                         ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"保存任务文件失败: {e}")

    def add_task(self, name: str, task_type: TaskType, config_path: str,
                 schedule: str = "interval", interval_seconds: int = 3600,
                 cron_expression: Optional[str] = None,
                 start_time: Optional[datetime] = None,
                 end_time: Optional[datetime] = None,
                 max_retries: int = 0, silent: bool = True,
                 save_output: bool = True, output_dir: str = "./output",
                 extra_args: Optional[List[str]] = None) -> ScheduledTask:
        task_id = str(uuid.uuid4())[:8]
        
        task = ScheduledTask(
            id=task_id,
            name=name,
            task_type=task_type,
            config_path=config_path,
            schedule=schedule,
            cron_expression=cron_expression,
            interval_seconds=interval_seconds,
            start_time=start_time,
            end_time=end_time,
            max_retries=max_retries,
            silent=silent,
            save_output=save_output,
            output_dir=output_dir,
            extra_args=extra_args or []
        )
        
        self.tasks[task_id] = task
        self._save_tasks()
        return task

    def remove_task(self, task_id: str) -> bool:
        if task_id in self.tasks:
            del self.tasks[task_id]
            self._save_tasks()
            return True
        return False

    def get_task(self, task_id: str) -> Optional[ScheduledTask]:
        return self.tasks.get(task_id)

    def list_tasks(self) -> List[ScheduledTask]:
        return list(self.tasks.values())

    def _calculate_next_run(self, task: ScheduledTask) -> Optional[datetime]:
        if task.end_time and datetime.now() > task.end_time:
            return None
        
        if task.schedule == "once":
            if task.last_run:
                return None
            return task.start_time or datetime.now()
        
        elif task.schedule == "interval":
            if not task.last_run:
                return task.start_time or datetime.now()
            return task.last_run + timedelta(seconds=task.interval_seconds or 3600)
        
        elif task.schedule == "cron" and task.cron_expression:
            return self._parse_cron(task.cron_expression)
        
        return None

    def _parse_cron(self, cron_expr: str) -> Optional[datetime]:
        try:
            parts = cron_expr.split()
            if len(parts) != 5:
                return None
            
            minute, hour, day, month, weekday = parts
            now = datetime.now()
            
            for i in range(60):
                next_time = now + timedelta(minutes=i)
                if (minute == '*' or int(minute) == next_time.minute) and \
                   (hour == '*' or int(hour) == next_time.hour) and \
                   (day == '*' or int(day) == next_time.day) and \
                   (month == '*' or int(month) == next_time.month) and \
                   (weekday == '*' or int(weekday) == next_time.weekday()):
                    return next_time.replace(second=0, microsecond=0)
        except:
            pass
        
        return None

    def _execute_task(self, task: ScheduledTask) -> None:
        try:
            task.status = TaskStatus.RUNNING
            task.last_run = datetime.now()
            self._save_tasks()
            
            cmd = [
                sys.executable, 'ops_cli.py',
                '-c', task.config_path,
                '-o', 'json',
                '-d', task.output_dir,
                '--save' if task.save_output else '',
                '-s' if task.silent else '',
                task.task_type.value
            ]
            
            cmd = [c for c in cmd if c]
            cmd.extend(task.extra_args)
            
            if not task.silent:
                print(f"[{task.id}] 执行任务: {task.name}")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=3600
            )
            
            task.last_result = {
                'returncode': result.returncode,
                'stdout': result.stdout[:5000] if len(result.stdout) > 5000 else result.stdout,
                'stderr': result.stderr[:5000] if len(result.stderr) > 5000 else result.stderr,
                'success': result.returncode == 0
            }
            
            if result.returncode == 0:
                task.status = TaskStatus.COMPLETED
                task.current_retry = 0
            else:
                if task.current_retry < task.max_retries:
                    task.current_retry += 1
                    task.status = TaskStatus.PENDING
                    if not task.silent:
                        print(f"[{task.id}] 任务失败，准备重试 ({task.current_retry}/{task.max_retries})")
                else:
                    task.status = TaskStatus.FAILED
            
        except subprocess.TimeoutExpired:
            task.last_result = {'success': False, 'error': '执行超时'}
            task.status = TaskStatus.FAILED
        except Exception as e:
            task.last_result = {'success': False, 'error': str(e)}
            task.status = TaskStatus.FAILED
        finally:
            task.next_run = self._calculate_next_run(task)
            self._save_tasks()
            
            if not task.silent:
                if task.status == TaskStatus.COMPLETED:
                    print(f"[{task.id}] 任务完成: {task.name}")
                elif task.status == TaskStatus.FAILED:
                    print(f"[{task.id}] 任务失败: {task.name}")

    def _scheduler_loop(self) -> None:
        while self.running:
            try:
                now = datetime.now()
                
                for task in self.tasks.values():
                    if task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
                        continue
                    
                    if task.start_time and now < task.start_time:
                        continue
                    
                    if task.end_time and now > task.end_time:
                        task.status = TaskStatus.CANCELLED
                        self._save_tasks()
                        continue
                    
                    if not task.next_run:
                        task.next_run = self._calculate_next_run(task)
                        self._save_tasks()
                    
                    if task.next_run and now >= task.next_run:
                        if task.id not in self.task_executors or not self.task_executors[task.id].is_alive():
                            executor_thread = threading.Thread(
                                target=self._execute_task,
                                args=(task,),
                                daemon=True
                            )
                            self.task_executors[task.id] = executor_thread
                            executor_thread.start()
                
                time.sleep(5)
                
            except Exception as e:
                print(f"调度器异常: {e}")
                time.sleep(5)

    def start(self) -> None:
        if self.running:
            return
        
        self.running = True
        self.scheduler_thread = threading.Thread(
            target=self._scheduler_loop,
            daemon=True
        )
        self.scheduler_thread.start()
        print("任务调度器已启动")

    def stop(self) -> None:
        self.running = False
        if self.scheduler_thread:
            self.scheduler_thread.join(timeout=5)
        print("任务调度器已停止")

    def run_task_now(self, task_id: str) -> bool:
        task = self.get_task(task_id)
        if not task:
            return False
        
        if task.id in self.task_executors and self.task_executors[task.id].is_alive():
            return False
        
        task.next_run = datetime.now()
        self._save_tasks()
        return True

    def cancel_task(self, task_id: str) -> bool:
        task = self.get_task(task_id)
        if not task:
            return False
        
        task.status = TaskStatus.CANCELLED
        task.next_run = None
        self._save_tasks()
        return True

    def print_task_list(self, show_all: bool = False) -> None:
        tasks = self.list_tasks()
        
        if not tasks:
            print("没有定时任务")
            return
        
        print(f"\n{'=' * 100}")
        print(f"{'ID':<10} {'名称':<20} {'类型':<10} {'状态':<12} {'下次执行':<25} {'上次执行':<25}")
        print(f"{'=' * 100}")
        
        for task in tasks:
            if not show_all and task.status in [TaskStatus.COMPLETED, TaskStatus.CANCELLED]:
                continue
            
            next_run = task.next_run.strftime('%Y-%m-%d %H:%M:%S') if task.next_run else 'N/A'
            last_run = task.last_run.strftime('%Y-%m-%d %H:%M:%S') if task.last_run else 'N/A'
            
            status_color = {
                TaskStatus.PENDING: '\033[93m',
                TaskStatus.RUNNING: '\033[94m',
                TaskStatus.COMPLETED: '\033[92m',
                TaskStatus.FAILED: '\033[91m',
                TaskStatus.CANCELLED: '\033[90m'
            }.get(task.status, '')
            
            print(f"{task.id:<10} {task.name:<20} {task.task_type.value:<10} "
                  f"{status_color}{task.status.value:<12}\033[0m "
                  f"{next_run:<25} {last_run:<25}")
        
        print(f"{'=' * 100}")
        print(f"共 {len(tasks)} 个任务")

    def print_task_details(self, task_id: str) -> None:
        task = self.get_task(task_id)
        if not task:
            print(f"任务 {task_id} 不存在")
            return
        
        print(f"\n{'=' * 60}")
        print(f"任务详情: {task.name}")
        print(f"{'=' * 60}")
        print(f"ID:           {task.id}")
        print(f"类型:         {task.task_type.value}")
        print(f"状态:         {task.status.value}")
        print(f"配置文件:     {task.config_path}")
        print(f"调度方式:     {task.schedule}")
        if task.interval_seconds:
            print(f"执行间隔:     {task.interval_seconds} 秒")
        if task.cron_expression:
            print(f"Cron表达式:   {task.cron_expression}")
        if task.start_time:
            print(f"开始时间:     {task.start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        if task.end_time:
            print(f"结束时间:     {task.end_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"最大重试:     {task.max_retries}")
        print(f"当前重试:     {task.current_retry}")
        print(f"静默模式:     {'是' if task.silent else '否'}")
        print(f"保存输出:     {'是' if task.save_output else '否'}")
        print(f"输出目录:     {task.output_dir}")
        print(f"创建时间:     {task.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
        if task.last_run:
            print(f"上次执行:     {task.last_run.strftime('%Y-%m-%d %H:%M:%S')}")
        if task.next_run:
            print(f"下次执行:     {task.next_run.strftime('%Y-%m-%d %H:%M:%S')}")
        
        if task.last_result:
            print(f"\n上次执行结果:")
            success = task.last_result.get('success', False)
            print(f"  成功:       {'是' if success else '否'}")
            if 'returncode' in task.last_result:
                print(f"  返回码:     {task.last_result['returncode']}")
            if 'error' in task.last_result:
                print(f"  错误:       {task.last_result['error']}")
            if 'stdout' in task.last_result and task.last_result['stdout']:
                print(f"  输出:       {task.last_result['stdout'][:200]}...")
        print(f"{'=' * 60}")
