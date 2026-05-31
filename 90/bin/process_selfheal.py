#!/usr/bin/env python3
import sys
import os
import argparse
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import ConfigLoader, ResultArchiver, setup_logger, Colors
from core.ssh_client import BatchSSHExecutor

logger = setup_logger("process_selfheal")


def build_check_and_heal_command(rules, process_name, dry_run=False):
    restart_cmd = rules.get("restart_commands", {}).get(process_name, f"systemctl restart {process_name}")
    check_cmd = f'pgrep -x "{process_name}" >/dev/null 2>&1'
    
    if dry_run:
        return f'{check_cmd} && echo "RUNNING:{process_name}" || echo "NEED_RESTART:{process_name}"'
    
    heal_script = f"""
if ! pgrep -x "{process_name}" >/dev/null 2>&1; then
    echo "HEALING:{process_name}:$(date +%s)"
    {restart_cmd} 2>&1
    sleep 2
    if pgrep -x "{process_name}" >/dev/null 2>&1; then
        echo "HEALED:{process_name}:SUCCESS"
    else
        echo "HEALED:{process_name}:FAILED"
    fi
else
    echo "RUNNING:{process_name}"
fi
"""
    return heal_script.strip()


def build_batch_heal_command(rules, dry_run=False):
    processes = rules.get("auto_heal_processes", [])
    commands = []
    
    for proc in processes:
        if isinstance(proc, dict):
            name = proc.get("name")
            restart_cmd = proc.get("restart_command", f"systemctl restart {name}")
        else:
            name = proc
            restart_cmd = rules.get("restart_commands", {}).get(name, f"systemctl restart {name}")
        
        if not name:
            continue
        
        if dry_run:
            check = f'pgrep -x "{name}" >/dev/null 2>&1 && echo "RUNNING:{name}" || echo "NEED_RESTART:{name}"'
            commands.append(check)
        else:
            heal = f"""
if ! pgrep -x "{name}" >/dev/null 2>&1; then
    echo "HEALING:{name}:$(date +%s)"
    {restart_cmd} 2>&1
    sleep 2
    if pgrep -x "{name}" >/dev/null 2>&1; then
        echo "HEALED:{name}:SUCCESS"
    else
        echo "HEALED:{name}:FAILED"
    fi
else
    echo "RUNNING:{name}"
fi
"""
            commands.append(heal.strip())
    
    return "; ".join(commands)


def parse_heal_output(output):
    results = {}
    
    for line in output.split("\n"):
        line = line.strip()
        if not line:
            continue
        
        if line.startswith("RUNNING:"):
            proc = line.split(":", 1)[1]
            results[proc] = {"status": "running", "action": "none"}
        elif line.startswith("NEED_RESTART:"):
            proc = line.split(":", 1)[1]
            results[proc] = {"status": "stopped", "action": "would_restart"}
        elif line.startswith("HEALING:"):
            parts = line.split(":")
            if len(parts) >= 2:
                proc = parts[1]
                results.setdefault(proc, {})["healing_started"] = True
        elif line.startswith("HEALED:"):
            parts = line.split(":")
            if len(parts) >= 3:
                proc = parts[1]
                result = parts[2]
                results.setdefault(proc, {})["status"] = "healed" if result == "SUCCESS" else "heal_failed"
                results[proc]["action"] = "restarted" if result == "SUCCESS" else "restart_failed"
    
    return results


def main():
    parser = argparse.ArgumentParser(description="集群异常进程自愈触发工具")
    parser.add_argument("-g", "--group", help="服务器组名")
    parser.add_argument("-p", "--process", help="指定要自愈的进程名")
    parser.add_argument("--all", action="store_true", help="自愈配置中所有进程")
    parser.add_argument("--dry-run", action="store_true", help="仅检测不执行重启")
    parser.add_argument("--restart-cmd", help="自定义重启命令")
    parser.add_argument("--no-archive", action="store_true", help="不保存结果")
    parser.add_argument("--no-color", action="store_true", help="禁用彩色输出")
    args = parser.parse_args()

    if args.no_color:
        Colors.disable()

    if not args.process and not args.all:
        parser.error("请指定 --process 或 --all 参数")
        return 1

    config = ConfigLoader()
    servers = config.get_servers(args.group) if args.group else config.servers
    
    if not servers:
        logger.error("未找到服务器配置")
        return 1

    rules = config.get_rule("process_selfheal") or config.get_rule("process_check") or {}
    
    if args.restart_cmd and args.process:
        rules.setdefault("restart_commands", {})[args.process] = args.restart_cmd

    logger.info(f"开始{'检测' if args.dry_run else '自愈'} {len(servers)} 台服务器进程...")
    
    if args.process:
        command = build_check_and_heal_command(rules, args.process, args.dry_run)
    else:
        command = build_batch_heal_command(rules, args.dry_run)

    executor = BatchSSHExecutor(servers, max_workers=config.get_global("max_workers", 10))
    results = executor.execute_on_all(command)
    
    parsed_results = {}
    healed_count = 0
    failed_count = 0
    running_count = 0
    
    for host, result in results.items():
        if not result.get("success", False):
            parsed_results[host] = {
                "success": False,
                "error": result.get("error", "连接失败")
            }
            failed_count += 1
            continue
        
        heal_results = parse_heal_output(result.get("output", ""))
        parsed_results[host] = {
            "success": True,
            "processes": heal_results
        }
        
        for proc, info in heal_results.items():
            if info.get("status") == "running":
                running_count += 1
            elif info.get("status") == "healed":
                healed_count += 1
            elif info.get("status") == "heal_failed":
                failed_count += 1
    
    action_text = "检测" if args.dry_run else "自愈"
    print(f"\n{Colors.header('='*70)}")
    print(f"{Colors.header(f'进程{action_text}结果报告')}  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{Colors.header('='*70)}\n")
    
    for host, info in parsed_results.items():
        if not info.get("success"):
            print(f"{Colors.error(f'[{host}]')} {Colors.fail('连接失败')}")
            print(f"  错误: {info.get('error')}\n")
            continue
        
        print(f"{Colors.info(f'[{host}]')}")
        if "processes" in info:
            for proc, proc_info in info["processes"].items():
                status = proc_info.get("status", "unknown")
                action = proc_info.get("action", "none")
                
                if status == "running":
                    status_text = Colors.success("运行中")
                elif status == "stopped":
                    status_text = Colors.warning("已停止")
                elif status == "healed":
                    status_text = Colors.success("已自愈")
                elif status == "heal_failed":
                    status_text = Colors.error("自愈失败")
                else:
                    status_text = Colors.info(status)
                
                action_text = ""
                if action == "would_restart":
                    action_text = Colors.warning(" (需重启)")
                elif action == "restarted":
                    action_text = Colors.success(" (已重启)")
                elif action == "restart_failed":
                    action_text = Colors.error(" (重启失败)")
                
                print(f"  {proc:<20} {status_text}{action_text}")
        print()
    
    print(f"{Colors.header('='*70)}")
    print(f"总计: {len(servers)} 台服务器")
    print(f"{Colors.success(f'运行中: {running_count} 个')}")
    if not args.dry_run:
        print(f"{Colors.success(f'已自愈: {healed_count} 个')}")
    print(f"{Colors.error(f'失败: {failed_count} 个')}")
    print(f"{Colors.header('='*70)}\n")

    if not args.no_archive:
        archiver = ResultArchiver()
        filepath = archiver.save("process_selfheal", parsed_results, {
            "dry_run": args.dry_run,
            "total_servers": len(servers),
            "running": running_count,
            "healed": healed_count,
            "failed": failed_count
        })
        logger.info(f"结果已归档: {filepath}")

    return 0 if failed_count == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
