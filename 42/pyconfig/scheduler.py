import schedule
import time
import threading
from typing import Callable, Dict, Any
from datetime import datetime

class SyncScheduler:
    def __init__(self):
        self.jobs: Dict[str, schedule.Job] = {}
        self.running = False
        self.thread = None
        self.stop_event = threading.Event()

    def add_job(self, task_name: str, schedule_expr: str, job_func: Callable):
        if task_name in self.jobs:
            self.remove_job(task_name)

        job = schedule.every()

        parts = schedule_expr.split()
        if len(parts) != 5:
            raise ValueError(f"Invalid cron expression: {schedule_expr}")

        minute, hour, day, month, weekday = parts

        if minute == '*':
            job = schedule.every().minute
        elif '/' in minute:
            interval = int(minute.split('/')[1])
            job = schedule.every(interval).minutes
        elif minute != '*':
            job = schedule.every().day.at(f"{int(hour):02d}:{int(minute):02d}")

        if day != '*':
            if '/' in day:
                interval = int(day.split('/')[1])
                job = schedule.every(interval).days
            else:
                job = schedule.every().day.at(f"{int(hour):02d}:{int(minute):02d}")

        if weekday != '*' and weekday != '?':
            try:
                weekday_num = int(weekday)
                if weekday_num == 0:
                    job = schedule.every().sunday
                elif 1 <= weekday_num <= 6:
                    weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
                    job = getattr(schedule.every(), weekdays[weekday_num])
            except:
                pass

        job.do(job_func)
        self.jobs[task_name] = job

    def remove_job(self, task_name: str):
        if task_name in self.jobs:
            schedule.cancel_job(self.jobs[task_name])
            del self.jobs[task_name]

    def clear_all(self):
        schedule.clear()
        self.jobs.clear()

    def run_pending(self):
        schedule.run_pending()

    def run_continuously(self, interval: int = 1):
        def run():
            self.running = True
            while not self.stop_event.is_set():
                self.run_pending()
                time.sleep(interval)
            self.running = False

        self.stop_event.clear()
        self.thread = threading.Thread(target=run, daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=5)

    def get_next_run(self, task_name: str = None):
        if task_name:
            if task_name in self.jobs:
                return self.jobs[task_name].next_run
            return None
        else:
            return schedule.next_run()

    def get_all_next_runs(self) -> Dict[str, datetime]:
        return {name: job.next_run for name, job in self.jobs.items() if job.next_run}

    def list_jobs(self) -> list:
        return list(self.jobs.keys())
