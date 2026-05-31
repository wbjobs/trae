#!/usr/bin/env python3
import sys
import os
import argparse
from tabulate import tabulate

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import ConfigLoader, ResultArchiver, setup_logger
from core.ssh_client import BatchSSHExecutor

logger = setup_logger("process_check")


def build_check_command(rules):
    process_names = rules.get("process_names", [])
    min_instances = rules.get("min_instances", 1)
    zombie_check = rules.get("check_zombie", True)
    exact_match = rules.get("exact_match", True)
    
    checks = []
    for proc in process_names:
        if exact_match:
            checks.append(f'count=$(pgrep -x "{proc}" 2>/dev/null | wc -l); if [ $count -lt {min_instances} ]; then echo "MISSING:{proc}:$count"; fi')
        else:
            checks.append(f'count=$(ps -eo comm= | grep -Fx "{proc}" | wc -l); if [ $count -lt {min_instances} ]; then echo "MISSING:{proc}:$count"; fi')
    
    if zombie_check:
        checks.append('zombies=$(ps -eo stat=,pid= | awk \'$1 ~ /Z/ {print $2}\' | wc -l); if [ $zombies -gt 0 ]; then echo "ZOMBIE:$zombies"; fi')
    
    return "; ".join(checks)


def main():
    parser = argparse.ArgumentParser(description="进程异常筛查工具")
    parser.add_argument("-g", "--group", help="服务器组名")
    parser.add_argument("-p", "--process", action="append", help="指定检查的进程名(可多次)")
    parser.add_argument("--script", help="自定义检查脚本路径")
    parser.add_argument("--no-archive", action="store_true", help="不保存结果")
    args = parser.parse_args()

    config = ConfigLoader()
    servers = config.get_servers(args.group) if args.group else config.servers
    
    if not servers:
        logger.error("未找到服务器配置")
        return 1

    rules = config.get_rule("process_check") or {}
    if args.process:
        rules["process_names"] = args.process
    
    if args.script:
        with open(args.script, "r") as f:
            command = f.read()
    else:
        command = build_check_command(rules)

    logger.info(f"开始检查 {len(servers)} 台服务器进程...")
    
    executor = BatchSSHExecutor(servers, max_workers=config.get_global("max_workers", 10))
    results = executor.execute_on_all(command)
    
    table_data = []
    issue_count = 0
    
    for host, result in results.items():
        issues = []
        if not result.get("success", False):
            status = "连接失败"
            issues.append(result.get("error", "未知错误"))
        else:
            output = result.get("output", "")
            for line in output.strip().split("\n"):
                if line.startswith("MISSING:"):
                    _, proc, count = line.split(":")
                    issues.append(f"进程缺失: {proc} (实际:{count})")
                elif line.startswith("ZOMBIE:"):
                    count = line.split(":")[1]
                    issues.append(f"僵尸进程: {count}个")
            
            status = "正常" if not issues else f"发现{len(issues)}个问题"
        
        if issues:
            issue_count += 1
        
        table_data.append([
            host, 
            status, 
            "\n".join(issues) if issues else "-"
        ])

    print("\n" + tabulate(table_data, headers=["主机", "状态", "异常详情"], tablefmt="grid"))
    print(f"\n总计: {len(servers)} 台, 异常: {issue_count} 台")

    if not args.no_archive:
        archiver = ResultArchiver()
        filepath = archiver.save("process_check", results, {
            "total": len(servers),
            "abnormal": issue_count
        })
        logger.info(f"结果已归档: {filepath}")

    return 0 if issue_count == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
