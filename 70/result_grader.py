from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from enum import Enum


class SeverityLevel(Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


SEVERITY_CONFIG = {
    SeverityLevel.CRITICAL: {
        "color": "\033[91m",
        "icon": "🔴",
        "weight": 100,
        "description": "严重问题，需要立即处理"
    },
    SeverityLevel.HIGH: {
        "color": "\033[93m",
        "icon": "🟠",
        "weight": 75,
        "description": "高危问题，建议尽快处理"
    },
    SeverityLevel.MEDIUM: {
        "color": "\033[93m",
        "icon": "🟡",
        "weight": 50,
        "description": "中等问题，需要关注"
    },
    SeverityLevel.LOW: {
        "color": "\033[92m",
        "icon": "🟢",
        "weight": 25,
        "description": "轻微问题，可延后处理"
    },
    SeverityLevel.INFO: {
        "color": "\033[94m",
        "icon": "🔵",
        "weight": 10,
        "description": "信息提示，无需处理"
    }
}


@dataclass
class GradeResult:
    severity: SeverityLevel
    score: float
    issues: List[Dict[str, Any]] = field(default_factory=list)
    summary: str = ""


class ResultGrader:
    def __init__(self):
        self.rules = self._load_default_rules()

    def _load_default_rules(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "node_unreachable",
                "severity": SeverityLevel.CRITICAL,
                "condition": lambda r: r.get('status') == 'failed',
                "message": "节点无法访问"
            },
            {
                "name": "service_stopped",
                "severity": SeverityLevel.HIGH,
                "condition": lambda s: s.get('status') == 'stopped',
                "message": "服务已停止"
            },
            {
                "name": "service_warning",
                "severity": SeverityLevel.MEDIUM,
                "condition": lambda s: s.get('status') == 'warning',
                "message": "服务状态异常"
            },
            {
                "name": "port_not_listening",
                "severity": SeverityLevel.HIGH,
                "condition": lambda s: s.get('port_check') and not s['port_check'].get('listening', True),
                "message": "端口未监听"
            },
            {
                "name": "high_error_count",
                "severity": SeverityLevel.HIGH,
                "condition": lambda l: l.get('error_count', 0) > 100,
                "message": "日志错误数量过高"
            },
            {
                "name": "medium_error_count",
                "severity": SeverityLevel.MEDIUM,
                "condition": lambda l: 10 < l.get('error_count', 0) <= 100,
                "message": "存在一定数量的错误日志"
            },
            {
                "name": "stacktrace_found",
                "severity": SeverityLevel.HIGH,
                "condition": lambda l: len(l.get('stacktraces', [])) > 0,
                "message": "发现异常栈信息"
            },
            {
                "name": "log_capture_failed",
                "severity": SeverityLevel.MEDIUM,
                "condition": lambda l: not l.get('success', True),
                "message": "日志抓取失败"
            },
            {
                "name": "permission_error",
                "severity": SeverityLevel.MEDIUM,
                "condition": lambda c: c.get('permission_error') is not None,
                "message": "命令执行权限不足"
            },
            {
                "name": "command_failed",
                "severity": SeverityLevel.HIGH,
                "condition": lambda c: not c.get('success', True),
                "message": "命令执行失败"
            }
        ]

    def add_rule(self, name: str, severity: SeverityLevel, 
                 condition: callable, message: str) -> None:
        self.rules.append({
            "name": name,
            "severity": severity,
            "condition": condition,
            "message": message
        })

    def grade_node_detection(self, detection_results: List[Dict[str, Any]]) -> GradeResult:
        issues = []
        total_score = 100.0
        node_count = len(detection_results)
        
        if node_count == 0:
            return GradeResult(SeverityLevel.INFO, 100.0, [], "无节点数据")
        
        failed_nodes = 0
        for result in detection_results:
            if result.get('status') == 'failed':
                failed_nodes += 1
                issues.append({
                    "severity": SeverityLevel.CRITICAL,
                    "node": result.get('name', result.get('host', 'unknown')),
                    "message": f"节点无法访问: {result.get('error', '未知错误')}"
                })
                total_score -= SEVERITY_CONFIG[SeverityLevel.CRITICAL]['weight'] / node_count
        
        if failed_nodes == node_count:
            final_severity = SeverityLevel.CRITICAL
        elif failed_nodes > 0:
            final_severity = SeverityLevel.HIGH
        elif failed_nodes == 0:
            final_severity = SeverityLevel.INFO
        
        total_score = max(0, min(100, total_score))
        
        return GradeResult(
            severity=final_severity,
            score=total_score,
            issues=issues,
            summary=f"节点探测: {node_count - failed_nodes}/{node_count} 节点正常"
        )

    def grade_service_inspection(self, inspection_results: List[Dict[str, Any]]) -> GradeResult:
        issues = []
        total_score = 100.0
        total_services = 0
        failed_services = 0
        warning_services = 0
        
        for node_result in inspection_results:
            for service in node_result.get('services', []):
                total_services += 1
                status = service.get('status', 'unknown')
                
                if status == 'stopped':
                    failed_services += 1
                    issues.append({
                        "severity": SeverityLevel.HIGH,
                        "node": node_result.get('node', 'unknown'),
                        "service": service.get('name', 'unknown'),
                        "message": f"服务已停止"
                    })
                    total_score -= SEVERITY_CONFIG[SeverityLevel.HIGH]['weight'] / max(total_services, 1)
                elif status == 'warning':
                    warning_services += 1
                    issues.append({
                        "severity": SeverityLevel.MEDIUM,
                        "node": node_result.get('node', 'unknown'),
                        "service": service.get('name', 'unknown'),
                        "message": f"服务状态异常"
                    })
                    total_score -= SEVERITY_CONFIG[SeverityLevel.MEDIUM]['weight'] / max(total_services, 1)
        
        if total_services == 0:
            return GradeResult(SeverityLevel.INFO, 100.0, [], "无服务数据")
        
        if failed_services == total_services:
            final_severity = SeverityLevel.CRITICAL
        elif failed_services > 0:
            final_severity = SeverityLevel.HIGH
        elif warning_services > 0:
            final_severity = SeverityLevel.MEDIUM
        else:
            final_severity = SeverityLevel.INFO
        
        total_score = max(0, min(100, total_score))
        
        return GradeResult(
            severity=final_severity,
            score=total_score,
            issues=issues,
            summary=f"服务巡检: {total_services - failed_services - warning_services}/{total_services} 服务正常, "
                   f"{warning_services} 警告, {failed_services} 停止"
        )

    def grade_log_capture(self, log_results: List[Dict[str, Any]]) -> GradeResult:
        issues = []
        total_score = 100.0
        total_errors = 0
        total_stacktraces = 0
        failed_logs = 0
        total_logs = 0
        
        for node_result in log_results:
            for log in node_result.get('logs', []):
                total_logs += 1
                error_count = log.get('error_count', 0)
                stacktrace_count = len(log.get('stacktraces', []))
                
                total_errors += error_count
                total_stacktraces += stacktrace_count
                
                if not log.get('success', True):
                    failed_logs += 1
                    issues.append({
                        "severity": SeverityLevel.MEDIUM,
                        "node": node_result.get('node', 'unknown'),
                        "log_path": log.get('path', 'unknown'),
                        "message": f"日志抓取失败"
                    })
                    total_score -= SEVERITY_CONFIG[SeverityLevel.MEDIUM]['weight'] / max(total_logs, 1)
                
                if error_count > 100:
                    issues.append({
                        "severity": SeverityLevel.HIGH,
                        "node": node_result.get('node', 'unknown'),
                        "log_path": log.get('path', 'unknown'),
                        "message": f"错误日志数量过高: {error_count}"
                    })
                    total_score -= SEVERITY_CONFIG[SeverityLevel.HIGH]['weight'] / max(total_logs, 1)
                elif error_count > 10:
                    issues.append({
                        "severity": SeverityLevel.MEDIUM,
                        "node": node_result.get('node', 'unknown'),
                        "log_path": log.get('path', 'unknown'),
                        "message": f"存在一定数量错误: {error_count}"
                    })
                    total_score -= SEVERITY_CONFIG[SeverityLevel.MEDIUM]['weight'] / max(total_logs, 1)
                
                if stacktrace_count > 0:
                    issues.append({
                        "severity": SeverityLevel.HIGH,
                        "node": node_result.get('node', 'unknown'),
                        "log_path": log.get('path', 'unknown'),
                        "message": f"发现 {stacktrace_count} 个异常栈"
                    })
                    total_score -= SEVERITY_CONFIG[SeverityLevel.HIGH]['weight'] / max(total_logs, 1)
        
        if total_logs == 0:
            return GradeResult(SeverityLevel.INFO, 100.0, [], "无日志数据")
        
        if total_stacktraces > 0 or total_errors > 500:
            final_severity = SeverityLevel.HIGH
        elif total_errors > 50 or failed_logs > 0:
            final_severity = SeverityLevel.MEDIUM
        elif total_errors > 0:
            final_severity = SeverityLevel.LOW
        else:
            final_severity = SeverityLevel.INFO
        
        total_score = max(0, min(100, total_score))
        
        return GradeResult(
            severity=final_severity,
            score=total_score,
            issues=issues,
            summary=f"日志分析: 总错误 {total_errors}, 异常栈 {total_stacktraces}, 失败抓取 {failed_logs}"
        )

    def grade_batch_execution(self, exec_results: List[Dict[str, Any]]) -> GradeResult:
        issues = []
        total_score = 100.0
        total_commands = 0
        failed_commands = 0
        permission_errors = 0
        
        for node_result in exec_results:
            for cmd in node_result.get('commands', []):
                total_commands += 1
                
                if cmd.get('permission_error'):
                    permission_errors += 1
                    issues.append({
                        "severity": SeverityLevel.MEDIUM,
                        "node": node_result.get('node', 'unknown'),
                        "command": cmd.get('command', 'unknown'),
                        "message": f"权限错误: {cmd['permission_error']}"
                    })
                    total_score -= SEVERITY_CONFIG[SeverityLevel.MEDIUM]['weight'] / max(total_commands, 1)
                elif not cmd.get('success', True):
                    failed_commands += 1
                    issues.append({
                        "severity": SeverityLevel.HIGH,
                        "node": node_result.get('node', 'unknown'),
                        "command": cmd.get('command', 'unknown'),
                        "message": f"命令执行失败"
                    })
                    total_score -= SEVERITY_CONFIG[SeverityLevel.HIGH]['weight'] / max(total_commands, 1)
        
        if total_commands == 0:
            return GradeResult(SeverityLevel.INFO, 100.0, [], "无命令执行数据")
        
        if failed_commands == total_commands:
            final_severity = SeverityLevel.CRITICAL
        elif failed_commands > 0:
            final_severity = SeverityLevel.HIGH
        elif permission_errors > 0:
            final_severity = SeverityLevel.MEDIUM
        else:
            final_severity = SeverityLevel.INFO
        
        total_score = max(0, min(100, total_score))
        
        return GradeResult(
            severity=final_severity,
            score=total_score,
            issues=issues,
            summary=f"命令执行: {total_commands - failed_commands}/{total_commands} 成功, "
                   f"{permission_errors} 权限错误"
        )

    def grade_overall(self, results: Dict[str, Any]) -> GradeResult:
        all_issues = []
        total_score = 100.0
        category_scores = {}
        
        if 'node_detection' in results:
            grade = self.grade_node_detection(results['node_detection'])
            category_scores['node_detection'] = grade
            all_issues.extend(grade.issues)
            total_score *= (grade.score / 100.0)
        
        if 'service_inspection' in results:
            grade = self.grade_service_inspection(results['service_inspection'])
            category_scores['service_inspection'] = grade
            all_issues.extend(grade.issues)
            total_score *= (grade.score / 100.0)
        
        if 'log_capture' in results:
            grade = self.grade_log_capture(results['log_capture'])
            category_scores['log_capture'] = grade
            all_issues.extend(grade.issues)
            total_score *= (grade.score / 100.0)
        
        if 'batch_execution' in results:
            grade = self.grade_batch_execution(results['batch_execution'])
            category_scores['batch_execution'] = grade
            all_issues.extend(grade.issues)
            total_score *= (grade.score / 100.0)
        
        total_score = round(total_score, 2)
        
        if total_score >= 90:
            final_severity = SeverityLevel.INFO
        elif total_score >= 70:
            final_severity = SeverityLevel.LOW
        elif total_score >= 50:
            final_severity = SeverityLevel.MEDIUM
        elif total_score >= 25:
            final_severity = SeverityLevel.HIGH
        else:
            final_severity = SeverityLevel.CRITICAL
        
        critical_count = sum(1 for i in all_issues if i['severity'] == SeverityLevel.CRITICAL)
        high_count = sum(1 for i in all_issues if i['severity'] == SeverityLevel.HIGH)
        medium_count = sum(1 for i in all_issues if i['severity'] == SeverityLevel.MEDIUM)
        
        summary_parts = []
        if critical_count > 0:
            summary_parts.append(f"{critical_count} 个严重问题")
        if high_count > 0:
            summary_parts.append(f"{high_count} 个高危问题")
        if medium_count > 0:
            summary_parts.append(f"{medium_count} 个中等问题")
        
        summary = "整体健康度: " + ", ".join(summary_parts) if summary_parts else "整体健康度: 所有检查正常"
        
        return GradeResult(
            severity=final_severity,
            score=total_score,
            issues=all_issues,
            summary=summary
        )

    def format_severity(self, severity: SeverityLevel) -> str:
        config = SEVERITY_CONFIG.get(severity, SEVERITY_CONFIG[SeverityLevel.INFO])
        return f"{config['icon']} {config['color']}{severity.value}\033[0m"

    def print_grade(self, grade: GradeResult, title: str = "评分结果") -> None:
        config = SEVERITY_CONFIG[grade.severity]
        print(f"\n{'=' * 60}")
        print(f"{title}")
        print(f"{'=' * 60}")
        print(f"  等级: {config['icon']} {config['color']}{grade.severity.value}\033[0m")
        print(f"  得分: {grade.score:.1f}/100")
        print(f"  摘要: {grade.summary}")
        print(f"  说明: {config['description']}")
        
        if grade.issues:
            print(f"\n  发现 {len(grade.issues)} 个问题:")
            for issue in grade.issues[:10]:
                issue_config = SEVERITY_CONFIG[issue['severity']]
                node_info = issue.get('node', '')
                service_info = issue.get('service', '')
                log_info = issue.get('log_path', '')
                
                location = node_info
                if service_info:
                    location += f" -> {service_info}"
                if log_info:
                    location += f" -> {log_info}"
                
                print(f"    {issue_config['icon']} [{issue['severity'].value}] {location}: {issue['message']}")
            
            if len(grade.issues) > 10:
                print(f"    ... 还有 {len(grade.issues) - 10} 个问题未显示")
