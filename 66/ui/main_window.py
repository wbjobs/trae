import sys
import os
import time
from typing import Dict, Any, Optional

from PyQt5.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QSplitter,
    QTabWidget, QStatusBar, QMenuBar, QMenu, QAction, QToolBar,
    QLabel, QPushButton, QMessageBox, QFileDialog, QSystemTrayIcon,
    QStyle, QHBoxLayout
)
from PyQt5.QtCore import Qt, QTimer, pyqtSignal, QSize
from PyQt5.QtGui import QIcon, QKeySequence

from .device_panel import DevicePanel
from .command_panel import CommandPanel
from .notification_widget import NotificationManager
from .profile_selector import ProfileSelector
from platform_adapter import platform

import logging
logger = logging.getLogger(__name__)


class MainWindow(QMainWindow):
    device_connected = pyqtSignal(str)
    device_disconnected = pyqtSignal(str)
    command_executed = pyqtSignal(str, bool)
    profile_changed = pyqtSignal(str)

    def __init__(self, app_context: Dict[str, Any] = None):
        super().__init__()
        self._context = app_context or {}
        self._device_manager = self._context.get('device_manager')
        self._command_manager = self._context.get('command_manager')
        self._scheduler = self._context.get('scheduler')
        self._linkage_engine = self._context.get('linkage_engine')
        self._profile_manager = self._context.get('profile_manager')
        self._config = self._context.get('config')
        self._notification_manager = NotificationManager(self)

        self._minimal_mode = False
        self._normal_geometry = None
        self._top_bar_widget = None
        self._silent_mode = False
        self._normal_update_interval = 1000
        self._silent_update_interval = 5000

        self._init_ui()
        self._init_menu()
        self._init_toolbar()
        self._init_statusbar()
        self._init_tray()
        self._connect_signals()
        self._load_window_state()

        self._update_timer = QTimer(self)
        self._update_timer.timeout.connect(self._update_ui)
        self._update_timer.start(1000)

    def _init_ui(self) -> None:
        self.setWindowTitle('桌面中控应用')
        self.resize(1024, 768)

        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(5, 5, 5, 5)
        main_layout.setSpacing(5)

        self._top_bar_widget = QWidget()
        top_bar_layout = QHBoxLayout(self._top_bar_widget)
        top_bar_layout.setContentsMargins(0, 0, 0, 0)
        top_bar_layout.addWidget(QLabel('当前方案:'))
        self._profile_selector = ProfileSelector(self._profile_manager)
        self._profile_selector.profile_selected.connect(self._on_profile_selected)
        top_bar_layout.addWidget(self._profile_selector)
        top_bar_layout.addStretch()

        self._minimal_button = QPushButton('极简模式')
        self._minimal_button.setFixedHeight(24)
        self._minimal_button.clicked.connect(self._toggle_minimal_mode)
        top_bar_layout.addWidget(self._minimal_button)

        self._status_label = QLabel('就绪')
        self._status_label.setStyleSheet('font-weight: bold;')
        top_bar_layout.addWidget(self._status_label)

        main_layout.addWidget(self._top_bar_widget)

        self._splitter = QSplitter(Qt.Horizontal)

        self._device_panel = DevicePanel(self._device_manager)
        self._splitter.addWidget(self._device_panel)

        self._tab_widget = QTabWidget()
        self._command_panel = CommandPanel(self._command_manager, self._device_manager)
        self._tab_widget.addTab(self._command_panel, '快捷指令')

        from .scheduler_panel import SchedulerPanel
        self._scheduler_panel = SchedulerPanel(self._scheduler)
        self._tab_widget.addTab(self._scheduler_panel, '任务队列')

        from .linkage_panel import LinkagePanel
        self._linkage_panel = LinkagePanel(self._linkage_engine)
        self._tab_widget.addTab(self._linkage_panel, '联动规则')

        self._splitter.addWidget(self._tab_widget)
        self._splitter.setStretchFactor(0, 1)
        self._splitter.setStretchFactor(1, 2)

        main_layout.addWidget(self._splitter)

    def _init_menu(self) -> None:
        menubar = self.menuBar()

        file_menu = menubar.addMenu('文件(&F)')

        new_profile_action = QAction('新建方案...', self)
        new_profile_action.setShortcut(QKeySequence.New)
        new_profile_action.triggered.connect(self._on_new_profile)
        file_menu.addAction(new_profile_action)

        import_profile_action = QAction('导入方案...', self)
        import_profile_action.triggered.connect(self._on_import_profile)
        file_menu.addAction(import_profile_action)

        export_profile_action = QAction('导出方案', self)
        export_profile_action.triggered.connect(self._on_export_profile)
        file_menu.addAction(export_profile_action)

        file_menu.addSeparator()

        silent_action = QAction('后台静默运行', self)
        silent_action.setCheckable(True)
        silent_action.triggered.connect(self._toggle_silent_mode)
        file_menu.addAction(silent_action)

        file_menu.addSeparator()

        exit_action = QAction('退出', self)
        exit_action.setShortcut(QKeySequence.Quit)
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)

        edit_menu = menubar.addMenu('编辑(&E)')

        add_device_action = QAction('添加设备...', self)
        add_device_action.triggered.connect(self._on_add_device)
        edit_menu.addAction(add_device_action)

        add_command_action = QAction('添加指令...', self)
        add_command_action.triggered.connect(self._on_add_command)
        edit_menu.addAction(add_command_action)

        view_menu = menubar.addMenu('视图(&V)')

        refresh_action = QAction('刷新', self)
        refresh_action.setShortcut(QKeySequence.Refresh)
        refresh_action.triggered.connect(self._on_refresh)
        view_menu.addAction(refresh_action)

        view_menu.addSeparator()

        minimal_action = QAction('极简模式', self)
        minimal_action.setCheckable(True)
        minimal_action.triggered.connect(self._toggle_minimal_mode)
        view_menu.addAction(minimal_action)

        tools_menu = menubar.addMenu('工具(&T)')

        connect_all_action = QAction('连接所有设备', self)
        connect_all_action.triggered.connect(self._on_connect_all)
        tools_menu.addAction(connect_all_action)

        disconnect_all_action = QAction('断开所有设备', self)
        disconnect_all_action.triggered.connect(self._on_disconnect_all)
        tools_menu.addAction(disconnect_all_action)

        help_menu = menubar.addMenu('帮助(&H)')

        about_action = QAction('关于', self)
        about_action.triggered.connect(self._on_about)
        help_menu.addAction(about_action)

    def _init_toolbar(self) -> None:
        toolbar = QToolBar('主工具栏')
        toolbar.setIconSize(QSize(24, 24))
        self.addToolBar(toolbar)

        connect_all_icon = self.style().standardIcon(QStyle.SP_ArrowUp)
        connect_all_action = QAction(connect_all_icon, '连接所有', self)
        connect_all_action.triggered.connect(self._on_connect_all)
        toolbar.addAction(connect_all_action)

        disconnect_all_icon = self.style().standardIcon(QStyle.SP_ArrowDown)
        disconnect_all_action = QAction(disconnect_all_icon, '断开所有', self)
        disconnect_all_action.triggered.connect(self._on_disconnect_all)
        toolbar.addAction(disconnect_all_action)

        toolbar.addSeparator()

        refresh_icon = self.style().standardIcon(QStyle.SP_BrowserReload)
        refresh_action = QAction(refresh_icon, '刷新', self)
        refresh_action.triggered.connect(self._on_refresh)
        toolbar.addAction(refresh_action)

    def _init_statusbar(self) -> None:
        self.statusBar().showMessage('就绪')

    def _init_tray(self) -> None:
        self._tray_icon = QSystemTrayIcon(self)
        icon = self.style().standardIcon(QStyle.SP_ComputerIcon)
        self._tray_icon.setIcon(icon)
        self._tray_icon.setToolTip('桌面中控应用')

        tray_menu = QMenu()
        show_action = QAction('显示主窗口', self)
        show_action.triggered.connect(self._show_from_tray)
        tray_menu.addAction(show_action)

        hide_action = QAction('隐藏到托盘', self)
        hide_action.triggered.connect(self.hide)
        tray_menu.addAction(hide_action)

        self._silent_tray_action = QAction('后台静默运行', self)
        self._silent_tray_action.setCheckable(True)
        self._silent_tray_action.triggered.connect(self._toggle_silent_mode)
        tray_menu.addAction(self._silent_tray_action)

        tray_menu.addSeparator()

        quit_action = QAction('退出', self)
        quit_action.triggered.connect(self._on_exit)
        tray_menu.addAction(quit_action)

        self._tray_icon.setContextMenu(tray_menu)
        self._tray_icon.activated.connect(self._on_tray_activated)
        self._tray_icon.show()

    def _connect_signals(self) -> None:
        if self._device_manager:
            self._device_manager.set_on_device_status(self._on_device_status)
            self._device_manager.set_on_device_data(self._on_device_data)
            self._device_manager.set_on_device_error(self._on_device_error)

        if self._command_manager:
            self._command_manager.set_on_command_started(self._on_command_started)
            self._command_manager.set_on_command_completed(self._on_command_completed)

        if self._profile_manager:
            self._profile_manager.set_on_profile_activated(self._on_profile_activated)

        if self._linkage_engine:
            self._linkage_engine.set_on_rule_failed(self._on_linkage_rule_failed)

    def _on_device_status(self, device_id: str, status) -> None:
        status_str = status.value if hasattr(status, 'value') else str(status)
        if status_str == 'connected':
            self.device_connected.emit(device_id)
            self.show_notification('设备连接', f'设备已连接: {device_id}')
        elif status_str == 'disconnected':
            self.device_disconnected.emit(device_id)
            self.show_notification('设备断开', f'设备已断开: {device_id}', is_error=True)

    def _on_device_data(self, device_id: str, data: Dict[str, Any]) -> None:
        if self._linkage_engine:
            self._linkage_engine.update_device_state(device_id, data)

    def _on_command_started(self, command_id: str) -> None:
        self._status_label.setText(f'执行中: {command_id}')

    def _on_command_completed(self, command_id: str, result) -> None:
        success = result.success if hasattr(result, 'success') else False
        duration = result.end_time - result.start_time if hasattr(result, 'end_time') else 0
        status = '成功' if success else '失败'
        self._status_label.setText(f'指令执行{status}: {duration:.2f}s')
        self.command_executed.emit(command_id, success)

    def _on_profile_selected(self, profile_id: str) -> None:
        if self._profile_manager:
            self._profile_manager.activate_profile(profile_id)

    def _on_profile_activated(self, profile) -> None:
        self.profile_changed.emit(profile.profile_id)
        self.show_notification('方案切换', f'已切换到方案: {profile.name}')
        self._device_panel.refresh()
        self._command_panel.refresh()

    def _on_linkage_rule_failed(self, rule, error_message: str) -> None:
        self.show_notification(
            '联动执行失败',
            f'规则 [{rule.name}] 执行失败: {error_message}',
            is_error=True
        )

    def _on_device_error(self, device_name: str, error_message: str) -> None:
        self.show_notification(
            '设备异常告警',
            f'设备 [{device_name}] 运行异常: {error_message}',
            is_error=True,
            timeout=5000
        )

    def _toggle_minimal_mode(self) -> None:
        self._minimal_mode = not self._minimal_mode

        if self._minimal_mode:
            self._normal_geometry = self.saveGeometry()
            self._top_bar_widget.hide()
            self.menuBar().hide()
            self.statusBar().hide()
            self._device_panel.hide()
            self._minimal_button.setText('退出极简')
            self.resize(600, 400)
            self.setWindowFlags(self.windowFlags() | Qt.WindowStaysOnTopHint)
            self.show()
        else:
            self._top_bar_widget.show()
            self.menuBar().show()
            self.statusBar().show()
            self._device_panel.show()
            self._minimal_button.setText('极简模式')
            if self._normal_geometry:
                self.restoreGeometry(self._normal_geometry)
            self.setWindowFlags(self.windowFlags() & ~Qt.WindowStaysOnTopHint)
            self.show()

    def _toggle_silent_mode(self) -> None:
        self._silent_mode = not self._silent_mode

        if self._silent_tray_action:
            self._silent_tray_action.setChecked(self._silent_mode)

        if self._silent_mode:
            self.hide()
            self._update_timer.setInterval(self._silent_update_interval)
            self._tray_icon.showMessage(
                '后台静默运行',
                '应用已切换到后台静默模式，可通过系统托盘恢复',
                QSystemTrayIcon.Information,
                2000
            )
            logger.info('Entered silent mode')
        else:
            self.show()
            self.activateWindow()
            self._update_timer.setInterval(self._normal_update_interval)
            logger.info('Exited silent mode')

    def _show_from_tray(self) -> None:
        if self._silent_mode:
            self._toggle_silent_mode()
        else:
            self.show()
            self.activateWindow()

    def _on_new_profile(self) -> None:
        from PyQt5.QtWidgets import QInputDialog
        name, ok = QInputDialog.getText(self, '新建方案', '请输入方案名称:')
        if ok and name and self._profile_manager:
            self._profile_manager.create_profile(name)
            self._profile_selector.refresh()

    def _on_import_profile(self) -> None:
        file_path, _ = QFileDialog.getOpenFileName(
            self, '导入方案', '', 'JSON文件 (*.json);;所有文件 (*.*)'
        )
        if file_path and self._profile_manager:
            profile = self._profile_manager.import_profile(file_path)
            if profile:
                self.show_notification('导入成功', f'方案已导入: {profile.name}')
                self._profile_selector.refresh()

    def _on_export_profile(self) -> None:
        active_profile = self._profile_manager.get_active_profile() if self._profile_manager else None
        if not active_profile:
            QMessageBox.warning(self, '警告', '没有可导出的方案')
            return

        file_path, _ = QFileDialog.getSaveFileName(
            self, '导出方案', f'{active_profile.name}.json', 'JSON文件 (*.json)'
        )
        if file_path and self._profile_manager:
            if self._profile_manager.export_profile(active_profile.profile_id, file_path):
                self.show_notification('导出成功', f'方案已导出: {file_path}')

    def _on_add_device(self) -> None:
        self._device_panel.show_add_device_dialog()

    def _on_add_command(self) -> None:
        self._command_panel.show_add_command_dialog()

    def _on_refresh(self) -> None:
        self._device_panel.refresh()
        self._command_panel.refresh()

    def _on_connect_all(self) -> None:
        if self._device_manager:
            for device in self._device_manager.get_all_devices():
                self._device_manager.connect_device(device.device_id)

    def _on_disconnect_all(self) -> None:
        if self._device_manager:
            for device in self._device_manager.get_all_devices():
                self._device_manager.disconnect_device(device.device_id)

    def _on_about(self) -> None:
        QMessageBox.about(
            self, '关于',
            '桌面中控应用 v1.0\n\n'
            '多设备联动控制系统\n'
            '支持Windows和国产系统'
        )

    def _on_exit(self) -> None:
        reply = QMessageBox.question(
            self, '确认退出', '确定要退出应用吗?',
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self._save_window_state()
            if self._tray_icon:
                self._tray_icon.hide()
            QApplication.instance().quit()

    def _on_tray_activated(self, reason) -> None:
        if reason == QSystemTrayIcon.DoubleClick:
            if self.isVisible():
                self.hide()
            else:
                self.show()
                self.activateWindow()

    def _update_ui(self) -> None:
        if self._device_manager:
            devices = self._device_manager.get_all_devices()
            connected = sum(1 for d in devices if d.status.value == 'connected')
            total = len(devices)
            self.statusBar().showMessage(f'设备: {connected}/{total} 在线')

    def show_notification(self, title: str, message: str, is_error: bool = False, timeout: int = 3000) -> None:
        self._notification_manager.show_notification(title, message, is_error, timeout)
        if self._config and self._config.get('behavior.show_notifications', True):
            platform.show_notification(title, message, timeout)

    def _load_window_state(self) -> None:
        if self._config:
            size = self._config.get('appearance.window_size', [1024, 768])
            position = self._config.get('appearance.window_position', [100, 100])
            self.resize(size[0], size[1])
            self.move(position[0], position[1])

    def _save_window_state(self) -> None:
        if self._config:
            self._config.set('appearance.window_size', [self.width(), self.height()])
            self._config.set('appearance.window_position', [self.x(), self.y()])

    def closeEvent(self, event) -> None:
        if self._config and self._config.get('behavior.minimize_to_tray', True):
            event.ignore()
            self.hide()
            self._tray_icon.showMessage(
                '桌面中控', '应用已最小化到托盘',
                QSystemTrayIcon.Information, 2000
            )
        else:
            self._save_window_state()
            event.accept()


from PyQt5.QtWidgets import QApplication
