from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QFormLayout, QLineEdit,
    QTextEdit, QPushButton, QLabel, QGroupBox, QTableWidget,
    QTableWidgetItem, QHeaderView, QMessageBox
)
from PySide6.QtCore import Qt
from src.project_manager.project_manager import ProjectManager
from src.core.models import DeviceConfig, TagPoint, PointType, DataType


class ProjectPanel(QWidget):
    def __init__(self, project_manager: ProjectManager, parent=None):
        super().__init__(parent)
        self._project_manager = project_manager
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)

        info_group = QGroupBox("工程信息")
        form_layout = QFormLayout(info_group)

        self._project_name_edit = QLineEdit()
        self._project_version_edit = QLineEdit()
        self._project_author_edit = QLineEdit()
        self._project_desc_edit = QTextEdit()
        self._project_desc_edit.setMaximumHeight(100)

        form_layout.addRow("工程名称:", self._project_name_edit)
        form_layout.addRow("版本:", self._project_version_edit)
        form_layout.addRow("作者:", self._project_author_edit)
        form_layout.addRow("描述:", self._project_desc_edit)

        layout.addWidget(info_group)

        devices_group = QGroupBox("设备列表")
        devices_layout = QVBoxLayout(devices_group)

        self._devices_table = QTableWidget(0, 4)
        self._devices_table.setHorizontalHeaderLabels(["设备ID", "设备名称", "协议", "状态"])
        self._devices_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        devices_layout.addWidget(self._devices_table)

        btn_layout = QHBoxLayout()
        add_device_btn = QPushButton("添加设备")
        add_device_btn.clicked.connect(self._add_device)
        remove_device_btn = QPushButton("删除设备")
        remove_device_btn.clicked.connect(self._remove_device)
        btn_layout.addWidget(add_device_btn)
        btn_layout.addWidget(remove_device_btn)
        devices_layout.addLayout(btn_layout)

        layout.addWidget(devices_group)

        tags_group = QGroupBox("点位列表")
        tags_layout = QVBoxLayout(tags_group)

        self._tags_table = QTableWidget(0, 6)
        self._tags_table.setHorizontalHeaderLabels([
            "点位名称", "地址", "类型", "数据类型", "最小值", "最大值"
        ])
        self._tags_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        tags_layout.addWidget(self._tags_table)

        tag_btn_layout = QHBoxLayout()
        add_tag_btn = QPushButton("添加点位")
        add_tag_btn.clicked.connect(self._add_tag)
        remove_tag_btn = QPushButton("删除点位")
        remove_tag_btn.clicked.connect(self._remove_tag)
        import_tags_btn = QPushButton("批量导入")
        import_tags_btn.clicked.connect(self._import_tags)
        tag_btn_layout.addWidget(add_tag_btn)
        tag_btn_layout.addWidget(remove_tag_btn)
        tag_btn_layout.addWidget(import_tags_btn)
        tags_layout.addLayout(tag_btn_layout)

        layout.addWidget(tags_group)

        self._refresh_data()

    def _refresh_data(self):
        project = self._project_manager.current_project
        if not project:
            return

        self._project_name_edit.setText(project.project_name)
        self._project_version_edit.setText(project.version)
        self._project_author_edit.setText(project.author)
        self._project_desc_edit.setPlainText(project.description)

        self._devices_table.setRowCount(0)
        for device_id, device in project.devices.items():
            row = self._devices_table.rowCount()
            self._devices_table.insertRow(row)
            self._devices_table.setItem(row, 0, QTableWidgetItem(device.device_id))
            self._devices_table.setItem(row, 1, QTableWidgetItem(device.device_name))
            self._devices_table.setItem(row, 2, QTableWidgetItem(device.protocol))
            self._devices_table.setItem(row, 3, QTableWidgetItem(device.status.value))

        self._tags_table.setRowCount(0)
        for device in project.devices.values():
            for tag_name, tag in device.tags.items():
                row = self._tags_table.rowCount()
                self._tags_table.insertRow(row)
                self._tags_table.setItem(row, 0, QTableWidgetItem(tag.name))
                self._tags_table.setItem(row, 1, QTableWidgetItem(tag.address))
                self._tags_table.setItem(row, 2, QTableWidgetItem(tag.point_type.value))
                self._tags_table.setItem(row, 3, QTableWidgetItem(tag.data_type.value))
                self._tags_table.setItem(row, 4, QTableWidgetItem(str(tag.min_value)))
                self._tags_table.setItem(row, 5, QTableWidgetItem(str(tag.max_value)))

    def _add_device(self):
        if not self._project_manager.current_project:
            QMessageBox.warning(self, "提示", "请先创建或打开工程")
            return
        from PySide6.QtWidgets import QDialog, QDialogButtonBox
        dialog = QDialog(self)
        dialog.setWindowTitle("添加设备")
        form = QFormLayout(dialog)
        name_edit = QLineEdit()
        protocol_edit = QLineEdit("modbus")
        ip_edit = QLineEdit("127.0.0.1")
        port_edit = QLineEdit("502")
        form.addRow("设备名称:", name_edit)
        form.addRow("协议:", protocol_edit)
        form.addRow("IP地址:", ip_edit)
        form.addRow("端口:", port_edit)
        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(dialog.accept)
        buttons.rejected.connect(dialog.reject)
        form.addRow(buttons)
        if dialog.exec() == QDialog.Accepted:
            import uuid
            device = DeviceConfig(
                device_id=str(uuid.uuid4()),
                device_name=name_edit.text(),
                protocol=protocol_edit.text(),
                ip_address=ip_edit.text(),
                port=int(port_edit.text())
            )
            self._project_manager.add_device(device)
            self._refresh_data()

    def _remove_device(self):
        current_row = self._devices_table.currentRow()
        if current_row < 0:
            return
        device_id = self._devices_table.item(current_row, 0).text()
        reply = QMessageBox.question(self, "确认", "确定删除该设备?")
        if reply == QMessageBox.Yes:
            self._project_manager.remove_device(device_id)
            self._refresh_data()

    def _add_tag(self):
        if not self._project_manager.current_project or not self._project_manager.current_project.devices:
            QMessageBox.warning(self, "提示", "请先添加设备")
            return
        from PySide6.QtWidgets import QDialog, QDialogButtonBox, QComboBox
        dialog = QDialog(self)
        dialog.setWindowTitle("添加点位")
        form = QFormLayout(dialog)
        device_combo = QComboBox()
        for device in self._project_manager.current_project.devices.values():
            device_combo.addItem(device.device_name, device.device_id)
        name_edit = QLineEdit()
        address_edit = QLineEdit()
        type_combo = QComboBox()
        for pt in PointType:
            type_combo.addItem(pt.value, pt)
        data_type_combo = QComboBox()
        for dt in DataType:
            data_type_combo.addItem(dt.value, dt)
        min_edit = QLineEdit("0")
        max_edit = QLineEdit("100")
        form.addRow("所属设备:", device_combo)
        form.addRow("点位名称:", name_edit)
        form.addRow("地址:", address_edit)
        form.addRow("点位类型:", type_combo)
        form.addRow("数据类型:", data_type_combo)
        form.addRow("最小值:", min_edit)
        form.addRow("最大值:", max_edit)
        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(dialog.accept)
        buttons.rejected.connect(dialog.reject)
        form.addRow(buttons)
        if dialog.exec() == QDialog.Accepted:
            device_id = device_combo.currentData()
            device = self._project_manager.current_project.devices[device_id]
            tag = TagPoint(
                name=name_edit.text(),
                address=address_edit.text(),
                point_type=type_combo.currentData(),
                data_type=data_type_combo.currentData(),
                min_value=float(min_edit.text()),
                max_value=float(max_edit.text())
            )
            device.tags[tag.name] = tag
            self._refresh_data()

    def _remove_tag(self):
        QMessageBox.information(self, "提示", "请在设备配置中删除点位")

    def _import_tags(self):
        QMessageBox.information(self, "提示", "批量导入功能开发中")
