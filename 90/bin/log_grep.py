#!/usr/bin/env python3
import sys
import os
import argparse
from tabulate import tabulate

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import ConfigLoader, ResultArchiver, setup_logger
from core.ssh_client import BatchSSHExecutor

logger = setup_logger("log_grep")


def build_grep_command(rules, keywords=None):
    import re
    
    log_paths = rules.get("log_paths", ["/var/log/"])
    keywords = keywords or rules.get("keywords", ["error", "Error", "ERROR"])
    max_lines = rules.get("max_lines", 50)
    case_insensitive = rules.get("case_insensitive", True)
    include_gz = rules.get("include_gzip", False)
    
    escaped_keywords = []
    for kw in keywords:
        escaped = re.escape(kw)
        escaped_keywords.append(escaped)
    
    grep_opts = "-i" if case_insensitive else ""
    keyword_pattern = "|".join(escaped_keywords)
    
    commands = []
    for log_path in log_paths:
        if include_gz:
            cmd = f'if [ -f "{log_path}" ] || [ -d "{log_path}" ]; then '
            cmd += f'{{ find "{log_path}" -type f \\( -name "*.log" -o -name "*.gz" \\) -exec grep {grep_opts} -lE "{keyword_pattern}" {{}} 2>/dev/null | while read f; do if echo "$f" | grep -q "\.gz$"; then zgrep {grep_opts} -nE "{keyword_pattern}" "$f" 2>/dev/null | sed "s|^|$f:|"; else grep {grep_opts} -nE "{keyword_pattern}" "$f" 2>/dev/null; fi; done; }} 2>/dev/null | head -n {max_lines}'
        else:
            cmd = f'if [ -f "{log_path}" ] || [ -d "{log_path}" ]; then '
            cmd += f'grep {grep_opts} -rnE "{keyword_pattern}" --include="*.log" --include="*.txt" {log_path} 2>/dev/null | head -n {max_lines}; '
        cmd += "fi"
        commands.append(cmd)
    
    return "; ".join(commands)


def main():
    parser = argparse.ArgumentParser(description="日志关键词批量抓取工具")
    parser.add_argument("-g", "--group", help="服务器组名")
    parser.add_argument("-k", "--keyword", action="append", help="关键词(可多次)")
    parser.add_argument("-p", "--path", help="指定日志路径")
    parser.add_argument("-n", "--lines", type=int, help="最大显示行数")
    parser.add_argument("--script", help="自定义抓取脚本路径")
    parser.add_argument("--no-archive", action="store_true", help="不保存结果")
    args = parser.parse_args()

    config = ConfigLoader()
    servers = config.get_servers(args.group) if args.group else config.servers
    
    if not servers:
        logger.error("未找到服务器配置")
        return 1

    rules = config.get_rule("log_grep") or {}
    if args.path:
        rules["log_paths"] = [args.path]
    if args.keyword:
        rules["keywords"] = args.keyword
    if args.lines:
        rules["max_lines"] = args.lines
    
    if args.script:
        with open(args.script, "r") as f:
            command = f.read()
    else:
        command = build_grep_command(rules, args.keyword)

    logger.info(f"开始在 {len(servers)} 台服务器上抓取日志...")
    
    executor = BatchSSHExecutor(servers, max_workers=config.get_global("max_workers", 10))
    results = executor.execute_on_all(command)
    
    table_data = []
    match_count = 0
    
    for host, result in results.items():
        matches = []
        if not result.get("success", False):
            status = "连接失败"
            matches.append(result.get("error", "未知错误"))
        else:
            output = result.get("output", "").strip()
            if output:
                lines = output.split("\n")
                status = f"找到{len(lines)}条匹配"
                matches = lines[:10]
                match_count += len(lines)
            else:
                status = "无匹配"
        
        table_data.append([
            host, 
            status, 
            "\n".join(matches) if matches else "-"
        ])

    print("\n" + tabulate(table_data, headers=["主机", "状态", "匹配内容(前10条)"], tablefmt="grid"))
    print(f"\n总计: {len(servers)} 台, 匹配总数: {match_count} 条")

    if not args.no_archive:
        archiver = ResultArchiver()
        filepath = archiver.save("log_grep", results, {
            "total": len(servers),
            "matches": match_count
        })
        logger.info(f"结果已归档: {filepath}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
