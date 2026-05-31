from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QFormLayout, QLineEdit,
    QPushButton, QLabel, QGroupBox, QTableWidget, QTableWidgetItem,
    QHeaderView, QComboBox, QDoubleSpinBox, QMessageBox, QSplitter
)
from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from src.project_manager.project_manager import ProjectManager
from src.param_engine.parameter_engine import (
    ParameterEngine, CalibrationConfig, CalibrationMethod, CalibrationPoint
)
from src.core.models import TagPoint


class ParameterPanel(QWidget):
    def __init__(self, project_manager: ProjectManager, parent=None):
        super().__init__(parent)
        self._project_manager = project_manager
        self._param_engine = ParameterEngine()
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)

        splitter = QSplitter(Qt.Vertical)

        tags_group = QGroupBox("点位参数调校")
        tags_layout = QVBoxLayout(tags_group)

        filter_layout = QHBoxLayout()
        filter_layout.addWidget(QLabel("设备筛选:"))
        self._device_combo = QComboBox()
        self._device_combo.addItem("全部设备", None)
        filter_layout.addWidget(self._device_combo)
        filter_layout.addStretch()
        tags_layout.addLayout(filter_layout)

        self._tags_table = QTableWidget(0, 8)
        self._tags_table.setHorizontalHeaderLabels([
            "点位名称", "当前值", "系数", "偏移量", "最小值", "最大值", "单位", "校准"
        ])
        self._tags_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self._tags_table.setEditTriggers(QTableWidget.DoubleClicked | QTableWidget.EditKeyPressed)
        tags_layout.addWidget(self._tags_table)

        btn_layout = QHBoxLayout()
        batch_calib_btn = QPushButton("批量校准")
        batch_calib_btn.clicked.connect(self._batch_calibrate)
        apply_btn = QPushButton("应用参数")
        apply_btn.clicked.connect(self._apply_parameters)
        reset_btn = QPushButton("重置")
        reset_btn.clicked.connect(self._reset_parameters)
        btn_layout.addWidget(batch_calib_btn)
        btn_layout.addWidget(apply_btn)
        btn_layout.addWidget(reset_btn)
        tags_layout.addLayout(btn_layout)

        splitter.addWidget(tags_group)

        calib_group = QGroupBox("校准配置")
        calib_layout = QFormLayout(calib_group)

        self._calib_method = QComboBox()
        self._calib_method.addItem("线性校准", CalibrationMethod.LINEAR)
        self._calib_method.addItem("多项式校准", CalibrationMethod.POLYNOMIAL)
        self._calib_method.addItem("样条插值", CalibrationMethod.SPLINE)
        calib_layout.addRow("校准方法:", self._calib_method)

        self._poly_degree = QLineEdit("1")
        calib_layout.addRow("多项式次数:", self._poly_degree)

        self._points_table = QTableWidget(0, 2)
        self._points_table.setHorizontalHeaderLabels(["原始值", "期望值"])
        self._points_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        calib_layout.addRow("校准点:", self._points_table)

        point_btn_layout = QHBoxLayout()
        add_point_btn = QPushButton("添加点")
        add_point_btn.clicked.connect(self._add_calibration_point)
        remove_point_btn = QPushButton("删除点")
        remove_point_btn.clicked.connect(self._remove_calibration_point)
        auto_calc_btn = QPushButton("自动计算")
        auto_calc_btn.clicked.connect(self._calculate_calibration)
        point_btn_layout.addWidget(add_point_btn)
        point_btn_layout.addWidget(remove_point_btn)
        point_btn_layout.addWidget(auto_calc_btn)
        calib_layout.addRow(point_btn_layout)

        self._coeff_label = QLabel("系数: -")
        self._offset_label = QLabel("偏移量: -")
        calib_layout.addRow(self._coeff_label)
        calib_layout.addRow(self._offset_label)

        splitter.addWidget(calib_group)

        layout.addWidget(splitter)

        self._refresh_data()

    def _refresh_data(self):
        project = self._project_manager.current_project
        if not project:
            return

        self._device_combo.clear()
        self._device_combo.addItem("全部设备", None)
        for device in project.devices.values():
            self._device_combo.addItem(device.device_name, device.device_id)

        self._tags_table.setRowCount(0)
        for device in project.devices.values():
            for tag_name, tag in device.tags.items():
                row = self._tags_table.rowCount()
                self._tags_table.insertRow(row)
                self._tags_table.setItem(row, 0, QTableWidgetItem(tag.name))
                self._tags_table.setItem(row, 1, QTableWidgetItem(str(tag.current_value)))
                self._tags_table.setItem(row, 2, QTableWidgetItem(str(tag.coefficient)))
                self._tags_table.setItem(row, 3, QTableWidgetItem(str(tag.offset)))
                self._tags_table.setItem(row, 4, QTableWidgetItem(str(tag.min_value)))
                self._tags_table.setItem(row, 5, QTableWidgetItem(str(tag.max_value)))
                self._tags_table.setItem(row, 6, QTableWidgetItem(tag.unit))

                calib_btn = QPushButton("校准")
                calib_btn.clicked.connect(lambda checked, t=tag: self._select_tag_for_calibration(t))
                self._tags_table.setCellWidget(row, 7, calib_btn)

                device_id_item = QTableWidgetItem(device.device_id)
                device_id_item.setData(Qt.UserRole, device.device_id)
                self._tags_table.setItem(row, 8, device_id_item)
                self._tags_table.setColumnHidden(8, True)

    def _select_tag_for_calibration(self, tag: TagPoint):
        self._selected_tag = tag
        self._points_table.setRowCount(0)
        calib_config = self._param_engine._calibrations.get(tag.name)
        if calib_config:
            for point in calib_config.points:
                row = self._points_table.rowCount()
                self._points_table.insertRow(row)
                self._points_table.setItem(row, 0, QTableWidgetItem(str(point.raw_value)))
                self._points_table.setItem(row, 1, QTableWidgetItem(str(point.expected_value)))

    def _add_calibration_point(self):
        row = self._points_table.rowCount()
        self._points_table.insertRow(row)
        self._points_table.setItem(row, 0, QTableWidgetItem("0"))
        self._points_table.setItem(row, 1, QTableWidgetItem("0"))

    def _remove_calibration_point(self):
        current_row = self._points_table.currentRow()
        if current_row >= 0:
            self._points_table.removeRow(current_row)

    def _calculate_calibration(self):
        if not hasattr(self, '_selected_tag'):
            QMessageBox.warning(self, "提示", "请先选择一个点位")
            return
        if self._points_table.rowCount() < 2:
            QMessageBox.warning(self, "提示", "至少需要2个校准点")
            return
        method = self._calib_method.currentData()
        degree_str = self._poly_degree.text()
        try:
            degree = int(degree_str) if degree_str.isdigit() else 1
        except (ValueError, TypeError):
            degree = 1
        calib_config = CalibrationConfig(
            tag_name=self._selected_tag.name,
            method=method,
            degree=degree
        )
        valid_points = []
        for row in range(self._points_table.rowCount()):
            raw_item = self._points_table.item(row, 0)
            exp_item = self._points_table.item(row, 1)
            if raw_item and exp_item:
                try:
                    raw_val = float(raw_item.text())
                    exp_val = float(exp_item.text())
                    valid_points.append(CalibrationPoint(raw_val, exp_val))
                except ValueError:
                    continue
        if len(valid_points) < 2:
            QMessageBox.warning(self, "提示", "有效校准点不足2个，请检查输入")
            return
        calib_config.points = valid_points
        self._param_engine.add_calibration(calib_config)
        self._coeff_label.setText(f"系数: {calib_config.coefficient:.6f}")
        self._offset_label.setText(f"偏移量: {calib_config.offset:.6f}")

    def _batch_calibrate(self):
        project = self._project_manager.current_project
        if not project:
            QMessageBox.warning(self, "提示", "请先打开工程")
            return
        tags = {}
        for device in project.devices.values():
            for tag_name, tag in device.tags.items():
                tags[tag_name] = tag
        results = self._param_engine.process_tags(tags)
        QMessageBox.information(self, "完成", f"已处理 {len(results)} 个点位")
        self._refresh_data()

    def _apply_parameters(self):
        project = self._project_manager.current_project
        if not project:
            QMessageBox.warning(self, "提示", "请先打开工程")
            return
        updated_count = 0
        for device in project.devices.values():
            for tag_name, tag in device.tags.items():
                if tag_name in self._param_engine._calibrations:
                    calib = self._param_engine._calibrations[tag_name]
                    tag.coefficient = calib.coefficient
                    tag.offset = calib.offset
                    updated_count += 1
        if hasattr(self, '_selected_tag') and self._selected_tag:
            tag_name = self._selected_tag.name
            for device in project.devices.values():
                if tag_name in device.tags:
                    calib = self._param_engine._calibrations.get(tag_name)
                    if calib:
                        device.tags[tag_name].coefficient = calib.coefficient
                        device.tags[tag_name].offset = calib.offset
                        break
        self._refresh_data()
        QMessageBox.information(self, "成功", f"已应用 {updated_count} 个点位的校准参数")

    def _reset_parameters(self):
        self._refresh_data()
