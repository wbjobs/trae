#!/usr/bin/env python3
import argparse
import sys
import time
from datetime import datetime, timedelta

from task_scheduler import TaskScheduler, TaskType


class ScheduleCLI:
    def __init__(self):
        self.parser = self._create_parser()
        self.scheduler = TaskScheduler()

    def _create_parser(self) -> argparse.ArgumentParser:
        parser = argparse.ArgumentParser(
            prog='ops-schedule',
            description='运维巡检任务定时调度工具',
            formatter_class=argparse.RawDescriptionHelpFormatter,
            epilog="""
示例:
  ops-schedule list                                    # 列出所有任务
  ops-schedule add --name "日常巡检" --type all -c config.yaml --interval 3600
  ops-schedule add --name "每小时日志检查" --type logs -c config.yaml --cron "0 * * * *"
  ops-schedule start                                   # 启动调度器
  ops-schedule run <task_id>                          # 立即执行任务
  ops-schedule cancel <task_id>                       # 取消任务
  ops-schedule remove <task_id>                       # 删除任务
  ops-schedule show <task_id>                         # 查看任务详情
            """
        )

        subparsers = parser.add_subparsers(dest='command', required=True,
                                         help='可用命令')

        list_parser = subparsers.add_parser('list', help='列出所有定时任务')
        list_parser.add_argument('--all', action='store_true',
                                help='显示所有任务（包括已完成/已取消的）')

        add_parser = subparsers.add_parser('add', help='添加定时任务')
        add_parser.add_argument('--name', required=True, help='任务名称')
        add_parser.add_argument('--type', required=True,
                               choices=['detect', 'inspect', 'logs', 'exec', 'all'],
                               help='任务类型')
        add_parser.add_argument('-c', '--config', required=True,
                               help='配置文件路径')
        add_parser.add_argument('--schedule', choices=['once', 'interval', 'cron'],
                               default='interval', help='调度方式')
        add_parser.add_argument('--interval', type=int, default=3600,
                               help='执行间隔（秒），interval模式下使用')
        add_parser.add_argument('--cron', help='Cron表达式，如 "0 * * * *"')
        add_parser.add_argument('--start-time', help='开始时间 (YYYY-MM-DD HH:MM:SS)')
        add_parser.add_argument('--end-time', help='结束时间 (YYYY-MM-DD HH:MM:SS)')
        add_parser.add_argument('--max-retries', type=int, default=0,
                               help='最大重试次数')
        add_parser.add_argument('--no-silent', action='store_true',
                               help='非静默模式')
        add_parser.add_argument('--no-save', action='store_true',
                               help='不保存输出')
        add_parser.add_argument('--output-dir', default='./output',
                               help='输出目录')

        start_parser = subparsers.add_parser('start', help='启动任务调度器')
        start_parser.add_argument('--daemon', action='store_true',
                                 help='后台守护进程模式运行')

        subparsers.add_parser('stop', help='停止任务调度器')

        run_parser = subparsers.add_parser('run', help='立即执行指定任务')
        run_parser.add_argument('task_id', help='任务ID')

        cancel_parser = subparsers.add_parser('cancel', help='取消指定任务')
        cancel_parser.add_argument('task_id', help='任务ID')

        remove_parser = subparsers.add_parser('remove', help='删除指定任务')
        remove_parser.add_argument('task_id', help='任务ID')

        show_parser = subparsers.add_parser('show', help='查看任务详情')
        show_parser.add_argument('task_id', help='任务ID')

        return parser

    def cmd_list(self, args) -> int:
        self.scheduler.print_task_list(show_all=args.all)
        return 0

    def cmd_add(self, args) -> int:
        task_type_map = {
            'detect': TaskType.DETECT,
            'inspect': TaskType.INSPECT,
            'logs': TaskType.LOGS,
            'exec': TaskType.EXEC,
            'all': TaskType.ALL
        }

        start_time = None
        if args.start_time:
            try:
                start_time = datetime.strptime(args.start_time, '%Y-%m-%d %H:%M:%S')
            except ValueError:
                print(f"错误: 开始时间格式错误，请使用 'YYYY-MM-DD HH:MM:SS' 格式")
                return 1

        end_time = None
        if args.end_time:
            try:
                end_time = datetime.strptime(args.end_time, '%Y-%m-%d %H:%M:%S')
            except ValueError:
                print(f"错误: 结束时间格式错误，请使用 'YYYY-MM-DD HH:MM:SS' 格式")
                return 1

        if args.schedule == 'cron' and not args.cron:
            print("错误: cron 调度方式必须指定 --cron 参数")
            return 1

        task = self.scheduler.add_task(
            name=args.name,
            task_type=task_type_map[args.type],
            config_path=args.config,
            schedule=args.schedule,
            interval_seconds=args.interval,
            cron_expression=args.cron,
            start_time=start_time,
            end_time=end_time,
            max_retries=args.max_retries,
            silent=not args.no_silent,
            save_output=not args.no_save,
            output_dir=args.output_dir
        )

        print(f"✓ 任务已添加:")
        print(f"  ID:       {task.id}")
        print(f"  名称:     {task.name}")
        print(f"  类型:     {task.task_type.value}")
        print(f"  调度:     {task.schedule}")
        if task.interval_seconds:
            print(f"  间隔:     {task.interval_seconds} 秒")
        if task.cron_expression:
            print(f"  Cron:     {task.cron_expression}")
        print(f"  下次执行: {task.next_run.strftime('%Y-%m-%d %H:%M:%S') if task.next_run else 'N/A'}")

        return 0

    def cmd_start(self, args) -> int:
        if args.daemon:
            try:
                import os
                pid = os.fork()
                if pid > 0:
                    print(f"调度器已在后台启动，PID: {pid}")
                    return 0
            except AttributeError:
                print("警告: 当前系统不支持fork，将在前台运行")
            except Exception as e:
                print(f"后台启动失败: {e}，将在前台运行")

        self.scheduler.start()
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n正在停止调度器...")
            self.scheduler.stop()
        
        return 0

    def cmd_stop(self, args) -> int:
        self.scheduler.stop()
        return 0

    def cmd_run(self, args) -> int:
        if self.scheduler.run_task_now(args.task_id):
            print(f"✓ 任务 {args.task_id} 已加入执行队列")
            return 0
        else:
            print(f"✗ 无法执行任务 {args.task_id}，任务不存在或正在运行")
            return 1

    def cmd_cancel(self, args) -> int:
        if self.scheduler.cancel_task(args.task_id):
            print(f"✓ 任务 {args.task_id} 已取消")
            return 0
        else:
            print(f"✗ 任务 {args.task_id} 不存在")
            return 1

    def cmd_remove(self, args) -> int:
        if self.scheduler.remove_task(args.task_id):
            print(f"✓ 任务 {args.task_id} 已删除")
            return 0
        else:
            print(f"✗ 任务 {args.task_id} 不存在")
            return 1

    def cmd_show(self, args) -> int:
        self.scheduler.print_task_details(args.task_id)
        return 0

    def run(self) -> int:
        args = self.parser.parse_args()

        commands = {
            'list': self.cmd_list,
            'add': self.cmd_add,
            'start': self.cmd_start,
            'stop': self.cmd_stop,
            'run': self.cmd_run,
            'cancel': self.cmd_cancel,
            'remove': self.cmd_remove,
            'show': self.cmd_show
        }

        handler = commands.get(args.command)
        if handler:
            return handler(args)

        self.parser.print_help()
        return 1


def main():
    cli = ScheduleCLI()
    sys.exit(cli.run())


if __name__ == '__main__':
    main()
