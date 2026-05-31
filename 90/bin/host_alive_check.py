#!/usr/bin/env python3
import sys
import os
import argparse
from tabulate import tabulate

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import ConfigLoader, ResultArchiver, setup_logger
from core.ssh_client import BatchSSHExecutor

logger = setup_logger("host_alive")


def main():
    parser = argparse.ArgumentParser(description="主机存活探测工具")
    parser.add_argument("-g", "--group", help="服务器组名")
    parser.add_argument("-t", "--timeout", type=int, default=2, help="超时时间(秒)")
    parser.add_argument("--no-archive", action="store_true", help="不保存结果")
    parser.add_argument("-v", "--verbose", action="store_true", help="详细输出")
    args = parser.parse_args()

    if args.timeout < 1 or args.timeout > 60:
        logger.error("超时时间必须在1-60秒之间")
        return 1

    config = ConfigLoader()
    servers = config.get_servers(args.group) if args.group else config.servers
    
    if not servers:
        logger.error("未找到服务器配置")
        return 1

    logger.info(f"开始检测 {len(servers)} 台服务器存活状态...")
    
    executor = BatchSSHExecutor(servers, max_workers=config.get_global("max_workers", 20))
    results = executor.ping_all(timeout=args.timeout)
    
    table_data = []
    alive_count = 0
    for host, result in results.items():
        status = "✓ 在线" if result.get("alive") else "✗ 离线"
        latency = f"{result.get('latency', '-')}s" if result.get("latency") else "-"
        error = result.get("error", "")
        table_data.append([host, status, latency, error])
        if result.get("alive"):
            alive_count += 1

    print("\n" + tabulate(table_data, headers=["主机", "状态", "延迟", "错误"], tablefmt="grid"))
    print(f"\n总计: {len(servers)} 台, 在线: {alive_count} 台, 离线: {len(servers) - alive_count} 台")

    if not args.no_archive:
        archiver = ResultArchiver()
        filepath = archiver.save("host_alive", results, {
            "total": len(servers),
            "alive": alive_count,
            "offline": len(servers) - alive_count
        })
        logger.info(f"结果已归档: {filepath}")

    return 0 if alive_count == len(servers) else 2


if __name__ == "__main__":
    sys.exit(main())
