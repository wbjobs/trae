#!/usr/bin/env python3
import sys
import os
import argparse
import subprocess
from tabulate import tabulate

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core import ConfigLoader, setup_logger

logger = setup_logger("cluster_inspect")

TOOL_MAP = {
    "alive": "bin/host_alive_check.py",
    "process": "bin/process_check.py",
    "disk": "bin/disk_check.py",
    "log": "bin/log_grep.py",
    "permission": "bin/permission_sync.py",
    "resource": "bin/resource_monitor.py",
    "selfheal": "bin/process_selfheal.py",
}

TOOL_DESC = {
    "alive": "主机存活探测",
    "process": "进程异常筛查",
    "disk": "磁盘负载巡检",
    "log": "日志关键词批量抓取",
    "permission": "集群权限批量同步",
    "resource": "服务器资源水位预警",
    "selfheal": "异常进程自愈触发",
}


def run_tool(tool_name, args):
    script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), TOOL_MAP[tool_name])
    if not os.path.exists(script_path):
        logger.error(f"工具脚本不存在: {script_path}")
        return 1
    
    safe_args = []
    for arg in args:
        if arg.startswith("-"):
            safe_args.append(arg)
        else:
            safe_args.append(arg)
    
    cmd = [sys.executable, script_path] + safe_args
    logger.info(f"执行: {' '.join(cmd)}")
    try:
        return subprocess.call(cmd, shell=False)
    except Exception as e:
        logger.error(f"执行工具失败: {str(e)}")
        return 1


def run_all(group=None):
    extra_args = ["-g", group] if group else []
    results = []
    
    for tool in TOOL_MAP:
        logger.info(f"\n{'='*50}")
        logger.info(f"开始执行: {TOOL_DESC[tool]}")
        logger.info(f"{'='*50}")
        ret = run_tool(tool, extra_args)
        results.append((TOOL_DESC[tool], "成功" if ret == 0 else "失败"))
    
    print("\n" + "="*50)
    print("全部巡检任务完成")
    print("="*50)
    print(tabulate(results, headers=["巡检项", "结果"], tablefmt="grid"))
    return 0


def show_status():
    config = ConfigLoader()
    servers = config.servers
    
    table_data = []
    for server in servers:
        table_data.append([
            server.get("name", "-"),
            server.get("host", "-"),
            server.get("port", 22),
            server.get("username", "-"),
            ", ".join(server.get("groups", []))
        ])
    
    print("\n已配置的服务器列表:")
    print(tabulate(table_data, headers=["名称", "主机", "端口", "用户名", "分组"], tablefmt="grid"))
    print(f"\n总计: {len(servers)} 台服务器")
    return 0


def show_schedules():
    config = ConfigLoader()
    schedules = config.schedules
    
    if not schedules:
        print("未配置定时任务")
        return 0
    
    table_data = []
    for sched in schedules:
        tool_name = TOOL_DESC.get(sched.get("tool", ""), sched.get("tool", "-"))
        table_data.append([
            sched.get("name", "-"),
            sched.get("cron", "-"),
            tool_name,
            sched.get("group", "-"),
            "启用" if sched.get("enabled", True) else "禁用"
        ])
    
    print("\n已配置的定时任务:")
    print(tabulate(table_data, headers=["名称", "Cron表达式", "巡检工具", "服务器组", "状态"], tablefmt="grid"))
    return 0


def show_adapters():
    config = ConfigLoader()
    import yaml
    adapters_file = os.path.join(config.config_dir, "os_adapters.yaml")
    
    if not os.path.exists(adapters_file):
        print("未找到系统适配配置文件")
        return 0
    
    with open(adapters_file, "r", encoding="utf-8") as f:
        adapters = yaml.safe_load(f) or {}
    
    table_data = []
    for os_key, adapter in adapters.items():
        table_data.append([
            os_key,
            adapter.get("name", "-"),
            adapter.get("parent", "-"),
            adapter.get("package_manager", "-")
        ])
    
    print("\n已支持的操作系统适配:")
    print(tabulate(table_data, headers=["系统标识", "名称", "父类", "包管理器"], tablefmt="grid"))
    return 0


def main():
    parser = argparse.ArgumentParser(description="服务器集群运维巡检工具集")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")
    
    for tool_name, desc in TOOL_DESC.items():
        tool_parser = subparsers.add_parser(tool_name, help=desc)
        tool_parser.add_argument("tool_args", nargs=argparse.REMAINDER, 
                                 help=f"传递给{desc}工具的参数")
    
    all_parser = subparsers.add_parser("all", help="执行全部巡检")
    all_parser.add_argument("-g", "--group", help="指定服务器组")
    
    subparsers.add_parser("status", help="查看服务器配置状态")
    subparsers.add_parser("schedules", help="查看定时任务配置")
    subparsers.add_parser("adapters", help="查看支持的操作系统适配")
    subparsers.add_parser("init", help="初始化配置文件")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    if args.command == "all":
        return run_all(args.group)
    elif args.command == "status":
        return show_status()
    elif args.command == "schedules":
        return show_schedules()
    elif args.command == "adapters":
        return show_adapters()
    elif args.command == "init":
        return init_config()
    elif args.command in TOOL_MAP:
        return run_tool(args.command, args.tool_args)
    
    return 0


def init_config():
    config_dir = "config"
    os.makedirs(config_dir, exist_ok=True)
    
    servers_file = os.path.join(config_dir, "servers.yaml")
    if not os.path.exists(servers_file):
        with open(servers_file, "w", encoding="utf-8") as f:
            f.write("servers:\n")
            f.write("  - name: server1\n")
            f.write("    host: 192.168.1.101\n")
            f.write("    port: 22\n")
            f.write("    username: root\n")
            f.write("    password: your_password\n")
            f.write("    groups: [web, production]\n")
            f.write("  - name: server2\n")
            f.write("    host: 192.168.1.102\n")
            f.write("    port: 22\n")
            f.write("    username: root\n")
            f.write("    key_file: /path/to/key.pem\n")
            f.write("    groups: [db, production]\n")
        print(f"已创建: {servers_file}")
    
    rules_file = os.path.join(config_dir, "inspection_rules.yaml")
    if not os.path.exists(rules_file):
        with open(rules_file, "w", encoding="utf-8") as f:
            f.write("process_check:\n")
            f.write("  process_names:\n")
            f.write("    - nginx\n")
            f.write("    - mysql\n")
            f.write("  min_instances: 1\n")
            f.write("  check_zombie: true\n")
            f.write("\ndisk_check:\n")
            f.write("  usage_threshold: 80\n")
            f.write("  inode_threshold: 80\n")
            f.write("  check_paths:\n")
            f.write("    - /\n")
            f.write("\nlog_grep:\n")
            f.write("  log_paths:\n")
            f.write("    - /var/log/\n")
            f.write("  keywords:\n")
            f.write("    - error\n")
            f.write("    - Error\n")
            f.write("    - ERROR\n")
            f.write("    - failed\n")
            f.write("    - warning\n")
            f.write("  max_lines: 50\n")
            f.write("  case_insensitive: true\n")
            f.write("\npermission_sync:\n")
            f.write("  sync_tasks:\n")
            f.write("    - name: web_config\n")
            f.write("      targets:\n")
            f.write("        - path: /etc/nginx/\n")
            f.write("          mode: '644'\n")
            f.write("          owner: root:root\n")
        print(f"已创建: {rules_file}")
    
    schedules_file = os.path.join(config_dir, "schedules.yaml")
    if not os.path.exists(schedules_file):
        with open(schedules_file, "w", encoding="utf-8") as f:
            f.write("schedules:\n")
            f.write("  - name: 每小时存活检测\n")
            f.write("    cron: \"0 * * * *\"\n")
            f.write("    tool: alive\n")
            f.write("    enabled: true\n")
            f.write("  - name: 每日凌晨全量巡检\n")
            f.write("    cron: \"0 2 * * *\"\n")
            f.write("    tool: all\n")
            f.write("    group: production\n")
            f.write("    enabled: true\n")
        print(f"已创建: {schedules_file}")
    
    global_file = os.path.join(config_dir, "global.yaml")
    if not os.path.exists(global_file):
        with open(global_file, "w", encoding="utf-8") as f:
            f.write("max_workers: 10\n")
            f.write("ssh_timeout: 10\n")
            f.write("log_retention_days: 30\n")
            f.write("archive_format: json\n")
        print(f"已创建: {global_file}")
    
    print("\n配置文件初始化完成，请根据实际情况修改配置。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
