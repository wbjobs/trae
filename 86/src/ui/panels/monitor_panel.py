from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QGroupBox,
    QTableWidget, QTableWidgetItem, QHeaderView, QComboBox, QSplitter,
    QTextEdit
)
from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QColor, QBrush
from src.project_manager.project_manager import ProjectManager
from src.device_comm.communication_manager import CommunicationManager
from src.device_comm.offline_simulator import OfflineSimulator
from src.core.models import DeviceStatus
from src.core.event_bus import EventBus, EventType


class MonitorPanel(QWidget):
    tag_value_changed = Signal(str, str, object)

    def __init__(self, project_manager: ProjectManager, parent=None):
        super().__init__(parent)
        self._project_manager = project_manager
        self._comm_manager = CommunicationManager()
        self._simulator = OfflineSimulator()
        self._event_bus = EventBus()
        self._update_timer = QTimer(self)
        self._update_timer.timeout.connect(self._update_display)
        self._init_ui()
        self._connect_events()

    def _init_ui(self):
        layout = QVBoxLayout(self)

        control_group = QGroupBox("连接控制")
        control_layout = QHBoxLayout(control_group)

        self._mode_combo = QComboBox()
        self._mode_combo.addItem("离线仿真", "simulation")
        self._mode_combo.addItem("在线连接", "online")
        control_layout.addWidget(QLabel("模式:"))
        control_layout.addWidget(self._mode_combo)

        self._connect_btn = QPushButton("开始连接")
        self._connect_btn.clicked.connect(self._toggle_connection)
        control_layout.addWidget(self._connect_btn)

        self._status_label = QLabel("状态: 未连接")
        control_layout.addWidget(self._status_label)

        control_layout.addStretch()
        layout.addWidget(control_group)

        splitter = QSplitter(Qt.Horizontal)

        devices_group = QGroupBox("设备状态")
        devices_layout = QVBoxLayout(devices_group)
        self._devices_table = QTableWidget(0, 3)
        self._devices_table.setHorizontalHeaderLabels(["设备名称", "状态", "点位数量"])
        self._devices_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        devices_layout.addWidget(self._devices_table)
        splitter.addWidget(devices_group)

        tags_group = QGroupBox("实时数据")
        tags_layout = QVBoxLayout(tags_group)
        self._tags_table = QTableWidget(0, 5)
        self._tags_table.setHorizontalHeaderLabels([
            "点位名称", "当前值", "单位", "更新时间", "状态"
        ])
        self._tags_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        tags_layout.addWidget(self._tags_table)
        splitter.addWidget(tags_group)

        layout.addWidget(splitter)

        log_group = QGroupBox("通信日志")
        log_layout = QVBoxLayout(log_group)
        self._log_view = QTextEdit()
        self._log_view.setReadOnly(True)
        log_layout.addWidget(self._log_view)
        layout.addWidget(log_group)

        self._refresh_data()

    def _connect_events(self):
        self._event_bus.subscribe(EventType.TAG_VALUE_CHANGED, self._on_tag_changed)
        self._event_bus.subscribe(EventType.COMMUNICATION_ERROR, self._on_comm_error)
        self._event_bus.subscribe(EventType.ALARM_TRIGGERED, self._on_alarm)

    def _refresh_data(self):
        project = self._project_manager.current_project
        if not project:
            return

        self._devices_table.setRowCount(0)
        self._tags_table.setRowCount(0)

        for device_id, device in project.devices.items():
            row = self._devices_table.rowCount()
            self._devices_table.insertRow(row)
            self._devices_table.setItem(row, 0, QTableWidgetItem(device.device_name))

            status_item = QTableWidgetItem(device.status.value)
            if device.status == DeviceStatus.ONLINE:
                status_item.setForeground(QBrush(QColor(0, 150, 0)))
            elif device.status == DeviceStatus.FAULT:
                status_item.setForeground(QBrush(QColor(200, 0, 0)))
            elif device.status == DeviceStatus.SIMULATING:
                status_item.setForeground(QBrush(QColor(0, 100, 200)))
            self._devices_table.setItem(row, 1, status_item)

            self._devices_table.setItem(row, 2, QTableWidgetItem(str(len(device.tags))))

            for tag_name, tag in device.tags.items():
                tag_row = self._tags_table.rowCount()
                self._tags_table.insertRow(tag_row)
                self._tags_table.setItem(tag_row, 0, QTableWidgetItem(tag.name))
                self._tags_table.setItem(tag_row, 1, QTableWidgetItem(str(tag.current_value)))
                self._tags_table.setItem(tag_row, 2, QTableWidgetItem(tag.unit))
                self._tags_table.setItem(tag_row, 3, QTableWidgetItem(tag.last_update.strftime("%H:%M:%S")))
                self._tags_table.setItem(tag_row, 4, QTableWidgetItem("正常"))

    def _toggle_connection(self):
        mode = self._mode_combo.currentData()
        if self._connect_btn.text() == "开始连接":
            project = self._project_manager.current_project
            if not project:
                return
            offline_mode = (mode == "simulation")
            for device in project.devices.values():
                monitor = self._comm_manager.add_device(device, offline_mode)
                if offline_mode:
                    self._simulator.add_device(device)
            self._comm_manager.connect_all()
            self._comm_manager.start_all_monitoring(1000)
            if offline_mode:
                self._simulator.start_simulation()
            self._connect_btn.setText("断开连接")
            self._status_label.setText("状态: 运行中")
            self._update_timer.start(500)
            self._add_log("连接已建立")
        else:
            self._comm_manager.stop_all_monitoring()
            self._comm_manager.disconnect_all()
            if self._simulator.running:
                self._simulator.stop_simulation()
            self._connect_btn.setText("开始连接")
            self._status_label.setText("状态: 已断开")
            self._update_timer.stop()
            self._add_log("连接已断开")

    def _update_display(self):
        all_values = self._comm_manager.get_all_tag_values()
        for device_id, tag_values in all_values.items():
            for tag_name, value in tag_values.items():
                for row in range(self._tags_table.rowCount()):
                    if self._tags_table.item(row, 0).text() == tag_name:
                        self._tags_table.item(row, 1).setText(str(value))
                        from datetime import datetime
                        self._tags_table.item(row, 3).setText(datetime.now().strftime("%H:%M:%S"))
                        break

        for row in range(self._devices_table.rowCount()):
            device_name = self._devices_table.item(row, 0).text()
            project = self._project_manager.current_project
            if project:
                for device in project.devices.values():
                    if device.device_name == device_name:
                        monitor = self._comm_manager.get_monitor(device.device_id)
                        if monitor:
                            status_item = self._devices_table.item(row, 1)
                            status_item.setText(monitor.status.value)
                            if monitor.status == DeviceStatus.ONLINE:
                                status_item.setForeground(QBrush(QColor(0, 150, 0)))
                            elif monitor.status == DeviceStatus.FAULT:
                                status_item.setForeground(QBrush(QColor(200, 0, 0)))
                            elif monitor.status == DeviceStatus.SIMULATING:
                                status_item.setForeground(QBrush(QColor(0, 100, 200)))
                        break

    def _on_tag_changed(self, data: dict):
        self.tag_value_changed.emit(data.get("device", ""), data.get("tag", ""), data.get("value"))

    def _on_comm_error(self, data: dict):
        self._add_log(f"通信错误: {data.get('device', '')} - {data.get('error', '')}")

    def _on_alarm(self, data: dict):
        self._add_log(f"报警: {data.get('tag', '')} {data.get('type', '')} - 值: {data.get('value', '')}")

    def _add_log(self, message: str):
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self._log_view.append(f"[{timestamp}] {message}")
