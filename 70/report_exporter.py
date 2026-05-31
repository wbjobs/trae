import os
import json
import csv
from datetime import datetime
from typing import Dict, List, Any, Optional
from result_grader import ResultGrader, GradeResult, SeverityLevel, SEVERITY_CONFIG


class ReportExporter:
    def __init__(self, output_dir: str = "./output"):
        self.output_dir = output_dir
        self.grader = ResultGrader()
        self._ensure_output_dir()

    def _ensure_output_dir(self) -> None:
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)

    def _generate_filename(self, prefix: str, ext: str) -> str:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return os.path.join(self.output_dir, f"{prefix}_{timestamp}.{ext}")

    def export_json(self, results: Dict[str, Any], 
                   grade: Optional[GradeResult] = None,
                   filename: Optional[str] = None) -> str:
        if not filename:
            filename = self._generate_filename("inspection_report", "json")
        
        export_data = {
            'generated_at': datetime.now().isoformat(),
            'results': results,
        }
        
        if grade:
            export_data['grade'] = {
                'severity': grade.severity.value,
                'score': grade.score,
                'summary': grade.summary,
                'issues': [
                    {
                        'severity': i['severity'].value,
                        'node': i.get('node', ''),
                        'service': i.get('service', ''),
                        'log_path': i.get('log_path', ''),
                        'message': i['message']
                    } for i in grade.issues
                ]
            }
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)
        
        return filename

    def export_csv(self, results: Dict[str, Any],
                  grade: Optional[GradeResult] = None,
                  filename: Optional[str] = None) -> str:
        if not filename:
            filename = self._generate_filename("inspection_report", "csv")
        
        with open(filename, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.writer(f)
            
            writer.writerow(['运维巡检报告'])
            writer.writerow(['生成时间', datetime.now().strftime('%Y-%m-%d %H:%M:%S')])
            writer.writerow([])
            
            if 'node_detection' in results:
                writer.writerow(['【节点探测结果】'])
                writer.writerow(['节点名称', '主机地址', 'IP地址', '端口可达', '系统类型', 'SSH状态', '主机名', '错误信息'])
                for node in results['node_detection']:
                    writer.writerow([
                        node.get('name', ''),
                        node.get('host', ''),
                        node.get('ip_address', ''),
                        '是' if node.get('port_reachable', False) else '否',
                        node.get('os_type', ''),
                        '成功' if node.get('status') == 'success' else '失败',
                        node.get('hostname', ''),
                        node.get('error', '')
                    ])
                writer.writerow([])
            
            if 'service_inspection' in results:
                writer.writerow(['【服务巡检结果】'])
                writer.writerow(['节点', '服务名称', '状态', '进程', '端口', '错误信息'])
                for node_result in results['service_inspection']:
                    for service in node_result.get('services', []):
                        status_map = {'running': '运行中', 'stopped': '已停止', 
                                     'warning': '警告', 'error': '错误', 'unknown': '未知'}
                        writer.writerow([
                            node_result.get('node', ''),
                            service.get('name', ''),
                            status_map.get(service.get('status', 'unknown'), '未知'),
                            service.get('process', ''),
                            service.get('port', ''),
                            service.get('error', '')
                        ])
                writer.writerow([])
            
            if 'log_capture' in results:
                writer.writerow(['【日志分析结果】'])
                writer.writerow(['节点', '日志路径', '类型', '关键词', '错误数', '异常栈数', '状态'])
                for node_result in results['log_capture']:
                    for log in node_result.get('logs', []):
                        writer.writerow([
                            node_result.get('node', ''),
                            log.get('path', ''),
                            log.get('type', ''),
                            log.get('keyword', ''),
                            log.get('error_count', 0),
                            len(log.get('stacktraces', [])),
                            '成功' if log.get('success', False) else '失败'
                        ])
                writer.writerow([])
            
            if grade:
                writer.writerow(['【智能评分】'])
                writer.writerow(['健康度得分', f"{grade.score:.1f}/100"])
                writer.writerow(['风险等级', grade.severity.value])
                writer.writerow(['摘要', grade.summary])
                writer.writerow([])
                
                if grade.issues:
                    writer.writerow(['【问题列表】'])
                    writer.writerow(['严重程度', '节点', '服务', '日志路径', '问题描述'])
                    for issue in grade.issues:
                        writer.writerow([
                            issue['severity'].value,
                            issue.get('node', ''),
                            issue.get('service', ''),
                            issue.get('log_path', ''),
                            issue['message']
                        ])
        
        return filename

    def export_html(self, results: Dict[str, Any],
                   grade: Optional[GradeResult] = None,
                   filename: Optional[str] = None,
                   title: str = "集群运维巡检报告") -> str:
        if not filename:
            filename = self._generate_filename("inspection_report", "html")
        
        severity_colors = {
            'CRITICAL': '#dc2626',
            'HIGH': '#ea580c',
            'MEDIUM': '#ca8a04',
            'LOW': '#16a34a',
            'INFO': '#2563eb'
        }
        
        html_content = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Microsoft YaHei', Arial, sans-serif; background: #f5f5f5; padding: 20px; }}
        .container {{ max-width: 1400px; margin: 0 auto; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white; padding: 30px; border-radius: 10px; margin-bottom: 20px; }}
        .header h1 {{ font-size: 28px; margin-bottom: 10px; }}
        .header .time {{ opacity: 0.9; font-size: 14px; }}
        .summary {{ background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px;
                   box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        .summary-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }}
        .summary-item {{ background: #f8f9fa; padding: 15px; border-radius: 8px; 
                         border-left: 4px solid #667eea; }}
        .summary-item .label {{ color: #666; font-size: 12px; margin-bottom: 5px; }}
        .summary-item .value {{ font-size: 24px; font-weight: bold; color: #333; }}
        .grade-box {{ text-align: center; padding: 30px; }}
        .grade-score {{ font-size: 48px; font-weight: bold; }}
        .grade-severity {{ display: inline-block; padding: 5px 15px; border-radius: 20px; 
                           color: white; font-weight: bold; margin-top: 10px; }}
        .section {{ background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px;
                   box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        .section h2 {{ color: #333; margin-bottom: 15px; padding-bottom: 10px; 
                      border-bottom: 2px solid #667eea; }}
        table {{ width: 100%; border-collapse: collapse; }}
        th {{ background: #f8f9fa; padding: 12px; text-align: left; 
             border-bottom: 2px solid #e5e7eb; color: #374151; }}
        td {{ padding: 12px; border-bottom: 1px solid #e5e7eb; }}
        tr:hover {{ background: #f9fafb; }}
        .status-success {{ color: #16a34a; font-weight: bold; }}
        .status-failed {{ color: #dc2626; font-weight: bold; }}
        .status-warning {{ color: #ca8a04; font-weight: bold; }}
        .badge {{ display: inline-block; padding: 2px 8px; border-radius: 10px; 
                 font-size: 12px; color: white; }}
        .issues-list {{ list-style: none; }}
        .issues-list li {{ padding: 10px; border-left: 4px solid; margin-bottom: 10px; 
                          background: #f9fafb; border-radius: 0 5px 5px 0; }}
        .issues-list .severity {{ font-weight: bold; margin-right: 10px; }}
        .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{title}</h1>
            <div class="time">生成时间: {datetime.now().strftime('%Y年%m月%d日 %H:%M:%S')}</div>
        </div>
"""
        
        if grade:
            severity_color = severity_colors.get(grade.severity.value, '#666')
            html_content += f"""
        <div class="summary">
            <div class="grade-box">
                <div class="grade-score" style="color: {severity_color}">{grade.score:.1f}</div>
                <div class="grade-severity" style="background-color: {severity_color}">
                    {grade.severity.value}
                </div>
                <div style="margin-top: 15px; color: #666;">{grade.summary}</div>
            </div>
        </div>
"""
        
        if 'node_detection' in results:
            nodes = results['node_detection']
            total_nodes = len(nodes)
            success_nodes = sum(1 for n in nodes if n.get('status') == 'success')
            html_content += f"""
        <div class="section">
            <h2>节点探测 ({success_nodes}/{total_nodes} 正常)</h2>
            <table>
                <tr>
                    <th>节点名称</th>
                    <th>主机地址</th>
                    <th>IP地址</th>
                    <th>端口可达</th>
                    <th>系统类型</th>
                    <th>SSH状态</th>
                    <th>主机名</th>
                </tr>
"""
            for node in nodes:
                status_class = 'status-success' if node.get('status') == 'success' else 'status-failed'
                port_status = '是' if node.get('port_reachable', False) else '否'
                port_class = 'status-success' if node.get('port_reachable', False) else 'status-failed'
                html_content += f"""
                <tr>
                    <td>{node.get('name', '')}</td>
                    <td>{node.get('host', '')}</td>
                    <td>{node.get('ip_address', '')}</td>
                    <td class="{port_class}">{port_status}</td>
                    <td>{node.get('os_type', '')}</td>
                    <td class="{status_class}">{'成功' if node.get('status') == 'success' else '失败'}</td>
                    <td>{node.get('hostname', '')}</td>
                </tr>
"""
            html_content += "            </table>\n        </div>"
        
        if 'service_inspection' in results:
            total_services = 0
            running_services = 0
            for node_result in results['service_inspection']:
                for s in node_result.get('services', []):
                    total_services += 1
                    if s.get('status') == 'running':
                        running_services += 1
            
            html_content += f"""
        <div class="section">
            <h2>服务巡检 ({running_services}/{total_services} 运行中)</h2>
            <table>
                <tr>
                    <th>节点</th>
                    <th>服务名称</th>
                    <th>状态</th>
                    <th>进程</th>
                    <th>端口</th>
                </tr>
"""
            status_map = {'running': ('运行中', 'status-success'), 
                         'stopped': ('已停止', 'status-failed'),
                         'warning': ('警告', 'status-warning'),
                         'error': ('错误', 'status-failed'),
                         'unknown': ('未知', '')}
            
            for node_result in results['service_inspection']:
                for service in node_result.get('services', []):
                    status_text, status_class = status_map.get(service.get('status', 'unknown'), ('未知', ''))
                    html_content += f"""
                <tr>
                    <td>{node_result.get('node', '')}</td>
                    <td>{service.get('name', '')}</td>
                    <td class="{status_class}">{status_text}</td>
                    <td>{service.get('process', '')}</td>
                    <td>{service.get('port', '')}</td>
                </tr>
"""
            html_content += "            </table>\n        </div>"
        
        if 'log_capture' in results:
            total_errors = 0
            total_stacktraces = 0
            for node_result in results['log_capture']:
                for log in node_result.get('logs', []):
                    total_errors += log.get('error_count', 0)
                    total_stacktraces += len(log.get('stacktraces', []))
            
            html_content += f"""
        <div class="section">
            <h2>日志分析 ({total_errors} 个错误, {total_stacktraces} 个异常栈)</h2>
            <table>
                <tr>
                    <th>节点</th>
                    <th>日志路径</th>
                    <th>类型</th>
                    <th>关键词</th>
                    <th>错误数</th>
                    <th>异常栈数</th>
                    <th>状态</th>
                </tr>
"""
            for node_result in results['log_capture']:
                for log in node_result.get('logs', []):
                    status_class = 'status-success' if log.get('success', False) else 'status-failed'
                    html_content += f"""
                <tr>
                    <td>{node_result.get('node', '')}</td>
                    <td>{log.get('path', '')}</td>
                    <td>{log.get('type', '')}</td>
                    <td>{log.get('keyword', '')}</td>
                    <td>{log.get('error_count', 0)}</td>
                    <td>{len(log.get('stacktraces', []))}</td>
                    <td class="{status_class}">{'成功' if log.get('success', False) else '失败'}</td>
                </tr>
"""
            html_content += "            </table>\n        </div>"
        
        if grade and grade.issues:
            html_content += f"""
        <div class="section">
            <h2>问题列表 (共 {len(grade.issues)} 个问题)</h2>
            <ul class="issues-list">
"""
            for issue in grade.issues[:50]:
                severity_color = severity_colors.get(issue['severity'].value, '#666')
                location = issue.get('node', '')
                if issue.get('service'):
                    location += f" → {issue['service']}"
                if issue.get('log_path'):
                    location += f" → {issue['log_path']}"
                
                html_content += f"""
                <li style="border-color: {severity_color}">
                    <span class="severity" style="color: {severity_color}">[{issue['severity'].value}]</span>
                    <span style="color: #666;">{location}:</span>
                    {issue['message']}
                </li>
"""
            if len(grade.issues) > 50:
                html_content += f"                <li style=\"border-color: #999;\">... 还有 {len(grade.issues) - 50} 个问题未显示</li>\n"
            
            html_content += "            </ul>\n        </div>"
        
        html_content += """
        <div class="footer">
            本报告由运维巡检工具自动生成 | 生成时间: """ + datetime.now().strftime('%Y-%m-%d %H:%M:%S') + """
        </div>
    </div>
</body>
</html>"""
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        return filename

    def export_markdown(self, results: Dict[str, Any],
                       grade: Optional[GradeResult] = None,
                       filename: Optional[str] = None,
                       title: str = "集群运维巡检报告") -> str:
        if not filename:
            filename = self._generate_filename("inspection_report", "md")
        
        md_content = f"# {title}\n\n"
        md_content += f"> 生成时间: {datetime.now().strftime('%Y年%m月%d日 %H:%M:%S')}\n\n"
        
        if grade:
            severity_emoji = SEVERITY_CONFIG[grade.severity]['icon']
            md_content += "## 📊 健康度评分\n\n"
            md_content += f"- **得分**: {grade.score:.1f}/100\n"
            md_content += f"- **风险等级**: {severity_emoji} {grade.severity.value}\n"
            md_content += f"- **摘要**: {grade.summary}\n\n"
        
        if 'node_detection' in results:
            nodes = results['node_detection']
            total = len(nodes)
            success = sum(1 for n in nodes if n.get('status') == 'success')
            md_content += f"## 🖥️ 节点探测 ({success}/{total} 正常)\n\n"
            md_content += "| 节点名称 | 主机地址 | IP地址 | 端口可达 | 系统类型 | SSH状态 | 主机名 |\n"
            md_content += "|---------|---------|--------|---------|---------|---------|-------|\n"
            for node in nodes:
                port_status = "✓" if node.get('port_reachable', False) else "✗"
                ssh_status = "✓" if node.get('status') == 'success' else "✗"
                md_content += f"| {node.get('name', '')} | {node.get('host', '')} | {node.get('ip_address', '')} | {port_status} | {node.get('os_type', '')} | {ssh_status} | {node.get('hostname', '')} |\n"
            md_content += "\n"
        
        if 'service_inspection' in results:
            total_services = 0
            running = 0
            for nr in results['service_inspection']:
                for s in nr.get('services', []):
                    total_services += 1
                    if s.get('status') == 'running':
                        running += 1
            
            md_content += f"## 🔧 服务巡检 ({running}/{total_services} 运行中)\n\n"
            md_content += "| 节点 | 服务名称 | 状态 | 进程 | 端口 |\n"
            md_content += "|------|---------|------|------|------|\n"
            
            status_emoji = {'running': '🟢 运行中', 'stopped': '🔴 已停止', 
                           'warning': '🟡 警告', 'error': '🔴 错误', 'unknown': '⚪ 未知'}
            
            for node_result in results['service_inspection']:
                for service in node_result.get('services', []):
                    status = status_emoji.get(service.get('status', 'unknown'), '⚪ 未知')
                    md_content += f"| {node_result.get('node', '')} | {service.get('name', '')} | {status} | {service.get('process', '')} | {service.get('port', '')} |\n"
            md_content += "\n"
        
        if 'log_capture' in results:
            total_errors = 0
            total_stacktraces = 0
            for nr in results['log_capture']:
                for log in nr.get('logs', []):
                    total_errors += log.get('error_count', 0)
                    total_stacktraces += len(log.get('stacktraces', []))
            
            md_content += f"## 📝 日志分析 ({total_errors} 错误, {total_stacktraces} 异常栈)\n\n"
            md_content += "| 节点 | 日志路径 | 类型 | 关键词 | 错误数 | 异常栈数 | 状态 |\n"
            md_content += "|------|---------|------|--------|--------|---------|------|\n"
            
            for node_result in results['log_capture']:
                for log in node_result.get('logs', []):
                    status = "✓" if log.get('success', False) else "✗"
                    md_content += f"| {node_result.get('node', '')} | {log.get('path', '')} | {log.get('type', '')} | {log.get('keyword', '')} | {log.get('error_count', 0)} | {len(log.get('stacktraces', []))} | {status} |\n"
            md_content += "\n"
        
        if grade and grade.issues:
            md_content += f"## ⚠️ 问题列表 (共 {len(grade.issues)} 个)\n\n"
            for issue in grade.issues[:50]:
                emoji = SEVERITY_CONFIG[issue['severity']]['icon']
                location = issue.get('node', '')
                if issue.get('service'):
                    location += f" → {issue['service']}"
                if issue.get('log_path'):
                    location += f" → {issue['log_path']}"
                md_content += f"- {emoji} **[{issue['severity'].value}]** {location}: {issue['message']}\n"
            
            if len(grade.issues) > 50:
                md_content += f"\n> ... 还有 {len(grade.issues) - 50} 个问题未显示\n"
            
            md_content += "\n"
        
        md_content += "---\n\n"
        md_content += f"*本报告由运维巡检工具自动生成，生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*\n"
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(md_content)
        
        return filename

    def export_all_formats(self, results: Dict[str, Any],
                          grade: Optional[GradeResult] = None) -> Dict[str, str]:
        return {
            'json': self.export_json(results, grade),
            'csv': self.export_csv(results, grade),
            'html': self.export_html(results, grade),
            'markdown': self.export_markdown(results, grade)
        }

    def export(self, results: Dict[str, Any],
              grade: Optional[GradeResult] = None,
              fmt: str = 'html') -> Optional[str]:
        exporters = {
            'json': self.export_json,
            'csv': self.export_csv,
            'html': self.export_html,
            'markdown': self.export_markdown,
            'md': self.export_markdown,
            'all': None
        }
        
        if fmt == 'all':
            files = self.export_all_formats(results, grade)
            print("\n✓ 报告已导出到以下文件:")
            for fmt_name, path in files.items():
                print(f"  - {fmt_name.upper()}: {path}")
            return None
        
        exporter = exporters.get(fmt.lower())
        if exporter:
            filepath = exporter(results, grade)
            print(f"\n✓ 报告已导出: {filepath}")
            return filepath
        
        print(f"✗ 不支持的导出格式: {fmt}")
        return None
