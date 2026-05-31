#!/usr/bin/env python3
import sys
import os
import argparse
from tabulate import tabulate

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import ConfigLoader, ResultArchiver, setup_logger
from core.ssh_client import BatchSSHExecutor

logger = setup_logger("disk_check")


def build_check_command(rules):
    threshold = rules.get("usage_threshold", 80)
    inode_threshold = rules.get("inode_threshold", 80)
    check_paths = rules.get("check_paths", ["/"])
    
    safe_paths = []
    for p in check_paths:
        safe_paths.append(f'"{p}"')
    path_filter = " ".join(safe_paths)
    
    command = f"df -hP {path_filter} 2>/dev/null | awk 'NR>1 {{print $1,$5,$6}}' | while read fs usage mount; do "
    command += f"used=${{usage%\\%}}; if [ $used -gt {threshold} ]; then echo \"SPACE_HIGH:$mount:$used%; fi; done; "
    command += f"df -iP {path_filter} 2>/dev/null | awk 'NR>1 {{print $1,$5,$6}}' | while read fs usage mount; do "
    command += f"used=${{usage%\\%}}; if [ $used -gt {inode_threshold} ]; then echo \"INODE_HIGH:$mount:$used%; fi; done"
    
    return command


def main():
    parser = argparse.ArgumentParser(description="磁盘负载巡检工具")
    parser.add_argument("-g", "--group", help="服务器组名")
    parser.add_argument("--threshold", type=int, help="磁盘使用率阈值(%)")
    parser.add_argument("--inode-threshold", type=int, help="inode使用率阈值(%)")
    parser.add_argument("--script", help="自定义检查脚本路径")
    parser.add_argument("--no-archive", action="store_true", help="不保存结果")
    args = parser.parse_args()

    config = ConfigLoader()
    servers = config.get_servers(args.group) if args.group else config.servers
    
    if not servers:
        logger.error("未找到服务器配置")
        return 1

    rules = config.get_rule("disk_check") or {}
    if args.threshold:
        rules["usage_threshold"] = args.threshold
    if args.inode_threshold:
        rules["inode_threshold"] = args.inode_threshold
    
    if args.script:
        with open(args.script, "r") as f:
            command = f.read()
    else:
        command = build_check_command(rules)

    logger.info(f"开始检查 {len(servers)} 台服务器磁盘...")
    
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
                if line.startswith("SPACE_HIGH:"):
                    _, mount, used = line.split(":")
                    issues.append(f"磁盘过高: {mount} {used}")
                elif line.startswith("INODE_HIGH:"):
                    _, mount, used = line.split(":")
                    issues.append(f"Inode过高: {mount} {used}")
            
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
        filepath = archiver.save("disk_check", results, {
            "total": len(servers),
            "abnormal": issue_count
        })
        logger.info(f"结果已归档: {filepath}")

    return 0 if issue_count == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
