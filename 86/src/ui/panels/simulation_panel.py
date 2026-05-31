from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QGroupBox,
    QTableWidget, QTableWidgetItem, QHeaderView, QComboBox, QSplitter,
    QDoubleSpinBox, QSpinBox, QCheckBox, QTreeWidget, QTreeWidgetItem,
    QMessageBox
)
from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QColor, QBrush
from src.project_manager.project_manager import ProjectManager
from src.device_comm.offline_simulator import (
    OfflineSimulator, SimulationEvent, SimulationEventType
)
from src.core.event_bus import EventBus, EventType


class SimulationPanel(QWidget):
    def __init__(self, project_manager: ProjectManager, parent=None):
        super().__init__(parent)
        self._project_manager = project_manager
        self._simulator = OfflineSimulator()
        self._update_timer = QTimer(self)
        self._update_timer.timeout.connect(self._update_display)
        self._event_bus = EventBus()
        self._event_bus.subscribe(EventType.TAG_VALUE_CHANGED, self._on_tag_value_changed)
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)

        control_group = QGroupBox("仿真控制")
        control_layout = QHBoxLayout(control_group)

        self._start_btn = QPushButton("开始仿真")
        self._start_btn.clicked.connect(self._toggle_simulation)
        control_layout.addWidget(self._start_btn)

        self._reset_btn = QPushButton("重置")
        self._reset_btn.clicked.connect(self._reset_simulation)
        control_layout.addWidget(self._reset_btn)

        control_layout.addWidget(QLabel("速度:"))
        self._speed_spin = QDoubleSpinBox()
        self._speed_spin.setRange(0.1, 100.0)
        self._speed_spin.setValue(1.0)
        self._speed_spin.setSingleStep(0.5)
        control_layout.addWidget(self._speed_spin)

        self._time_label = QLabel("仿真时间: 0.0s")
        control_layout.addWidget(self._time_label)
        control_layout.addStretch()
        layout.addWidget(control_group)

        splitter = QSplitter(Qt.Horizontal)

        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(0, 0, 0, 0)

        tags_group = QGroupBox("点位数据")
        tags_layout = QVBoxLayout(tags_group)
        self._tags_tree = QTreeWidget()
        self._tags_tree.setHeaderLabels(["点位", "当前值", "单位"])
        tags_layout.addWidget(self._tags_tree)
        left_layout.addWidget(tags_group)
        splitter.addWidget(left_panel)

        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0)

        events_group = QGroupBox("仿真事件")
        events_layout = QVBoxLayout(events_group)

        event_form = QHBoxLayout()
        event_form.addWidget(QLabel("事件类型:"))
        self._event_type_combo = QComboBox()
        for et in SimulationEventType:
            self._event_type_combo.addItem(et.value, et)
        event_form.addWidget(self._event_type_combo)
        events_layout.addLayout(event_form)

        params_layout = QHBoxLayout()
        params_layout.addWidget(QLabel("开始时间:"))
        self._start_time_spin = QDoubleSpinBox()
        self._start_time_spin.setRange(0, 10000)
        params_layout.addWidget(self._start_time_spin)
        params_layout.addWidget(QLabel("持续时间:"))
        self._duration_spin = QDoubleSpinBox()
        self._duration_spin.setRange(0.1, 10000)
        self._duration_spin.setValue(10)
        params_layout.addWidget(self._duration_spin)
        events_layout.addLayout(params_layout)

        value_params_layout = QHBoxLayout()
        value_params_layout.addWidget(QLabel("目标值:"))
        self._target_value_spin = QDoubleSpinBox()
        self._target_value_spin.setRange(-100000, 100000)
        value_params_layout.addWidget(self._target_value_spin)
        events_layout.addLayout(value_params_layout)

        add_event_btn = QPushButton("添加事件")
        add_event_btn.clicked.connect(self._add_event)
        events_layout.addWidget(add_event_btn)

        self._events_table = QTableWidget(0, 4)
        self._events_table.setHorizontalHeaderLabels(["事件类型", "点位", "开始时间", "持续时间"])
        self._events_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        events_layout.addWidget(self._events_table)

        event_btn_layout = QHBoxLayout()
        remove_event_btn = QPushButton("删除事件")
        remove_event_btn.clicked.connect(self._remove_event)
        clear_events_btn = QPushButton("清空事件")
        clear_events_btn.clicked.connect(self._clear_events)
        event_btn_layout.addWidget(remove_event_btn)
        event_btn_layout.addWidget(clear_events_btn)
        events_layout.addLayout(event_btn_layout)

        right_layout.addWidget(events_group)

        splitter.addWidget(right_panel)
        splitter.setStretchFactor(0, 2)
        splitter.setStretchFactor(1, 1)
        layout.addWidget(splitter)

        self._refresh_data()

    def _refresh_data(self):
        project = self._project_manager.current_project
        if not project:
            return

        self._tags_tree.clear()
        for device_id, device in project.devices.items():
            device_item = QTreeWidgetItem([device.device_name])
            for tag_name, tag in device.tags.items():
                tag_item = QTreeWidgetItem([
                    tag.name,
                    str(tag.current_value),
                    tag.unit
                ])
                tag_item.setData(0, Qt.UserRole, (device_id, tag_name))
                device_item.addChild(tag_item)
            self._tags_tree.addTopLevelItem(device_item)
            device_item.setExpanded(True)

    def _toggle_simulation(self):
        if not self._simulator.running:
            project = self._project_manager.current_project
            if not project:
                QMessageBox.warning(self, "提示", "请先打开工程")
                return
            self._simulator.clear_events()
            for device in project.devices.values():
                self._simulator.add_device(device)
            self._simulator.start_simulation(self._speed_spin.value())
            self._start_btn.setText("停止仿真")
            self._update_timer.start(50)
            self._events_table.setRowCount(0)
            self._speed_spin.setEnabled(False)
        else:
            self._simulator.stop_simulation()
            self._start_btn.setText("开始仿真")
            self._update_timer.stop()
            self._speed_spin.setEnabled(True)

    def _reset_simulation(self):
        self._simulator.reset_simulation()
        self._time_label.setText("仿真时间: 0.0s")

    def _update_display(self):
        try:
            sim_time = self._simulator.simulation_time
            self._time_label.setText(f"仿真时间: {sim_time:.1f}s")
            for i in range(self._tags_tree.topLevelItemCount()):
                device_item = self._tags_tree.topLevelItem(i)
                for j in range(device_item.childCount()):
                    tag_item = device_item.child(j)
                    try:
                        tag_data = tag_item.data(0, Qt.UserRole)
                        if tag_data is None:
                            continue
                        device_id, tag_name = tag_data
                        value = self._simulator.get_tag_value(device_id, tag_name)
                        if value is not None:
                            try:
                                numeric_value = float(value)
                                current_text = tag_item.text(1)
                                try:
                                    current_value = float(current_text)
                                    if abs(numeric_value - current_value) > 0.001:
                                        tag_item.setText(1, f"{numeric_value:.3f}")
                                except (ValueError, TypeError):
                                    tag_item.setText(1, f"{numeric_value:.3f}")
                            except (ValueError, TypeError):
                                tag_item.setText(1, str(value))
                    except Exception as e:
                        continue
        except Exception as e:
            print(f"Update display error: {e}")

    def _on_tag_value_changed(self, data):
        device_id = data.get("device", "")
        tag_name = data.get("tag", "")
        value = data.get("value", 0)
        for i in range(self._tags_tree.topLevelItemCount()):
            device_item = self._tags_tree.topLevelItem(i)
            for j in range(device_item.childCount()):
                tag_item = device_item.child(j)
                tag_data = tag_item.data(0, Qt.UserRole)
                if tag_data and tag_data[0] == device_id and tag_data[1] == tag_name:
                    try:
                        numeric_value = float(value)
                        tag_item.setText(1, f"{numeric_value:.3f}")
                    except (ValueError, TypeError):
                        tag_item.setText(1, str(value))
                    break

    def _add_event(self):
        current_item = self._tags_tree.currentItem()
        if not current_item or current_item.childCount() > 0:
            QMessageBox.warning(self, "提示", "请选择一个点位")
            return
        device_id, tag_name = current_item.data(0, Qt.UserRole)
        event_type = self._event_type_combo.currentData()
        event = SimulationEvent(
            tag_name=f"{device_id}.{tag_name}",
            event_type=event_type,
            start_time=self._start_time_spin.value(),
            duration=self._duration_spin.value(),
            parameters={"target_value": self._target_value_spin.value()}
        )
        self._simulator.add_simulation_event(event)
        row = self._events_table.rowCount()
        self._events_table.insertRow(row)
        self._events_table.setItem(row, 0, QTableWidgetItem(event_type.value))
        self._events_table.setItem(row, 1, QTableWidgetItem(f"{device_id}.{tag_name}"))
        self._events_table.setItem(row, 2, QTableWidgetItem(str(self._start_time_spin.value())))
        self._events_table.setItem(row, 3, QTableWidgetItem(str(self._duration_spin.value())))

    def _remove_event(self):
        current_row = self._events_table.currentRow()
        if current_row >= 0:
            self._events_table.removeRow(current_row)
            if current_row < len(self._simulator._simulation_events):
                del self._simulator._simulation_events[current_row]

    def _clear_events(self):
        self._events_table.setRowCount(0)
        self._simulator.clear_events()
