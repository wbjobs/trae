#!/usr/bin/env python
"""
日志模式演化分析系统 - 主入口
支持日志解析、模式演化检测、时间线分析和 Sankey 图可视化
"""

import sys
import os
import argparse
from datetime import datetime, timedelta
from typing import List

from log_parser import NginxLogParser, ParsedLog
from storage import ClickHouseStorage
from evolution_detector import PatternEvolutionDetector
from analyzer import TimelineAnalyzer, ImpactAnalyzer, SankeyDataBuilder


def create_sample_logs(count: int = 1000) -> List[str]:
    sample_logs = []
    base_time = datetime(2024, 1, 15, 10, 0, 0)

    formats = [
        '192.168.1.{ip} - - [{time}] "{method} {path} HTTP/1.1" {status} {size} "{referer}" "{agent}"',
        '10.0.0.{ip} - admin [{time}] "{method} {path} HTTP/2.0" {status} {size} "-" "Mozilla/5.0" "192.168.1.1" 0.123 0.045',
        '172.16.{ip}.1 - - [{time}] "{method} /api/v1/data HTTP/1.1" {status} {size} "https://example.com" "curl/7.68.0"'
    ]

    statuses = [200, 200, 200, 200, 301, 304, 400, 404, 500]
    methods = ['GET', 'GET', 'GET', 'POST', 'PUT', 'DELETE']
    paths = ['/', '/index.html', '/api/users', '/api/products', '/static/css/main.css', '/static/js/app.js']
    sizes = [1024, 2048, 512, 4096, 128, 65536]
    referers = ['-', 'https://google.com', 'https://example.com', 'https://twitter.com']
    agents = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
              'curl/7.68.0',
              'PostmanRuntime/7.28.0']

    for i in range(count):
        fmt = formats[i % len(formats)]
        time_str = (base_time + timedelta(seconds=i)).strftime('%d/%b/%Y:%H:%M:%S +0000')

        log = fmt.format(
            ip=(i % 255) + 1,
            time=time_str,
            method=methods[i % len(methods)],
            path=paths[i % len(paths)],
            status=statuses[i % len(statuses)],
            size=sizes[i % len(sizes)],
            referer=referers[i % len(referers)],
            agent=agents[i % len(agents)]
        )
        sample_logs.append(log)

    return sample_logs


def create_sample_logs_with_changes(original_count: int = 500, changed_count: int = 500) -> List[str]:
    logs = []
    base_time = datetime(2024, 1, 15, 10, 0, 0)

    original_format = '192.168.1.{ip} - - [{time}] "GET /index.html HTTP/1.1" {status} {size} "-" "Mozilla/5.0"'
    new_field_format = '192.168.1.{ip} - - [{time}] "GET /index.html HTTP/1.1" {status} {size} "-" "Mozilla/5.0" "192.168.1.1" 0.123'

    statuses = [200, 200, 200, 304, 404]
    sizes = [1024, 2048, 512, 4096]

    for i in range(original_count):
        time_str = (base_time + timedelta(seconds=i)).strftime('%d/%b/%Y:%H:%M:%S +0000')
        log = original_format.format(
            ip=(i % 255) + 1,
            time=time_str,
            status=statuses[i % len(statuses)],
            size=sizes[i % len(sizes)]
        )
        logs.append(log)

    new_base_time = base_time + timedelta(seconds=original_count)
    for i in range(changed_count):
        time_str = (new_base_time + timedelta(seconds=i)).strftime('%d/%b/%Y:%H:%M:%S +0000')
        log = new_field_format.format(
            ip=(i % 255) + 1,
            time=time_str,
            status=statuses[i % len(statuses)],
            size=sizes[i % len(sizes)]
        )
        logs.append(log)

    return logs


def create_sample_logs_with_reorder() -> List[str]:
    logs = []
    base_time = datetime(2024, 1, 15, 10, 0, 0)

    original_format = '192.168.1.{ip} - - [{time}] "GET /index.html HTTP/1.1" {status} {size} "-" "Mozilla/5.0"'

    reordered_format = '- - 192.168.1.{ip} [{time}] "GET /index.html HTTP/1.1" {status} {size} "-" "Mozilla/5.0"'

    statuses = [200, 200, 200, 304, 404]
    sizes = [1024, 2048, 512, 4096]

    for i in range(500):
        time_str = (base_time + timedelta(seconds=i)).strftime('%d/%b/%Y:%H:%M:%S +0000')
        log = original_format.format(
            ip=(i % 255) + 1,
            time=time_str,
            status=statuses[i % len(statuses)],
            size=sizes[i % len(sizes)]
        )
        logs.append(log)

    new_base_time = base_time + timedelta(seconds=500)
    for i in range(500):
        time_str = (new_base_time + timedelta(seconds=i)).strftime('%d/%b/%Y:%H:%M:%S +0000')
        log = reordered_format.format(
            ip=(i % 255) + 1,
            time=time_str,
            status=statuses[i % len(statuses)],
            size=sizes[i % len(sizes)]
        )
        logs.append(log)

    return logs


def run_reorder_demo():
    print("=" * 60)
    print("  字段顺序变化检测 - 演示")
    print("=" * 60)

    parser = NginxLogParser()
    detector = PatternEvolutionDetector()

    print("\n[1] 生成包含字段顺序变化的日志数据...")
    print("    前 500 条: $remote_addr $remote_user $user [$time] ...")
    print("    后 500 条: $remote_user $user $remote_addr [$time] ...")
    sample_logs = create_sample_logs_with_reorder()
    print(f"    已生成 {len(sample_logs)} 条日志")

    print("\n[2] 解析前 500 条日志...")
    first_batch = []
    for line in sample_logs[:500]:
        parsed = parser.parse_line(line)
        if parsed.parse_success:
            first_batch.append(parsed)

    print(f"    成功解析 {len(first_batch)} 条")
    detector.process_batch(first_batch, "combined")
    changes1 = detector.detect_changes("combined")
    print(f"    初始检测变化: {len(changes1)} 个 (预期: 0)")

    print("\n[3] 解析后 500 条日志 (字段顺序已变化)...")
    second_batch = []
    for line in sample_logs[500:]:
        parsed = parser.parse_line(line)
        if parsed.parse_success:
            second_batch.append(parsed)

    print(f"    成功解析 {len(second_batch)} 条")
    detector.process_batch(second_batch, "combined")
    changes2 = detector.detect_changes("combined")

    print(f"\n[4] 变化检测结果:")
    print(f"    检测到变化总数: {len(changes2)}")

    for change in changes2:
        severity_icon = {'low': 'ℹ️', 'medium': '⚠️', 'high': '🔴'}.get(change.severity, '❓')
        print(f"    {severity_icon} [{change.change_type}] {change.field_name}")
        print(f"       严重程度: {change.severity}")
        print(f"       详情: {change.details}")

    if any(c.change_type == 'field_reordered' for c in changes2):
        print("\n    ✅ 成功: 字段顺序变化被正确识别为 'field_reordered' (低严重程度)")
        print("    ✅ 没有误报为 'field_removed' + 'field_added'")
    elif any(c.change_type in ['field_removed', 'field_added'] for c in changes2):
        print("\n    ⚠️ 注意: 字段顺序变化被误报为字段删除或新增")
    else:
        print("\n    ✅ 字段顺序变化未触发任何误报")

    print("\n" + "=" * 60)


def run_demo():
    print("=" * 60)
    print("  日志模式演化分析系统 - 演示模式")
    print("=" * 60)

    parser = NginxLogParser()
    detector = PatternEvolutionDetector()
    timeline = TimelineAnalyzer()
    impact = ImpactAnalyzer()
    sankey_builder = SankeyDataBuilder()

    print("\n[1] 生成示例日志数据 (1000 条)...")
    sample_logs = create_sample_logs_with_changes(500, 500)
    print(f"    已生成 {len(sample_logs)} 条日志")

    print("\n[2] 解析日志...")
    parsed_logs = []
    parse_success = 0
    parse_fail = 0

    for line in sample_logs:
        parsed = parser.parse_line(line)
        if parsed.parse_success:
            parse_success += 1
            parsed_logs.append(parsed)
        else:
            parse_fail += 1

    print(f"    解析成功: {parse_success} 条")
    print(f"    解析失败: {parse_fail} 条")

    print("\n[3] 处理第一批日志 (前 500 条)...")
    first_batch = parsed_logs[:500]
    detector.process_batch(first_batch, "combined")
    changes1 = detector.detect_changes("combined")
    print(f"    检测到变化: {len(changes1)} 个")

    print("\n[4] 处理第二批日志 (后 500 条, 包含新字段)...")
    second_batch = parsed_logs[500:]
    detector.process_batch(second_batch, "combined")
    changes2 = detector.detect_changes("combined")
    print(f"    检测到变化: {len(changes2)} 个")

    for change in changes2:
        print(f"      - [{change.change_type}] {change.field_name}: {change.details}")
        timeline.add_event({
            'event_time': change.timestamp,
            'change_type': change.change_type,
            'format_type': 'combined',
            'field_name': change.field_name,
            'old_value': change.old_value,
            'new_value': change.new_value,
            'affected_logs': change.affected_samples,
            'details': change.details
        })

    print("\n[5] 分析影响范围...")
    for log in parsed_logs[:100]:
        field_signature = parser.extract_field_signature(log)
        impact.analyze_log_entry(log.fields, field_signature)

    impact_summary = impact.get_impact_summary()
    print(f"    跟踪字段数: {impact_summary['total_fields_tracked']}")
    print(f"    高存在率字段: {impact_summary['high_presence_fields']}")
    print(f"    低存在率字段: {impact_summary['low_presence_fields']}")

    print("\n[6] 生成演化时间线...")
    timeline_data = timeline.get_timeline()
    for event in timeline_data:
        print(f"    [{event['time']}] {event['change_type_label']}: {event['field_name']}")

    print("\n[7] 生成 Sankey 图数据...")
    changes_for_sankey = [c.to_dict() for c in changes2]
    sankey_data = sankey_builder.build_from_changes(changes_for_sankey)
    print(f"    节点数: {len(sankey_data['nodes'])}")
    print(f"    连接数: {len(sankey_data['links'])}")

    print("\n[8] Schema 版本历史...")
    versions = detector.get_schema_versions()
    for version in versions:
        print(f"    v{version['version_number']}: {len(version['fields'])} 个字段 (样本数: {version['sample_count']})")

    print("\n" + "=" * 60)
    print("  演示完成! 启动 Web 服务器查看可视化界面:")
    print("  python app.py")
    print("=" * 60)


def run_server():
    import uvicorn
    print("启动 Web 服务器: http://localhost:8000")
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)


def main():
    parser = argparse.ArgumentParser(
        description="日志模式演化分析系统",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python main.py demo              # 运行演示模式
  python main.py server            # 启动 Web 服务器
  python main.py parse -f log.txt  # 解析日志文件
  python main.py detect            # 检测模式变化
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='可用命令')

    demo_parser = subparsers.add_parser('demo', help='运行演示模式')

    reorder_parser = subparsers.add_parser('reorder-demo', help='运行字段顺序变化检测演示')

    server_parser = subparsers.add_parser('server', help='启动 Web 服务器')

    parse_parser = subparsers.add_parser('parse', help='解析日志文件')
    parse_parser.add_argument('-f', '--file', required=True, help='日志文件路径')
    parse_parser.add_argument('-o', '--output', help='输出文件路径')
    parse_parser.add_argument('--format', default='auto', help='日志格式 (auto, combined, main, json)')

    detect_parser = subparsers.add_parser('detect', help='检测模式变化')

    analyze_parser = subparsers.add_parser('analyze', help='分析演化历史')
    analyze_parser.add_argument('--start', help='开始时间 (ISO格式)')
    analyze_parser.add_argument('--end', help='结束时间 (ISO格式)')

    args = parser.parse_args()

    if args.command == 'demo':
        run_demo()
    elif args.command == 'reorder-demo':
        run_reorder_demo()
    elif args.command == 'server':
        run_server()
    elif args.command == 'parse':
        run_parse(args)
    elif args.command == 'detect':
        run_detect()
    elif args.command == 'analyze':
        run_analyze(args)
    else:
        parser.print_help()


def run_parse(args):
    log_parser = NginxLogParser()

    if not os.path.exists(args.file):
        print(f"错误: 文件不存在 - {args.file}")
        sys.exit(1)

    print(f"解析日志文件: {args.file}")

    with open(args.file, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()

    print(f"读取 {len(lines)} 行日志")

    parsed_count = 0
    failed_count = 0
    format_types = set()

    output_lines = []

    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue

        parsed = log_parser.parse_line(line)
        if parsed.parse_success:
            parsed_count += 1
            format_types.add(parsed.format_type)

            if args.output:
                output_lines.append({
                    'timestamp': parsed.timestamp.isoformat() if parsed.timestamp else None,
                    'format_type': parsed.format_type,
                    'fields': parsed.fields
                })
        else:
            failed_count += 1

        if (i + 1) % 1000 == 0:
            print(f"  处理进度: {i + 1}/{len(lines)}")

    print(f"\n解析完成:")
    print(f"  成功: {parsed_count} 条")
    print(f"  失败: {failed_count} 条")
    print(f"  检测到的格式: {', '.join(format_types)}")

    if args.output and output_lines:
        with open(args.output, 'w', encoding='utf-8') as f:
            for line in output_lines:
                f.write(f"{line}\n")
        print(f"  输出文件: {args.output}")


def run_detect():
    print("检测模式变化...")
    print("提示: 请先通过 API 或 parse 命令导入日志数据")


def run_analyze(args):
    print("分析演化历史...")
    print("提示: 请先通过 Web 界面查看详细分析结果")


if __name__ == "__main__":
    main()
