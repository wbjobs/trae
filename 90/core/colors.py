import os
import sys


class Colors:
    BLACK = '\033[30m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    MAGENTA = '\033[35m'
    CYAN = '\033[36m'
    WHITE = '\033[37m'
    GRAY = '\033[90m'
    LIGHT_RED = '\033[91m'
    LIGHT_GREEN = '\033[92m'
    LIGHT_YELLOW = '\033[93m'
    LIGHT_BLUE = '\033[94m'
    LIGHT_MAGENTA = '\033[95m'
    LIGHT_CYAN = '\033[96m'
    
    BOLD = '\033[1m'
    DIM = '\033[2m'
    UNDERLINE = '\033[4m'
    BLINK = '\033[5m'
    REVERSE = '\033[7m'
    
    BG_BLACK = '\033[40m'
    BG_RED = '\033[41m'
    BG_GREEN = '\033[42m'
    BG_YELLOW = '\033[43m'
    BG_BLUE = '\033[44m'
    BG_MAGENTA = '\033[45m'
    BG_CYAN = '\033[46m'
    BG_WHITE = '\033[47m'
    
    RESET = '\033[0m'
    
    _enabled = None
    
    @classmethod
    def enable(cls):
        cls._enabled = True
    
    @classmethod
    def disable(cls):
        cls._enabled = False
    
    @classmethod
    def auto_detect(cls):
        if os.environ.get('NO_COLOR'):
            cls._enabled = False
        elif os.environ.get('FORCE_COLOR'):
            cls._enabled = True
        else:
            cls._enabled = hasattr(sys.stdout, 'isatty') and sys.stdout.isatty()
    
    @classmethod
    def _wrap(cls, color, text):
        if cls._enabled is None:
            cls.auto_detect()
        if not cls._enabled:
            return text
        return f"{color}{text}{cls.RESET}"
    
    @classmethod
    def success(cls, text):
        return cls._wrap(cls.GREEN, text)
    
    @classmethod
    def error(cls, text):
        return cls._wrap(cls.RED, text)
    
    @classmethod
    def warning(cls, text):
        return cls._wrap(cls.YELLOW, text)
    
    @classmethod
    def info(cls, text):
        return cls._wrap(cls.CYAN, text)
    
    @classmethod
    def critical(cls, text):
        return cls._wrap(cls.BOLD + cls.RED + cls.BG_RED, text)
    
    @classmethod
    def header(cls, text):
        return cls._wrap(cls.BOLD + cls.CYAN, text)
    
    @classmethod
    def highlight(cls, text):
        return cls._wrap(cls.BOLD + cls.YELLOW, text)
    
    @classmethod
    def ok(cls, text):
        return cls._wrap(cls.GREEN, f"✓ {text}")
    
    @classmethod
    def fail(cls, text):
        return cls._wrap(cls.RED, f"✗ {text}")
    
    @classmethod
    def level(cls, text, severity="info"):
        levels = {
            "debug": cls._wrap(cls.GRAY, text),
            "info": cls._wrap(cls.CYAN, text),
            "warning": cls._wrap(cls.YELLOW, text),
            "error": cls._wrap(cls.RED, text),
            "critical": cls._wrap(cls.BOLD + cls.RED, text),
            "success": cls._wrap(cls.GREEN, text),
        }
        return levels.get(severity, text)


def print_severity(text, severity="info"):
    print(Colors.level(text, severity))


def print_status(label, value, status="ok"):
    status_colors = {
        "ok": Colors.GREEN,
        "warn": Colors.YELLOW,
        "error": Colors.RED,
        "critical": Colors.BOLD + Colors.RED,
    }
    color = status_colors.get(status, Colors.WHITE)
    print(f"{Colors.info(label)}: {Colors._wrap(color, str(value))}")


def print_bar(value, max_value=100, width=50, warning_threshold=70, error_threshold=90):
    ratio = min(value / max_value, 1.0)
    filled = int(width * ratio)
    
    if value >= error_threshold:
        color = Colors.RED
    elif value >= warning_threshold:
        color = Colors.YELLOW
    else:
        color = Colors.GREEN
    
    bar = "█" * filled + "░" * (width - filled)
    return f"{Colors._wrap(color, bar)} {value:.1f}%"


def print_table(headers, rows, status_column=None, status_map=None):
    from tabulate import tabulate
    
    if status_column is not None and status_map:
        colored_rows = []
        for row in rows:
            new_row = list(row)
            status_val = new_row[status_column]
            new_row[status_column] = Colors.level(str(status_val), status_map.get(status_val, "info"))
            colored_rows.append(new_row)
        rows = colored_rows
    
    return tabulate(rows, headers=headers, tablefmt="grid")
