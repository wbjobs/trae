import sys
import os
from typing import Dict, List, Any, Optional, Callable
from colorama import init, Fore, Style

init(autoreset=True)


class InteractiveCLI:
    def __init__(self):
        self.history: List[Dict[str, Any]] = []

    def prompt(self, message: str, default: Any = None, 
              required: bool = False, validator: Optional[Callable] = None) -> Any:
        prompt_str = f"{Fore.CYAN}?{Style.RESET_ALL} {message}"
        if default is not None:
            prompt_str += f" {Fore.YELLOW}[{default}]{Style.RESET_ALL}"
        prompt_str += ": "
        
        while True:
            try:
                user_input = input(prompt_str).strip()
                
                if not user_input and default is not None:
                    return default
                
                if not user_input and required:
                    print(f"{Fore.RED}✗ 此项为必填项，请输入内容{Style.RESET_ALL}")
                    continue
                
                if validator and user_input:
                    is_valid, error_msg = validator(user_input)
                    if not is_valid:
                        print(f"{Fore.RED}✗ {error_msg}{Style.RESET_ALL}")
                        continue
                
                return user_input
            except KeyboardInterrupt:
                print(f"\n{Fore.YELLOW}操作已取消{Style.RESET_ALL}")
                sys.exit(0)
            except EOFError:
                print(f"\n{Fore.YELLOW}输入结束{Style.RESET_ALL}")
                return default

    def confirm(self, message: str, default: bool = True) -> bool:
        default_str = "Y/n" if default else "y/N"
        prompt_str = f"{Fore.CYAN}?{Style.RESET_ALL} {message} {Fore.YELLOW}[{default_str}]{Style.RESET_ALL}: "
        
        while True:
            try:
                user_input = input(prompt_str).strip().lower()
                
                if not user_input:
                    return default
                
                if user_input in ['y', 'yes']:
                    return True
                elif user_input in ['n', 'no']:
                    return False
                else:
                    print(f"{Fore.RED}✗ 请输入 y 或 n{Style.RESET_ALL}")
            except KeyboardInterrupt:
                print(f"\n{Fore.YELLOW}操作已取消{Style.RESET_ALL}")
                sys.exit(0)

    def select(self, message: str, options: List[Dict[str, Any]], 
              default: int = 0) -> Any:
        print(f"\n{Fore.CYAN}?{Style.RESET_ALL} {message}")
        for i, option in enumerate(options):
            marker = f"{Fore.GREEN}>{Style.RESET_ALL}" if i == default else " "
            print(f"  {marker} {Fore.YELLOW}{i + 1}.{Style.RESET_ALL} {option.get('label', option.get('value', ''))}")
        
        while True:
            try:
                user_input = input(f"{Fore.CYAN}?{Style.RESET_ALL} 请选择 (1-{len(options)}, 默认 {default + 1}): ").strip()
                
                if not user_input:
                    return options[default].get('value', options[default])
                
                try:
                    index = int(user_input) - 1
                    if 0 <= index < len(options):
                        return options[index].get('value', options[index])
                    else:
                        print(f"{Fore.RED}✗ 请输入 1 到 {len(options)} 之间的数字{Style.RESET_ALL}")
                except ValueError:
                    print(f"{Fore.RED}✗ 请输入有效的数字{Style.RESET_ALL}")
            except KeyboardInterrupt:
                print(f"\n{Fore.YELLOW}操作已取消{Style.RESET_ALL}")
                sys.exit(0)

    def multiselect(self, message: str, options: List[Dict[str, Any]],
                   default: Optional[List[int]] = None) -> List[Any]:
        if default is None:
            default = []
        
        print(f"\n{Fore.CYAN}?{Style.RESET_ALL} {message} (可多选，用逗号分隔)")
        for i, option in enumerate(options):
            checked = "✓" if i in default else " "
            print(f"  [{checked}] {Fore.YELLOW}{i + 1}.{Style.RESET_ALL} {option.get('label', option.get('value', ''))}")
        
        while True:
            try:
                user_input = input(f"{Fore.CYAN}?{Style.RESET_ALL} 请选择 (如: 1,3,5, 回车确认): ").strip()
                
                if not user_input:
                    return [options[i].get('value', options[i]) for i in default]
                
                try:
                    indices = [int(x.strip()) - 1 for x in user_input.split(',')]
                    selected = []
                    for index in indices:
                        if 0 <= index < len(options):
                            selected.append(options[index].get('value', options[index]))
                    
                    if selected:
                        return selected
                    else:
                        print(f"{Fore.RED}✗ 未选择任何有效选项{Style.RESET_ALL}")
                except ValueError:
                    print(f"{Fore.RED}✗ 请输入有效的数字，用逗号分隔{Style.RESET_ALL}")
            except KeyboardInterrupt:
                print(f"\n{Fore.YELLOW}操作已取消{Style.RESET_ALL}")
                sys.exit(0)

    def print_header(self, title: str) -> None:
        print(f"\n{Fore.MAGENTA}{'=' * 60}{Style.RESET_ALL}")
        print(f"{Fore.MAGENTA}  {title}{Style.RESET_ALL}")
        print(f"{Fore.MAGENTA}{'=' * 60}{Style.RESET_ALL}\n")

    def print_section(self, title: str) -> None:
        print(f"\n{Fore.BLUE}── {title} {'─' * (50 - len(title))}{Style.RESET_ALL}\n")

    def print_success(self, message: str) -> None:
        print(f"{Fore.GREEN}✓ {message}{Style.RESET_ALL}")

    def print_error(self, message: str) -> None:
        print(f"{Fore.RED}✗ {message}{Style.RESET_ALL}")

    def print_warning(self, message: str) -> None:
        print(f"{Fore.YELLOW}⚠ {message}{Style.RESET_ALL}")

    def print_info(self, message: str) -> None:
        print(f"{Fore.BLUE}ℹ {message}{Style.RESET_ALL}")

    def validate_host(self, value: str) -> tuple:
        if not value:
            return False, "主机地址不能为空"
        return True, ""

    def validate_port(self, value: str) -> tuple:
        try:
            port = int(value)
            if 1 <= port <= 65535:
                return True, ""
            return False, "端口必须在 1-65535 之间"
        except ValueError:
            return False, "端口必须是数字"

    def validate_number(self, min_val: int = 0, max_val: Optional[int] = None) -> Callable:
        def validator(value: str) -> tuple:
            try:
                num = int(value)
                if num < min_val:
                    return False, f"数字必须大于等于 {min_val}"
                if max_val is not None and num > max_val:
                    return False, f"数字必须小于等于 {max_val}"
                return True, ""
            except ValueError:
                return False, "必须输入数字"
        return validator

    def wizard_detect(self) -> Dict[str, Any]:
        self.print_header("节点探测向导")
        self.print_info("引导您配置节点探测参数")
        
        config = {
            'command': 'detect',
            'config': self.prompt("配置文件路径", default='config.yaml', required=True),
            'name': self.prompt("指定节点名称 (留空探测所有)", default=''),
            'output': self.select("输出格式", [
                {'label': '表格 (Table)', 'value': 'table'},
                {'label': 'JSON', 'value': 'json'},
                {'label': '纯文本 (TXT)', 'value': 'txt'}
            ], default=0),
            'output_dir': self.prompt("输出目录", default='./output'),
            'parallel': self.confirm("启用并行执行", default=True),
            'max_workers': int(self.prompt("最大并行线程数", default='10', 
                                        validator=self.validate_number(1, 100))),
            'silent': self.confirm("静默模式", default=False),
            'save': self.confirm("保存结果到文件", default=True)
        }
        
        return config

    def wizard_inspect(self) -> Dict[str, Any]:
        self.print_header("服务巡检向导")
        self.print_info("引导您配置服务巡检参数")
        
        config = {
            'command': 'inspect',
            'config': self.prompt("配置文件路径", default='config.yaml', required=True),
            'service': self.prompt("指定服务名称 (留空巡检所有)", default=''),
            'output': self.select("输出格式", [
                {'label': '表格 (Table)', 'value': 'table'},
                {'label': 'JSON', 'value': 'json'},
                {'label': '纯文本 (TXT)', 'value': 'txt'}
            ], default=0),
            'output_dir': self.prompt("输出目录", default='./output'),
            'parallel': self.confirm("启用并行执行", default=True),
            'max_workers': int(self.prompt("最大并行线程数", default='5', 
                                        validator=self.validate_number(1, 50))),
            'silent': self.confirm("静默模式", default=False),
            'save': self.confirm("保存结果到文件", default=True)
        }
        
        return config

    def wizard_logs(self) -> Dict[str, Any]:
        self.print_header("日志抓取向导")
        self.print_info("引导您配置日志抓取参数")
        
        log_type = self.select("日志抓取类型", [
            {'label': '尾部查看 (Tail)', 'value': 'tail'},
            {'label': '关键词搜索 (Grep)', 'value': 'grep'},
            {'label': '关键词计数 (Count)', 'value': 'count'}
        ], default=0)
        
        config = {
            'command': 'logs',
            'config': self.prompt("配置文件路径", default='config.yaml', required=True),
            'type': log_type,
            'keyword': self.prompt("搜索关键词", default='ERROR') if log_type in ['grep', 'count'] else '',
            'lines': int(self.prompt("抓取日志行数", default='100', 
                                   validator=self.validate_number(1, 10000))),
            'output': self.select("输出格式", [
                {'label': '表格 (Table)', 'value': 'table'},
                {'label': 'JSON', 'value': 'json'},
                {'label': '纯文本 (TXT)', 'value': 'txt'}
            ], default=0),
            'output_dir': self.prompt("输出目录", default='./output'),
            'parallel': self.confirm("启用并行执行", default=True),
            'max_workers': int(self.prompt("最大并行线程数", default='5', 
                                        validator=self.validate_number(1, 50))),
            'silent': self.confirm("静默模式", default=False),
            'save': self.confirm("保存结果到文件", default=True)
        }
        
        return config

    def wizard_exec(self) -> Dict[str, Any]:
        self.print_header("批量执行向导")
        self.print_info("引导您配置批量命令执行参数")
        
        commands = []
        self.print_section("命令配置")
        while True:
            cmd = self.prompt("输入要执行的命令 (留空结束)", default='')
            if not cmd:
                break
            commands.append(cmd)
        
        if not commands:
            self.print_error("至少需要输入一条命令")
            return self.wizard_exec()
        
        config = {
            'command': 'exec',
            'config': self.prompt("配置文件路径", default='config.yaml', required=True),
            'cmd': commands,
            'timeout': int(self.prompt("命令超时时间(秒)", default='30', 
                                    validator=self.validate_number(1, 3600))),
            'use_sudo': self.confirm("使用 sudo 执行", default=False),
            'sudo_password': self.prompt("sudo 密码 (留空跳过)", default='', 
                                       required=False) if False else '',
            'output': self.select("输出格式", [
                {'label': '表格 (Table)', 'value': 'table'},
                {'label': 'JSON', 'value': 'json'},
                {'label': '纯文本 (TXT)', 'value': 'txt'}
            ], default=0),
            'output_dir': self.prompt("输出目录", default='./output'),
            'parallel': self.confirm("启用并行执行", default=True),
            'max_workers': int(self.prompt("最大并行线程数", default='10', 
                                        validator=self.validate_number(1, 100))),
            'silent': self.confirm("静默模式", default=False),
            'save': self.confirm("保存结果到文件", default=True)
        }
        
        return config

    def wizard_all(self) -> Dict[str, Any]:
        self.print_header("完整巡检向导")
        self.print_info("引导您配置完整巡检流程")
        
        config = {
            'command': 'all',
            'config': self.prompt("配置文件路径", default='config.yaml', required=True),
            'output': self.select("输出格式", [
                {'label': '表格 (Table)', 'value': 'table'},
                {'label': 'JSON', 'value': 'json'},
                {'label': '纯文本 (TXT)', 'value': 'txt'}
            ], default=0),
            'output_dir': self.prompt("输出目录", default='./output'),
            'parallel': self.confirm("启用并行执行", default=True),
            'max_workers': int(self.prompt("最大并行线程数", default='10', 
                                        validator=self.validate_number(1, 100))),
            'silent': self.confirm("静默模式", default=False),
            'save': self.confirm("保存结果到文件", default=True),
            'with_grade': self.confirm("启用智能评分", default=True),
            'export_report': self.confirm("导出巡检报告", default=True)
        }
        
        return config

    def wizard_main(self) -> Dict[str, Any]:
        self.print_header("运维巡检工具 - 交互式向导")
        print(f"{Fore.CYAN}欢迎使用运维巡检 CLI 工具！{Style.RESET_ALL}")
        print(f"{Fore.CYAN}请选择要执行的操作：{Style.RESET_ALL}\n")
        
        command = self.select("选择命令", [
            {'label': '节点探测 - 检测集群节点可用性', 'value': 'detect'},
            {'label': '服务巡检 - 检查服务运行状态', 'value': 'inspect'},
            {'label': '日志抓取 - 批量获取和分析日志', 'value': 'logs'},
            {'label': '批量执行 - 在多节点执行命令', 'value': 'exec'},
            {'label': '完整巡检 - 执行所有检查项', 'value': 'all'}
        ], default=0)
        
        wizards = {
            'detect': self.wizard_detect,
            'inspect': self.wizard_inspect,
            'logs': self.wizard_logs,
            'exec': self.wizard_exec,
            'all': self.wizard_all
        }
        
        config = wizards[command]()
        
        self.print_section("配置确认")
        print(f"{Fore.GREEN}以下是您的配置：{Style.RESET_ALL}\n")
        for key, value in config.items():
            if key == 'cmd' and isinstance(value, list):
                print(f"  {Fore.YELLOW}{key:<15}{Style.RESET_ALL}: {len(value)} 条命令")
                for i, cmd in enumerate(value):
                    print(f"                   {i + 1}. {cmd}")
            else:
                display_value = str(value) if len(str(value)) < 50 else str(value)[:50] + "..."
                print(f"  {Fore.YELLOW}{key:<15}{Style.RESET_ALL}: {display_value}")
        
        if not self.confirm("\n确认配置并开始执行？", default=True):
            self.print_info("配置已取消，请重新运行向导")
            sys.exit(0)
        
        return config

    def build_args(self, config: Dict[str, Any]) -> List[str]:
        args = []
        
        if config.get('config'):
            args.extend(['-c', config['config']])
        if config.get('output'):
            args.extend(['-o', config['output']])
        if config.get('output_dir'):
            args.extend(['-d', config['output_dir']])
        if config.get('no_parallel', not config.get('parallel', True)):
            args.append('--no-parallel')
        if config.get('max_workers'):
            args.extend(['--max-workers', str(config['max_workers'])])
        if config.get('silent'):
            args.append('-s')
        if config.get('save'):
            args.append('--save')
        
        args.append(config['command'])
        
        if config['command'] == 'detect' and config.get('name'):
            args.extend(['--name', config['name']])
        
        if config['command'] == 'inspect' and config.get('service'):
            args.extend(['--service', config['service']])
        
        if config['command'] == 'logs':
            if config.get('keyword'):
                args.extend(['--keyword', config['keyword']])
            if config.get('lines'):
                args.extend(['--lines', str(config['lines'])])
            if config.get('type'):
                args.extend(['--type', config['type']])
        
        if config['command'] == 'exec':
            if config.get('cmd'):
                args.extend(config['cmd'])
            if config.get('timeout'):
                args.extend(['--timeout', str(config['timeout'])])
            if config.get('use_sudo'):
                args.append('--sudo')
            if config.get('sudo_password'):
                args.extend(['--sudo-password', config['sudo_password']])
        
        return args
