import json
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from tabulate import tabulate
from colorama import init, Fore, Style

init(autoreset=True)


class OutputFormatter:
    def __init__(self, output_format: str = "table", output_dir: str = "./output"):
        self.output_format = output_format
        self.output_dir = output_dir
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self._ensure_output_dir()

    def _ensure_output_dir(self) -> None:
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)

    def format_table(self, data: List[List[Any]], headers: List[str], 
                     title: str = "") -> str:
        if title:
            print(f"\n{Fore.CYAN}{'=' * 60}")
            print(f"{Fore.CYAN}{title}")
            print(f"{Fore.CYAN}{'=' * 60}")
        
        table = tabulate(data, headers=headers, tablefmt="grid")
        print(table)
        return table

    def format_key_value(self, data: Dict[str, Any], title: str = "") -> None:
        if title:
            print(f"\n{Fore.CYAN}{'=' * 60}")
            print(f"{Fore.CYAN}{title}")
            print(f"{Fore.CYAN}{'=' * 60}")
        
        for key, value in data.items():
            if isinstance(value, bool):
                display_value = f"{Fore.GREEN}✓ 正常" if value else f"{Fore.RED}✗ 异常"
            else:
                display_value = str(value)
            print(f"{Fore.YELLOW}{key:<25}{Style.RESET_ALL}: {display_value}")

    def format_status(self, status: str, message: str = "") -> None:
        status_colors = {
            'success': Fore.GREEN,
            'error': Fore.RED,
            'warning': Fore.YELLOW,
            'info': Fore.BLUE,
        }
        color = status_colors.get(status, Fore.WHITE)
        prefix = {
            'success': '✓',
            'error': '✗',
            'warning': '⚠',
            'info': 'ℹ',
        }.get(status, '•')
        
        print(f"{color}{prefix} {message}")

    def format_node_result(self, node_name: str, results: Dict[str, Any]) -> None:
        print(f"\n{Fore.MAGENTA}{'─' * 60}")
        print(f"{Fore.MAGENTA}节点: {node_name}")
        print(f"{Fore.MAGENTA}{'─' * 60}")
        
        for check_name, check_result in results.items():
            if isinstance(check_result, dict):
                status = check_result.get('status', 'unknown')
                message = check_result.get('message', '')
                status_map = {
                    'success': ('✓', Fore.GREEN),
                    'failed': ('✗', Fore.RED),
                    'warning': ('⚠', Fore.YELLOW),
                    'unknown': ('?', Fore.WHITE),
                }
                icon, color = status_map.get(status, ('?', Fore.WHITE))
                print(f"  {color}{icon} {check_name:<20}: {message}")
            else:
                print(f"  {Fore.WHITE}• {check_name:<20}: {check_result}")

    def format_service_result(self, service_name: str, results: Dict[str, Any]) -> None:
        status = results.get('status', 'unknown')
        status_map = {
            'running': ('✓ 运行中', Fore.GREEN),
            'stopped': ('✗ 已停止', Fore.RED),
            'not_found': ('? 未找到', Fore.YELLOW),
            'unknown': ('? 未知', Fore.WHITE),
        }
        icon, color = status_map.get(status, ('? 未知', Fore.WHITE))
        
        print(f"\n  {Fore.CYAN}服务: {service_name}")
        print(f"    状态: {color}{icon}")
        
        if 'process' in results:
            print(f"    进程: {results['process']}")
        if 'port' in results:
            print(f"    端口: {results['port']}")
        if 'error' in results:
            print(f"    错误: {Fore.RED}{results['error']}")

    def format_log_result(self, log_path: str, content: str, 
                          keyword: str = "", max_lines: int = 20) -> None:
        print(f"\n{Fore.CYAN}{'─' * 60}")
        print(f"{Fore.CYAN}日志文件: {log_path}")
        if keyword:
            print(f"{Fore.CYAN}搜索关键词: {keyword}")
        print(f"{Fore.CYAN}{'─' * 60}")
        
        lines = content.strip().split('\n') if content else []
        if not lines:
            print(f"{Fore.YELLOW}  无匹配内容")
            return
        
        if len(lines) > max_lines:
            print(f"{Fore.YELLOW}  显示前 {max_lines} 行，共 {len(lines)} 行")
            lines = lines[:max_lines]
        
        for line in lines:
            if keyword and keyword.lower() in line.lower():
                highlighted = line.replace(keyword, f"{Fore.RED}{keyword}{Style.RESET_ALL}")
                print(f"  {highlighted}")
            else:
                print(f"  {line}")

    def save_to_file(self, data: Any, filename: str, 
                     format_type: Optional[str] = None) -> str:
        if not format_type:
            format_type = self.output_format
        
        filepath = os.path.join(self.output_dir, f"{filename}_{self.timestamp}.{format_type}")
        
        try:
            if format_type == 'json':
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
            elif format_type == 'txt':
                with open(filepath, 'w', encoding='utf-8') as f:
                    if isinstance(data, dict):
                        for key, value in data.items():
                            f.write(f"{key}: {value}\n")
                    elif isinstance(data, list):
                        for item in data:
                            f.write(f"{item}\n")
                    else:
                        f.write(str(data))
            
            print(f"\n{Fore.GREEN}结果已保存到: {filepath}")
            return filepath
        except Exception as e:
            print(f"{Fore.RED}保存文件失败: {str(e)}")
            return ""

    def print_summary(self, total: int, success: int, failed: int, 
                      warning: int = 0) -> None:
        print(f"\n{Fore.CYAN}{'=' * 60}")
        print(f"{Fore.CYAN}巡检汇总")
        print(f"{Fore.CYAN}{'=' * 60}")
        print(f"  总节点数: {total}")
        print(f"  {Fore.GREEN}成功: {success}")
        print(f"  {Fore.RED}失败: {failed}")
        if warning > 0:
            print(f"  {Fore.YELLOW}警告: {warning}")
        
        if total > 0:
            success_rate = (success / total) * 100
            print(f"\n  成功率: {success_rate:.1f}%")
