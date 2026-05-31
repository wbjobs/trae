#!/usr/bin/env python3
import sys
import os
import argparse
import json
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import ConfigLoader, ResultArchiver, setup_logger, Colors, print_bar
from core.ssh_client import BatchSSHExecutor, SSHSessionPool, PooledSSHExecutor

logger = setup_logger("resource_monitor")


def get_os_type_command():
    return "uname -s 2>/dev/null || echo Linux"


def build_resource_commands(os_type="Linux"):
    if os_type == "Darwin":
        return build_macos_commands()
    elif os_type == "AIX":
        return build_aix_commands()
    else:
        return build_linux_commands()


def build_linux_commands():
    cmd = """
    echo "===CPU==="
    cat /proc/loadavg | awk '{print "LOAD1:"$1"\\nLOAD5:"$2"\\nLOAD15:"$3}'
    grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print "CPU_USAGE:"usage}'
    
    echo "===MEMORY==="
    free -m | awk '/Mem:/ {print "MEM_TOTAL:"$2"\\nMEM_USED:"$3"\\nMEM_FREE:"$4"\\nMEM_USAGE:"int($3/$2*100)}'
    free -m | awk '/Swap:/ {if($2>0) print "SWAP_USAGE:"int($3/$2*100); else print "SWAP_USAGE:0"}'
    
    echo "===DISK==="
    df -hP | awk 'NR>1 && $6!="tmpfs" && $6!="devtmpfs" {gsub(/%/,"",$5); print "DISK:"$6":"$5":"$4}'
    
    echo "===NETWORK==="
    cat /proc/net/dev | awk 'NR>2 {gsub(/:/,"",$1); print "NET:"$1":RX:"$2":TX:"$10}' | head -5
    
    echo "===PROCESS==="
    ps aux --sort=-%cpu | awk 'NR<=11 && NR>1 {print "TOPCPU:"$3":"$11}'
    ps aux --sort=-%mem | awk 'NR<=11 && NR>1 {print "TOPMEM:"$4":"$11}'
    
    echo "===FD==="
    sysctl fs.file-nr 2>/dev/null | awk '{print "FD_USED:"$1"\\nFD_MAX:"$3}' || echo "FD_INFO:N/A"
    
    echo "===TCP==="
    ss -s 2>/dev/null | grep TCP | awk '{print "TCP:"$2":"$3":"$4":"$5}' || netstat -s 2>/dev/null | grep -i tcp | head -2
    """
    return cmd.strip()


def build_macos_commands():
    cmd = """
    echo "===CPU==="
    uptime | awk -F'load averages: ' '{split($2,a,","); print "LOAD1:"a[1]"\\nLOAD5:"a[2]"\\nLOAD15:"a[3]}'
    top -l 1 | awk '/CPU usage/ {print "CPU_USAGE:"$3+$7}'
    
    echo "===MEMORY==="
    top -l 1 | awk '/PhysMem/ {print "MEM_INFO:"$0}'
    vm_stat | awk '/Pages free/ {free=$3} /Pages active/ {active=$3} /Pages inactive/ {inactive=$3} /Pages wired/ {wired=$3} END {total=free+active+inactive+wired; used=active+wired; print "MEM_USAGE:"int(used/total*100)}'
    
    echo "===DISK==="
    df -h | awk 'NR>1 && $9!~"^/" {next} NR>1 {gsub(/%/,"",$5); print "DISK:"$9":"$5":"$4}'
    
    echo "===NETWORK==="
    netstat -ib | awk 'NR>1 && $4>0 {print "NET:"$1":RX:"$4":TX:"$7}' | head -5
    
    echo "===PROCESS==="
    ps aux -r | awk 'NR<=11 && NR>1 {print "TOPCPU:"$3":"$11}'
    ps aux -m | awk 'NR<=11 && NR>1 {print "TOPMEM:"$4":"$11}'
    """
    return cmd.strip()


def build_aix_commands():
    cmd = """
    echo "===CPU==="
    uptime | awk -F'load average: ' '{split($2,a,","); print "LOAD1:"a[1]"\\nLOAD5:"a[2]"\\nLOAD15:"a[3]}'
    lparstat 1 1 | awk '%user/ {print "CPU_USAGE:"$2+$4}' | tail -1
    
    echo "===MEMORY==="
    svmon -G | awk '/memory/ {print "MEM_TOTAL:"$2"\\nMEM_USED:"$3"\\nMEM_FREE:"$4"\\nMEM_USAGE:"int($3/$2*100)}'
    
    echo "===DISK==="
    df -g | awk 'NR>1 {gsub(/%/,"",$4); print "DISK:"$7":"$4":"$3}'
    
    echo "===PROCESS==="
    ps aux | sort -rnk3 | awk 'NR<=11 && NR>1 {print "TOPCPU:"$3":"$11}'
    ps aux | sort -rnk4 | awk 'NR<=11 && NR>1 {print "TOPMEM:"$4":"$11}'
    """
    return cmd.strip()


def parse_resource_output(output, rules):
    metrics = {}
    warnings = []
    
    cpu_warn = rules.get("cpu_warning", 70)
    mem_warn = rules.get("memory_warning", 80)
    disk_warn = rules.get("disk_warning", 80)
    load_mult = rules.get("load_multiplier", 1.0)
    
    for line in output.split("\n"):
        line = line.strip()
        if not line or line.startswith("==="):
            continue
        
        if line.startswith("LOAD1:"):
            metrics["load_1"] = float(line.split(":")[1])
            cpu_cores = metrics.get("cpu_cores", 1)
            if metrics["load_1"] > cpu_cores * load_mult:
                warnings.append(f"1分钟负载过高: {metrics['load_1']}")
        elif line.startswith("LOAD5:"):
            metrics["load_5"] = float(line.split(":")[1])
        elif line.startswith("LOAD15:"):
            metrics["load_15"] = float(line.split(":")[1])
        elif line.startswith("CPU_USAGE:"):
            metrics["cpu_usage"] = float(line.split(":")[1])
            if metrics["cpu_usage"] > cpu_warn:
                warnings.append(f"CPU使用率过高: {metrics['cpu_usage']:.1f}%")
        
        elif line.startswith("MEM_TOTAL:"):
            metrics["mem_total_mb"] = int(line.split(":")[1])
        elif line.startswith("MEM_USED:"):
            metrics["mem_used_mb"] = int(line.split(":")[1])
        elif line.startswith("MEM_USAGE:"):
            metrics["mem_usage"] = float(line.split(":")[1])
            if metrics["mem_usage"] > mem_warn:
                warnings.append(f"内存使用率过高: {metrics['mem_usage']:.1f}%")
        elif line.startswith("SWAP_USAGE:"):
            metrics["swap_usage"] = float(line.split(":")[1])
            if metrics["swap_usage"] > 50:
                warnings.append(f"Swap使用率过高: {metrics['swap_usage']:.1f}%")
        
        elif line.startswith("DISK:"):
            parts = line.split(":")
            if len(parts) >= 4:
                mount = parts[1]
                usage = float(parts[2])
                free = parts[3]
                metrics.setdefault("disks", {})[mount] = {"usage": usage, "free": free}
                if usage > disk_warn:
                    warnings.append(f"磁盘{mount}使用率过高: {usage}%")
    
    metrics["warnings"] = warnings
    metrics["severity"] = "error" if len(warnings) >= 3 else ("warning" if warnings else "success")
    
    return metrics


def main():
    parser = argparse.ArgumentParser(description="服务器资源水位预警工具")
    parser.add_argument("-g", "--group", help="服务器组名")
    parser.add_argument("--cpu-warn", type=int, help="CPU预警阈值(%)")
    parser.add_argument("--mem-warn", type=int, help="内存预警阈值(%)")
    parser.add_argument("--disk-warn", type=int, help="磁盘预警阈值(%)")
    parser.add_argument("--no-color", action="store_true", help="禁用彩色输出")
    parser.add_argument("--no-archive", action="store_true", help="不保存结果")
    parser.add_argument("--use-pool", action="store_true", help="使用连接池复用会话")
    args = parser.parse_args()

    if args.no_color:
        Colors.disable()

    config = ConfigLoader()
    servers = config.get_servers(args.group) if args.group else config.servers
    
    if not servers:
        logger.error("未找到服务器配置")
        return 1

    rules = config.get_rule("resource_monitor") or {}
    if args.cpu_warn:
        rules["cpu_warning"] = args.cpu_warn
    if args.mem_warn:
        rules["memory_warning"] = args.mem_warn
    if args.disk_warn:
        rules["disk_warning"] = args.disk_warn

    logger.info(f"开始检测 {len(servers)} 台服务器资源水位...")
    
    if args.use_pool:
        pool = SSHSessionPool(max_idle_time=rules.get("session_idle_time", 300))
        executor = PooledSSHExecutor(servers, pool, max_workers=config.get_global("max_workers", 10))
        results = executor.execute_on_all(build_resource_commands())
        pool.close_all()
    else:
        executor = BatchSSHExecutor(servers, max_workers=config.get_global("max_workers", 10))
        results = executor.execute_on_all(build_resource_commands())
    
    parsed_results = {}
    warning_count = 0
    error_count = 0
    
    for host, result in results.items():
        if not result.get("success", False):
            parsed_results[host] = {
                "success": False,
                "error": result.get("error", "连接失败"),
                "severity": "error"
            }
            error_count += 1
            continue
        
        metrics = parse_resource_output(result.get("output", ""), rules)
        metrics["success"] = True
        parsed_results[host] = metrics
        
        if metrics["severity"] == "warning":
            warning_count += 1
        elif metrics["severity"] == "error":
            error_count += 1
    
    print(f"\n{Colors.header('='*70)}")
    print(f"{Colors.header('服务器资源水位检测报告')}  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{Colors.header('='*70)}\n")
    
    for host, metrics in parsed_results.items():
        if not metrics.get("success"):
            print(f"{Colors.error(f'[{host}]')} {Colors.fail('连接失败')}")
            print(f"  错误: {metrics.get('error')}\n")
            continue
        
        severity = metrics["severity"]
        status_text = "正常" if severity == "success" else ("警告" if severity == "warning" else "严重")
        color_status = Colors.level(status_text, severity)
        
        print(f"{Colors.info(f'[{host}]')} {color_status}")
        
        if "cpu_usage" in metrics:
            print(f"  CPU:  {print_bar(metrics['cpu_usage'])}")
        if "mem_usage" in metrics:
            print(f"  内存: {print_bar(metrics['mem_usage'])}")
        if "load_1" in metrics:
            print(f"  负载: {metrics['load_1']} / {metrics.get('load_5', 'N/A')} / {metrics.get('load_15', 'N/A')}")
        
        if "disks" in metrics:
            print(f"  磁盘:")
            for mount, disk_info in sorted(metrics["disks"].items()):
                print(f"    {mount:<20} {print_bar(disk_info['usage'])} ({disk_info['free']} 可用)")
        
        if metrics.get("warnings"):
            print(f"  {Colors.warning('警告项:')}")
            for w in metrics["warnings"]:
                print(f"    {Colors.warning('• ' + w)}")
        
        print()
    
    print(f"{Colors.header('='*70)}")
    print(f"总计: {len(servers)} 台, "
          f"{Colors.success(f'正常: {len(servers) - warning_count - error_count} 台')}, "
          f"{Colors.warning(f'警告: {warning_count} 台')}, "
          f"{Colors.error(f'异常: {error_count} 台')}")
    print(f"{Colors.header('='*70)}\n")

    if not args.no_archive:
        archiver = ResultArchiver()
        filepath = archiver.save("resource_monitor", parsed_results, {
            "total": len(servers),
            "normal": len(servers) - warning_count - error_count,
            "warning": warning_count,
            "error": error_count
        })
        logger.info(f"结果已归档: {filepath}")

    return 0 if error_count == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
