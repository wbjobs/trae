#!/usr/bin/env python3
import sys
import os
import argparse
from tabulate import tabulate

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import ConfigLoader, ResultArchiver, setup_logger
from core.ssh_client import BatchSSHExecutor, SSHClient

logger = setup_logger("permission_sync")


def build_sync_commands(rules, args):
    commands = []
    verify_targets = []
    
    if args.file and args.mode:
        commands.append(f'chmod {args.mode} "{args.file}"')
        if args.owner:
            commands.append(f'chown {args.owner} "{args.file}"')
        verify_targets.append(args.file)
    elif args.sync_from:
        sync_config = rules.get("sync_tasks", [])
        for task in sync_config:
            if task.get("name") == args.sync_from or args.sync_from == "all":
                for target in task.get("targets", []):
                    path = target.get("path", "")
                    if not path:
                        continue
                    mode = target.get("mode")
                    owner = target.get("owner")
                    recursive = target.get("recursive", True)
                    rec_flag = "-R" if recursive else ""
                    if mode:
                        commands.append(f'chmod {rec_flag} {mode} "{path}"')
                    if owner:
                        commands.append(f'chown {rec_flag} {owner} "{path}"')
                    verify_targets.append(path)
    else:
        sync_config = rules.get("sync_tasks", [])
        for task in sync_config:
            for target in task.get("targets", []):
                path = target.get("path", "")
                if not path:
                    continue
                mode = target.get("mode")
                owner = target.get("owner")
                recursive = target.get("recursive", True)
                rec_flag = "-R" if recursive else ""
                if mode:
                    commands.append(f'chmod {rec_flag} {mode} "{path}"')
                if owner:
                    commands.append(f'chown {rec_flag} {owner} "{path}"')
                verify_targets.append(path)
    
    verify_cmds = []
    for path in verify_targets:
        if path:
            verify_cmds.append(f'if [ -e "{path}" ]; then stat -c "%a %U %G %n" "{path}"; else echo "NOT_FOUND:{path}"; fi')
    
    verify_cmd = "; ".join(verify_cmds)
    
    if commands and verify_cmd:
        return "; ".join(commands) + "; " + verify_cmd
    elif commands:
        return "; ".join(commands)
    elif verify_cmd:
        return verify_cmd
    else:
        return "echo 'NO_TASKS_CONFIGURED'"


def main():
    parser = argparse.ArgumentParser(description="集群权限批量同步工具")
    parser.add_argument("-g", "--group", help="服务器组名")
    parser.add_argument("-f", "--file", help="指定文件/目录路径")
    parser.add_argument("-m", "--mode", help="权限模式 (如: 755)")
    parser.add_argument("-o", "--owner", help="所有者 (如: user:group)")
    parser.add_argument("--sync-from", help="从配置中读取同步任务名")
    parser.add_argument("--dry-run", action="store_true", help="仅预览不执行")
    parser.add_argument("--no-archive", action="store_true", help="不保存结果")
    args = parser.parse_args()

    config = ConfigLoader()
    servers = config.get_servers(args.group) if args.group else config.servers
    
    if not servers:
        logger.error("未找到服务器配置")
        return 1

    rules = config.get_rule("permission_sync") or {}
    
    command = build_sync_commands(rules, args)
    
    if args.dry_run:
        print("将执行的命令:")
        print(command)
        return 0

    logger.info(f"开始在 {len(servers)} 台服务器上同步权限...")
    
    executor = BatchSSHExecutor(servers, max_workers=config.get_global("max_workers", 10))
    results = executor.execute_on_all(command)
    
    table_data = []
    success_count = 0
    
    for host, result in results.items():
        details = []
        if not result.get("success", False):
            status = "失败"
            details.append(result.get("error", "未知错误"))
        else:
            status = "成功"
            success_count += 1
            output = result.get("output", "").strip()
            if output:
                details = output.split("\n")
        
        table_data.append([
            host, 
            status, 
            "\n".join(details) if details else "-"
        ])

    print("\n" + tabulate(table_data, headers=["主机", "状态", "执行结果"], tablefmt="grid"))
    print(f"\n总计: {len(servers)} 台, 成功: {success_count} 台, 失败: {len(servers) - success_count} 台")

    if not args.no_archive:
        archiver = ResultArchiver()
        filepath = archiver.save("permission_sync", results, {
            "total": len(servers),
            "success": success_count,
            "failed": len(servers) - success_count
        })
        logger.info(f"结果已归档: {filepath}")

    return 0 if success_count == len(servers) else 2


if __name__ == "__main__":
    sys.exit(main())
