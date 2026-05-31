#!/usr/bin/env python3
import argparse
import sys
import os
from typing import Dict, List, Any
from colorama import Fore, Style

from inspection_config import InspectionConfig
from output_formatter import OutputFormatter
from node_detector import NodeDetector
from service_inspector import ServiceInspector
from log_capturer import LogCapturer
from batch_executor import BatchExecutor
from result_grader import ResultGrader
from report_exporter import ReportExporter
from interactive_cli import InteractiveCLI


class OpsCLI:
    def __init__(self):
        self.parser = self._create_parser()
        self.config = None
        self.formatter = None

    def _create_parser(self) -> argparse.ArgumentParser:
        parser = argparse.ArgumentParser(
            prog='ops-cli',
            description='多服务器集群运维巡检命令行工具',
            formatter_class=argparse.RawDescriptionHelpFormatter,
            epilog="""
示例:
  ops-cli wizard                                   # 交互式向导模式
  ops-cli detect -c config.yaml                    # 集群节点探测
  ops-cli inspect -c config.yaml                   # 服务状态巡检
  ops-cli logs -c config.yaml                      # 日志批量抓取
  ops-cli exec -c config.yaml "df -h"              # 批量执行命令
  ops-cli all -c config.yaml --export html         # 执行完整巡检并导出HTML报告
  ops-cli all -c config.yaml --grade --export all  # 启用智能评分并导出所有格式报告
            """
        )
        
        parser.add_argument('-c', '--config', default='config.yaml',
                          help='配置文件路径 (默认: config.yaml)')
        parser.add_argument('-o', '--output', default='table',
                          choices=['table', 'json', 'txt'],
                          help='输出格式 (默认: table)')
        parser.add_argument('-d', '--output-dir', default='./output',
                          help='输出目录 (默认: ./output)')
        parser.add_argument('--no-parallel', action='store_true',
                          help='禁用并行执行')
        parser.add_argument('--max-workers', type=int, default=10,
                          help='最大并行线程数 (默认: 10)')
        parser.add_argument('-s', '--silent', action='store_true',
                          help='静默模式，减少输出')
        parser.add_argument('--save', action='store_true',
                          help='保存结果到文件')
        parser.add_argument('--grade', action='store_true',
                          help='启用智能评分功能')
        parser.add_argument('--export', choices=['json', 'csv', 'html', 'markdown', 'md', 'all'],
                          help='导出巡检报告 (指定格式)')

        subparsers = parser.add_subparsers(dest='command', required=False,
                                         help='可用命令')

        wizard_parser = subparsers.add_parser('wizard', help='交互式向导模式')

        detect_parser = subparsers.add_parser('detect', help='集群节点探测')
        detect_parser.add_argument('--name', help='指定节点名称进行探测')

        inspect_parser = subparsers.add_parser('inspect', help='服务状态巡检')
        inspect_parser.add_argument('--service', help='指定服务名称进行巡检')

        logs_parser = subparsers.add_parser('logs', help='日志批量抓取')
        logs_parser.add_argument('--keyword', help='指定日志搜索关键词')
        logs_parser.add_argument('--lines', type=int, default=100,
                                help='抓取日志行数 (默认: 100)')
        logs_parser.add_argument('--type', choices=['tail', 'grep', 'count'],
                                default='tail', help='日志抓取类型')

        exec_parser = subparsers.add_parser('exec', help='批量执行命令')
        exec_parser.add_argument('cmd', nargs='+', help='要执行的命令')
        exec_parser.add_argument('--timeout', type=int, default=30,
                                help='命令超时时间(秒) (默认: 30)')
        exec_parser.add_argument('--sudo', action='store_true',
                                help='使用sudo执行命令')
        exec_parser.add_argument('--sudo-password', default=None,
                                help='sudo密码 (不安全，建议使用配置文件或交互式输入)')

        all_parser = subparsers.add_parser('all', help='执行所有巡检任务')

        return parser

    def _load_config(self, config_path: str) -> bool:
        self.config = InspectionConfig(config_path)
        return self.config.load_config(config_path)

    def _init_formatter(self, output_format: str, output_dir: str):
        self.formatter = OutputFormatter(output_format, output_dir)

    def cmd_detect(self, args) -> int:
        nodes = self.config.get_nodes()
        ssh_defaults = self.config.get_ssh_defaults()
        
        if args.name:
            node = self.config.get_node_by_name(args.name)
            if not node:
                print(f"错误: 未找到节点 '{args.name}'")
                return 1
            nodes = [node]
        
        if not nodes:
            print("错误: 配置文件中没有定义节点")
            return 1
        
        detector = NodeDetector(nodes, ssh_defaults)
        
        if not args.silent:
            print(f"\n开始探测 {len(nodes)} 个节点...")
        
        results = detector.detect_all(
            parallel=not args.no_parallel,
            max_workers=args.max_workers
        )
        
        summary = detector.get_summary()
        
        if not args.silent:
            table_data = []
            for r in results:
                status_icon = "✓" if r['status'] == 'success' else "✗"
                port_icon = "✓" if r.get('port_reachable', False) else "✗"
                table_data.append([
                    r['name'],
                    r['host'],
                    r['ip_address'],
                    port_icon,
                    r['os_type'],
                    status_icon,
                    r.get('hostname', '')[:30],
                    r.get('error', '')
                ])
            
            self.formatter.format_table(
                table_data,
                ['节点名称', '主机地址', 'IP地址', '端口可达', '系统类型', 'SSH状态', '主机名', '错误信息'],
                '节点探测结果'
            )
            
            self.formatter.print_summary(
                summary['total'],
                summary['success'],
                summary['failed']
            )
        
        if args.save:
            self.formatter.save_to_file(summary, 'node_detection')
        
        return 0 if summary['failed'] == 0 else 1

    def cmd_inspect(self, args) -> int:
        nodes = self.config.get_nodes()
        services = self.config.get_services()
        ssh_defaults = self.config.get_ssh_defaults()
        
        if args.service:
            services = [s for s in services if s.get('name') == args.service]
            if not services:
                print(f"错误: 未找到服务 '{args.service}'")
                return 1
        
        if not nodes:
            print("错误: 配置文件中没有定义节点")
            return 1
        
        if not services:
            print("错误: 配置文件中没有定义服务")
            return 1
        
        inspector = ServiceInspector(nodes, services, ssh_defaults)
        
        if not args.silent:
            print(f"\n开始巡检 {len(nodes)} 个节点的 {len(services)} 个服务...")
        
        results = inspector.inspect_all(
            parallel=not args.no_parallel,
            max_workers=args.max_workers
        )
        
        summary = inspector.get_summary()
        
        if not args.silent:
            for node_result in results:
                self.formatter.format_node_result(
                    node_result['node'],
                    {
                        '状态': node_result['status'] == 'success',
                        '系统类型': node_result['os_type'],
                        '错误': node_result.get('error', '')
                    }
                )
                
                for service in node_result.get('services', []):
                    self.formatter.format_service_result(
                        service['name'],
                        {
                            'status': service['status'],
                            'process': service.get('process', ''),
                            'port': service.get('port', 0),
                            'error': service.get('error', '')
                        }
                    )
            
            print(f"\n{'=' * 60}")
            print("服务巡检汇总")
            print(f"{'=' * 60}")
            print(f"  总节点数: {summary['total_nodes']}")
            print(f"  成功节点: {summary['successful_nodes']}")
            print(f"  失败节点: {summary['failed_nodes']}")
            print(f"  总服务数: {summary['total_services']}")
            print(f"  运行中: {summary['running_services']}")
            print(f"  已停止: {summary['stopped_services']}")
            if summary['warning_services'] > 0:
                print(f"  警告: {summary['warning_services']}")
            if summary['error_services'] > 0:
                print(f"  错误: {summary['error_services']}")
        
        if args.save:
            self.formatter.save_to_file(summary, 'service_inspection')
        
        has_errors = (summary['failed_nodes'] > 0 or 
                     summary['stopped_services'] > 0 or 
                     summary['error_services'] > 0)
        return 1 if has_errors else 0

    def cmd_logs(self, args) -> int:
        nodes = self.config.get_nodes()
        log_paths = self.config.get_log_paths()
        ssh_defaults = self.config.get_ssh_defaults()
        
        if args.keyword:
            for log_config in log_paths:
                log_config['keyword'] = args.keyword
                log_config['type'] = args.type
                log_config['lines'] = args.lines
        
        if not nodes:
            print("错误: 配置文件中没有定义节点")
            return 1
        
        if not log_paths:
            print("错误: 配置文件中没有定义日志路径")
            return 1
        
        capturer = LogCapturer(nodes, log_paths, ssh_defaults)
        
        if not args.silent:
            print(f"\n开始从 {len(nodes)} 个节点抓取日志...")
        
        results = capturer.capture_all(
            parallel=not args.no_parallel,
            max_workers=args.max_workers
        )
        
        summary = capturer.get_summary()
        
        if not args.silent:
            for node_result in results:
                print(f"\n{'─' * 60}")
                print(f"节点: {node_result['node']} ({node_result['host']})")
                print(f"状态: {'✓ 成功' if node_result['status'] == 'success' else '✗ 失败'}")
                if node_result.get('error'):
                    print(f"错误: {node_result['error']}")
                print(f"{'─' * 60}")
                
                for log in node_result.get('logs', []):
                    status = "✓" if log['success'] else "✗"
                    log_type = log.get('type', 'tail')
                    keyword = log.get('keyword', '')
                    
                    if log_type == 'count':
                        print(f"\n  {status} {log['path']} - 关键词 '{keyword}' 出现 {log.get('error_count', 0)} 次")
                    else:
                        print(f"\n  {status} {log['path']} ({log_type})")
                        if log.get('stacktraces'):
                            print(f"    发现 {len(log['stacktraces'])} 个异常栈")
                        if log['success'] and log['content']:
                            lines = log['content'].strip().split('\n')
                            display_lines = lines[:min(10, len(lines))]
                            for line in display_lines:
                                print(f"    {line[:100]}")
                            if len(lines) > 10:
                                print(f"    ... 共 {len(lines)} 行")
            
            print(f"\n{'=' * 60}")
            print("日志抓取汇总")
            print(f"{'=' * 60}")
            print(f"  总节点数: {summary['total_nodes']}")
            print(f"  成功节点: {summary['successful_nodes']}")
            print(f"  失败节点: {summary['failed_nodes']}")
            print(f"  总日志数: {summary['total_logs']}")
            print(f"  成功抓取: {summary['successful_logs']}")
            if summary['total_errors'] > 0:
                print(f"  错误总数: {summary['total_errors']}")
            if summary['total_stacktraces'] > 0:
                print(f"  异常栈数: {summary['total_stacktraces']}")
        
        if args.save:
            self.formatter.save_to_file(summary, 'log_capture')
        
        return 0 if summary['failed_nodes'] == 0 else 1

    def cmd_exec(self, args) -> int:
        nodes = self.config.get_nodes()
        ssh_defaults = self.config.get_ssh_defaults()
        
        if not nodes:
            print("错误: 配置文件中没有定义节点")
            return 1
        
        commands = [' '.join(args.cmd)]
        
        executor = BatchExecutor(nodes, ssh_defaults)
        
        results = executor.execute_all(
            commands,
            parallel=not args.no_parallel,
            max_workers=args.max_workers,
            timeout=args.timeout,
            silent=args.silent,
            use_sudo=args.sudo,
            sudo_password=args.sudo_password
        )
        
        summary = executor.get_summary()
        permission_errors = executor.get_permission_errors()
        
        if not args.silent:
            for node_result in results:
                print(f"\n{'─' * 60}")
                print(f"节点: {node_result['node']} ({node_result['host']})")
                print(f"状态: {'✓ 成功' if node_result['status'] == 'success' else '✗ 失败'}")
                if node_result.get('sudo_available'):
                    print(f"sudo可用: {'✓ 是' if node_result['sudo_available'] else '✗ 否'}")
                if node_result.get('error'):
                    print(f"错误: {node_result['error']}")
                print(f"{'─' * 60}")
                
                for cmd in node_result.get('commands', []):
                    status = "✓" if cmd['success'] else "✗"
                    print(f"\n  {status} 命令: {cmd['command']}")
                    if cmd.get('permission_error'):
                        print(f"    权限错误: {Fore.RED}{cmd['permission_error']}{Style.RESET_ALL}")
                    if cmd['stdout']:
                        print(f"    输出:")
                        for line in cmd['stdout'].strip().split('\n')[:20]:
                            print(f"      {line}")
                        if len(cmd['stdout'].strip().split('\n')) > 20:
                            print(f"      ... 更多输出已省略")
                    if cmd['stderr'] and not cmd.get('permission_error'):
                        print(f"    错误: {cmd['stderr']}")
            
            if permission_errors:
                print(f"\n{Fore.YELLOW}{'=' * 60}{Style.RESET_ALL}")
                print(f"{Fore.YELLOW}权限错误汇总 ({len(permission_errors)} 个){Style.RESET_ALL}")
                print(f"{Fore.YELLOW}{'=' * 60}{Style.RESET_ALL}")
                for pe in permission_errors:
                    print(f"  [{pe['node']}] {pe['command']}")
                    print(f"    错误: {pe['permission_error']}")
                    if not pe['sudo_available']:
                        print(f"    提示: 该节点sudo不可用")
        
        if args.save:
            self.formatter.save_to_file(summary, 'batch_execution')
        
        return 0 if summary['failed_nodes'] == 0 and summary['failed_commands'] == 0 else 1

    def cmd_all(self, args) -> int:
        print("\n" + "=" * 60)
        print("执行完整巡检流程")
        print("=" * 60)
        
        exit_code = 0
        
        print("\n[1/4] 节点探测...")
        detect_code = self.cmd_detect(args)
        exit_code = max(exit_code, detect_code)
        
        print("\n[2/4] 服务巡检...")
        inspect_code = self.cmd_inspect(args)
        exit_code = max(exit_code, inspect_code)
        
        print("\n[3/4] 日志抓取...")
        logs_code = self.cmd_logs(args)
        exit_code = max(exit_code, logs_code)
        
        print("\n[4/4] 基础信息采集...")
        args.cmd = ['uname -a', 'df -h', 'free -h']
        args.timeout = 30
        exec_code = self.cmd_exec(args)
        exit_code = max(exit_code, exec_code)
        
        print("\n" + "=" * 60)
        print("完整巡检完成")
        print("=" * 60)
        
        return exit_code

    def cmd_wizard(self, args) -> int:
        wizard = InteractiveCLI()
        config = wizard.wizard_main()
        
        new_args = self.parser.parse_args(wizard.build_args(config))
        
        commands = {
            'detect': self.cmd_detect,
            'inspect': self.cmd_inspect,
            'logs': self.cmd_logs,
            'exec': self.cmd_exec,
            'all': self.cmd_all
        }
        
        handler = commands.get(new_args.command)
        if handler:
            return handler(new_args)
        
        return 1

    def _process_grade_and_export(self, results: Dict[str, Any], args) -> None:
        grader = ResultGrader()
        exporter = ReportExporter(args.output_dir)
        
        grade = None
        if args.grade or args.export:
            grade = grader.grade_overall(results)
            if args.grade and not args.silent:
                grader.print_grade(grade, "巡检结果智能评分")
        
        if args.export:
            exporter.export(results, grade, fmt=args.export)

    def run(self) -> int:
        args = self.parser.parse_args()
        
        if not args.command:
            self.parser.print_help()
            return 1
        
        if args.command == 'wizard':
            self._load_config(args.config)
            self._init_formatter(args.output, args.output_dir)
            return self.cmd_wizard(args)
        
        if not self._load_config(args.config):
            print(f"错误: 无法加载配置文件 '{args.config}'")
            return 1
        
        self._init_formatter(args.output, args.output_dir)
        
        commands = {
            'detect': self.cmd_detect,
            'inspect': self.cmd_inspect,
            'logs': self.cmd_logs,
            'exec': self.cmd_exec,
            'all': self.cmd_all
        }
        
        handler = commands.get(args.command)
        if handler:
            exit_code = handler(args)
            
            if args.command in ['detect', 'inspect', 'logs', 'all'] and (args.grade or args.export):
                results = {}
                try:
                    if args.command == 'detect':
                        detector = NodeDetector(self.config.get_nodes(), self.config.get_ssh_defaults())
                        detector.detect_all(parallel=not args.no_parallel, max_workers=args.max_workers)
                        results['node_detection'] = detector.results
                    elif args.command == 'inspect':
                        inspector = ServiceInspector(self.config.get_nodes(), self.config.get_services(), self.config.get_ssh_defaults())
                        inspector.inspect_all(parallel=not args.no_parallel, max_workers=args.max_workers)
                        results['service_inspection'] = inspector.results
                    elif args.command == 'logs':
                        capturer = LogCapturer(self.config.get_nodes(), self.config.get_log_paths(), self.config.get_ssh_defaults())
                        capturer.capture_all(parallel=not args.no_parallel, max_workers=args.max_workers)
                        results['log_capture'] = capturer.results
                except:
                    pass
                
                self._process_grade_and_export(results, args)
            
            return exit_code
        
        self.parser.print_help()
        return 1


def main():
    cli = OpsCLI()
    sys.exit(cli.run())


if __name__ == '__main__':
    main()
