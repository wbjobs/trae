#!/usr/bin/env python3
import sys
import os
import time
import subprocess
import signal
from datetime import datetime
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core import ConfigLoader, setup_logger

logger = setup_logger("scheduler")


class CronScheduler:
    def __init__(self):
        self.config = ConfigLoader()
        self.running = True
        self.last_run = {}

    def parse_cron(self, cron_expr):
        parts = cron_expr.split()
        if len(parts) != 5:
            return None
        
        minute, hour, day, month, weekday = parts
        return {
            "minute": self._parse_field(minute, 0, 59),
            "hour": self._parse_field(hour, 0, 23),
            "day": self._parse_field(day, 1, 31),
            "month": self._parse_field(month, 1, 12),
            "weekday": self._parse_field(weekday, 0, 6)
        }

    def _parse_field(self, field, min_val, max_val):
        if field == "*":
            return set(range(min_val, max_val + 1))
        
        values = set()
        for part in field.split(","):
            if "/" in part:
                base, step = part.split("/")
                step = int(step)
                if base == "*":
                    base = min_val
                for v in range(int(base), max_val + 1, step):
                    values.add(v)
            elif "-" in part:
                start, end = part.split("-")
                for v in range(int(start), int(end) + 1):
                    values.add(v)
            else:
                values.add(int(part))
        return values

    def should_run(self, cron_expr, now):
        schedule = self.parse_cron(cron_expr)
        if not schedule:
            return False
        
        return (now.minute in schedule["minute"] and
                now.hour in schedule["hour"] and
                now.day in schedule["day"] and
                now.month in schedule["month"] and
                now.weekday() in schedule["weekday"])

    def execute_task(self, task):
        tool = task.get("tool")
        group = task.get("group")
        name = task.get("name", "unnamed")
        
        valid_tools = ["all", "alive", "process", "disk", "log", "permission", "resource", "selfheal"]
        if tool not in valid_tools:
            logger.error(f"无效的工具类型: {tool}")
            return
        
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cluster_inspect.py")
        if not os.path.exists(script_path):
            logger.error(f"主脚本不存在: {script_path}")
            return
        
        cmd = [sys.executable, script_path]
        
        if tool == "all":
            cmd.append("all")
            if group:
                cmd.extend(["-g", group])
        else:
            cmd.append(tool)
            if group:
                cmd.extend(["-g", group])
        
        logger.info(f"执行定时任务: {name}")
        logger.info(f"命令: {' '.join(cmd)}")
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, shell=False, timeout=300)
            if result.stdout:
                logger.info(f"输出:\n{result.stdout}")
            if result.stderr:
                logger.error(f"错误:\n{result.stderr}")
            logger.info(f"任务 {name} 完成，退出码: {result.returncode}")
        except subprocess.TimeoutExpired:
            logger.error(f"任务 {name} 执行超时")
        except Exception as e:
            logger.error(f"任务 {name} 执行失败: {str(e)}")

    def run(self):
        logger.info("定时任务调度器启动")
        
        def handle_signal(signum, frame):
            logger.info("收到停止信号，正在关闭...")
            self.running = False
        
        signal.signal(signal.SIGINT, handle_signal)
        signal.signal(signal.SIGTERM, handle_signal)
        
        while self.running:
            now = datetime.now().replace(second=0, microsecond=0)
            now_str = now.strftime("%Y-%m-%d %H:%M")
            
            self.config.load_schedules()
            
            for task in self.config.schedules:
                if not task.get("enabled", True):
                    continue
                
                name = task.get("name", "unnamed")
                cron_expr = task.get("cron", "")
                
                last_run_key = f"{name}_{now_str}"
                if last_run_key in self.last_run:
                    continue
                
                if self.should_run(cron_expr, now):
                    self.last_run[last_run_key] = True
                    self.execute_task(task)
            
            time.sleep(30)
        
        logger.info("定时任务调度器已停止")


def list_schedules():
    scheduler = CronScheduler()
    print("已配置的定时任务:")
    for task in scheduler.config.schedules:
        status = "启用" if task.get("enabled", True) else "禁用"
        print(f"  - {task.get('name', 'unnamed')}: {task.get('cron', '')} [{status}]")
        print(f"    工具: {task.get('tool')}, 组: {task.get('group', 'all')}")


def main():
    parser = argparse.ArgumentParser(description="定时巡检任务调度器")
    parser.add_argument("--list", action="store_true", help="列出所有定时任务")
    parser.add_argument("--run", help="立即执行指定任务")
    args = parser.parse_args()
    
    if args.list:
        list_schedules()
        return 0
    
    if args.run:
        scheduler = CronScheduler()
        for task in scheduler.config.schedules:
            if task.get("name") == args.run:
                scheduler.execute_task(task)
                return 0
        logger.error(f"未找到任务: {args.run}")
        return 1
    
    scheduler = CronScheduler()
    scheduler.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
