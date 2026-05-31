import sys
import os
from typing import Optional


class PlatformAdapter:
    def __init__(self):
        self.is_windows = sys.platform.startswith('win')
        self.is_linux = sys.platform.startswith('linux')
        self.is_darwin = sys.platform.startswith('darwin')

    def get_serial_ports(self) -> list:
        ports = []
        try:
            import serial.tools.list_ports
            for port in serial.tools.list_ports.comports():
                ports.append({
                    'device': port.device,
                    'description': port.description,
                    'hwid': port.hwid
                })
        except ImportError:
            pass
        return ports

    def get_app_data_dir(self) -> str:
        if self.is_windows:
            return os.path.join(os.environ.get('APPDATA', ''), 'DesktopControlCenter')
        elif self.is_linux:
            return os.path.join(os.path.expanduser('~'), '.config', 'DesktopControlCenter')
        elif self.is_darwin:
            return os.path.join(os.path.expanduser('~'), 'Library', 'Application Support', 'DesktopControlCenter')
        else:
            return os.path.join(os.path.expanduser('~'), '.desktop_control_center')

    def show_notification(self, title: str, message: str, timeout: int = 3000) -> None:
        if self.is_windows:
            try:
                from win10toast import ToastNotifier
                toaster = ToastNotifier()
                toaster.show_toast(title, message, duration=timeout // 1000, threaded=True)
            except ImportError:
                print(f'[通知] {title}: {message}')
        elif self.is_linux:
            try:
                import subprocess
                subprocess.run(['notify-send', title, message, '-t', str(timeout)])
            except Exception:
                print(f'[通知] {title}: {message}')
        else:
            print(f'[通知] {title}: {message}')

    def get_window_manager(self):
        if self.is_windows:
            try:
                import win32gui
                import win32con
                return WindowsWindowManager()
            except ImportError:
                return None
        return None


class WindowsWindowManager:
    def find_window(self, class_name: Optional[str] = None, window_name: Optional[str] = None):
        import win32gui
        return win32gui.FindWindow(class_name, window_name)

    def set_foreground(self, hwnd):
        import win32gui
        import win32con
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.SetForegroundWindow(hwnd)


platform = PlatformAdapter()
