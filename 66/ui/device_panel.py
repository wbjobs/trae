import uuid
from typing import Dict, Any, Optional, List

from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel,
    QListWidget, QListWidgetItem, QDialog, QFormLayout, QLineEdit,
    QComboBox, QSpinBox, QCheckBox, QDialogButtonBox, QMessageBox,
    QMenu, QAction, QInputDialog
)
from PyQt5.QtCore import Qt, pyqtSignal, QSize
from PyQt5.QtGui import QIcon, QColor, QPixmap, QPainter

from peripheral_adapter import PeripheralDevice, DeviceStatus

import logging
logger = logging.getLogger(__name__)


class DeviceWidget(QWidget):
    connect_clicked = pyqtSignal(str)
    disconnect_clicked = pyqtSignal(str)
    edit_clicked = pyqtSignal(str)
    delete_clicked = pyqtSignal(str)

    def __init__(self, device: PeripheralDevice, parent=None):
        super().__init__(parent)
        self._device = device
        self._init_ui()
        self._update_display()

    def _init_ui(self) -> None:
        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(8)

        self._status_icon = QLabel()
        self._status_icon.setFixedSize(16, 16)
        layout.addWidget(self._status_icon)

        info_layout = QVBoxLayout()
        info_layout.setSpacing(2)

        self._name_label = QLabel(self._device.name)
        self._name_label.setStyleSheet('font-weight: bold; font-size: 14px;')
        info_layout.addWidget(self._name_label)

        self._info_label = QLabel()
        self._info_label.setStyleSheet('color: #888; font-size: 12px;')
        info_layout.addWidget(self._info_label)

        layout.addLayout(info_layout, 1)

        button_layout = QHBoxLayout()
        button_layout.setSpacing(4)

        self._connect_btn = QPushButton()
        self._connect_btn.setFixedSize(60, 28)
        self._connect_btn.clicked.connect(self._on_connect_toggled)
        button_layout.addWidget(self._connect_btn)

        self._menu_btn = QPushButton('...')
        self._menu_btn.setFixedSize(30, 28)
        self._menu_btn.clicked.connect(self._show_menu)
        button_layout.addWidget(self._menu_btn)

        layout.addLayout(button_layout)

        self.setContextMenuPolicy(Qt.CustomContextMenu)
        self.customContextMenuRequested.connect(self._show_context_menu)

    def _update_display(self) -> None:
        self._name_label.setText(self._device.name)

        conn_params = self._device.connection_params
        if self._device.driver_type == 'serial':
            port = conn_params.get('port', 'N/A')
            baudrate = conn_params.get('baudrate', 9600)
            self._info_label.setText(f'Serial: {port} @ {baudrate}')
        elif self._device.driver_type == 'network':
            host = conn_params.get('host', 'N/A')
            port = conn_params.get('port', 502)
            self._info_label.setText(f'Network: {host}:{port}')
        elif self._device.driver_type == 'usb':
            vid = conn_params.get('vid', 0)
            pid = conn_params.get('pid', 0)
            self._info_label.setText(f'USB: {vid:04X}:{pid:04X}')
        else:
            self._info_label.setText(f'Type: {self._device.device_type}')

        self._update_status_icon()
        self._update_connect_button()

    def _update_status_icon(self) -> None:
        color = QColor('#888')
        if self._device.status == DeviceStatus.CONNECTED:
            color = QColor('#4CAF50')
        elif self._device.status == DeviceStatus.CONNECTING:
            color = QColor('#FFC107')
        elif self._device.status == DeviceStatus.ERROR:
            color = QColor('#F44336')

        pixmap = QPixmap(16, 16)
        pixmap.fill(Qt.transparent)
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.Antialiasing)
        painter.setBrush(color)
        painter.setPen(Qt.NoPen)
        painter.drawEllipse(0, 0, 16, 16)
        painter.end()
        self._status_icon.setPixmap(pixmap)

    def _update_connect_button(self) -> None:
        if self._device.status == DeviceStatus.CONNECTED:
            self._connect_btn.setText('断开')
            self._connect_btn.setStyleSheet('background-color: #f44336; color: white;')
        elif self._device.status == DeviceStatus.CONNECTING:
            self._connect_btn.setText('连接中')
            self._connect_btn.setStyleSheet('background-color: #ffc107; color: black;')
        else:
            self._connect_btn.setText('连接')
            self._connect_btn.setStyleSheet('background-color: #4caf50; color: white;')

    def _on_connect_toggled(self) -> None:
        if self._device.status == DeviceStatus.CONNECTED:
            self.disconnect_clicked.emit(self._device.device_id)
        else:
            self.connect_clicked.emit(self._device.device_id)

    def _show_menu(self) -> None:
        menu = QMenu(self)

        edit_action = QAction('编辑', self)
        edit_action.triggered.connect(lambda: self.edit_clicked.emit(self._device.device_id))
        menu.addAction(edit_action)

        delete_action = QAction('删除', self)
        delete_action.triggered.connect(lambda: self.delete_clicked.emit(self._device.device_id))
        menu.addAction(delete_action)

        menu.exec_(self._menu_btn.mapToGlobal(self._menu_btn.rect().bottomLeft()))

    def _show_context_menu(self, pos) -> None:
        self._show_menu()

    def update_device(self, device: PeripheralDevice) -> None:
        self._device = device
        self._update_display()

    @property
    def device_id(self) -> str:
        return self._device.device_id


class DevicePanel(QWidget):
    def __init__(self, device_manager=None, parent=None):
        super().__init__(parent)
        self._device_manager = device_manager
        self._device_widgets: Dict[str, DeviceWidget] = {}
        self._init_ui()
        self.refresh()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(5)

        header_layout = QHBoxLayout()
        title_label = QLabel('设备列表')
        title_label.setStyleSheet('font-weight: bold; font-size: 16px;')
        header_layout.addWidget(title_label)
        header_layout.addStretch()

        add_btn = QPushButton('+ 添加')
        add_btn.clicked.connect(self.show_add_device_dialog)
        header_layout.addWidget(add_btn)

        layout.addLayout(header_layout)

        self._device_list = QListWidget()
        self._device_list.setSpacing(2)
        layout.addWidget(self._device_list, 1)

        if self._device_manager:
            self._device_manager.set_on_device_status(self._on_device_status)

    def refresh(self) -> None:
        self._device_list.clear()
        self._device_widgets.clear()

        if not self._device_manager:
            return

        for device in self._device_manager.get_all_devices():
            self._add_device_widget(device)

    def _add_device_widget(self, device: PeripheralDevice) -> None:
        widget = DeviceWidget(device)
        widget.connect_clicked.connect(self._on_connect_device)
        widget.disconnect_clicked.connect(self._on_disconnect_device)
        widget.edit_clicked.connect(self._on_edit_device)
        widget.delete_clicked.connect(self._on_delete_device)

        item = QListWidgetItem(self._device_list)
        item.setSizeHint(QSize(0, 60))
        self._device_list.addItem(item)
        self._device_list.setItemWidget(item, widget)
        self._device_widgets[device.device_id] = widget

    def _on_device_status(self, device_id: str, status) -> None:
        widget = self._device_widgets.get(device_id)
        if widget and self._device_manager:
            device = self._device_manager.get_device(device_id)
            if device:
                widget.update_device(device)

    def _on_connect_device(self, device_id: str) -> None:
        if self._device_manager:
            self._device_manager.connect_device(device_id)

    def _on_disconnect_device(self, device_id: str) -> None:
        if self._device_manager:
            self._device_manager.disconnect_device(device_id)

    def _on_edit_device(self, device_id: str) -> None:
        if not self._device_manager:
            return

        device = self._device_manager.get_device(device_id)
        if not device:
            return

        dialog = DeviceDialog(device, self)
        if dialog.exec_() == QDialog.Accepted:
            updated_device = dialog.get_device()
            self._device_manager.remove_device(device_id)
            self._device_manager.add_device(updated_device)
            self.refresh()

    def _on_delete_device(self, device_id: str) -> None:
        reply = QMessageBox.question(
            self, '确认删除', '确定要删除这个设备吗?',
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No
        )
        if reply == QMessageBox.Yes and self._device_manager:
            self._device_manager.remove_device(device_id)
            self.refresh()

    def show_add_device_dialog(self) -> None:
        dialog = DeviceDialog(parent=self)
        if dialog.exec_() == QDialog.Accepted:
            device = dialog.get_device()
            if self._device_manager:
                self._device_manager.add_device(device)
                self.refresh()


class DeviceDialog(QDialog):
    def __init__(self, device: Optional[PeripheralDevice] = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle('设备配置')
        self.resize(400, 400)
        self._device = device
        self._init_ui()

        if device:
            self._load_device(device)

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)

        form_layout = QFormLayout()
        form_layout.setSpacing(10)

        self._name_edit = QLineEdit()
        form_layout.addRow('设备名称:', self._name_edit)

        self._type_combo = QComboBox()
        self._type_combo.addItems(['PLC', '传感器', '执行器', '继电器', '其他'])
        form_layout.addRow('设备类型:', self._type_combo)

        self._driver_combo = QComboBox()
        self._driver_combo.addItems(['serial', 'network', 'usb'])
        self._driver_combo.currentTextChanged.connect(self._on_driver_changed)
        form_layout.addRow('连接方式:', self._driver_combo)

        self._protocol_combo = QComboBox()
        self._protocol_combo.addItems(['modbus', 'custom'])
        form_layout.addRow('通信协议:', self._protocol_combo)

        self._serial_widget = QWidget()
        serial_layout = QFormLayout(self._serial_widget)
        self._port_edit = QLineEdit()
        self._port_edit.setPlaceholderText('例如: COM3 或 /dev/ttyUSB0')
        serial_layout.addRow('端口:', self._port_edit)
        self._baudrate_spin = QSpinBox()
        self._baudrate_spin.setRange(9600, 921600)
        self._baudrate_spin.setValue(9600)
        serial_layout.addRow('波特率:', self._baudrate_spin)
        self._slave_spin = QSpinBox()
        self._slave_spin.setRange(1, 255)
        self._slave_spin.setValue(1)
        serial_layout.addRow('从站地址:', self._slave_spin)
        form_layout.addRow(self._serial_widget)

        self._network_widget = QWidget()
        network_layout = QFormLayout(self._network_widget)
        self._host_edit = QLineEdit()
        self._host_edit.setPlaceholderText('例如: 192.168.1.100')
        network_layout.addRow('IP地址:', self._host_edit)
        self._port_spin = QSpinBox()
        self._port_spin.setRange(1, 65535)
        self._port_spin.setValue(502)
        network_layout.addRow('端口:', self._port_spin)
        self._net_slave_spin = QSpinBox()
        self._net_slave_spin.setRange(1, 255)
        self._net_slave_spin.setValue(1)
        network_layout.addRow('从站地址:', self._net_slave_spin)
        form_layout.addRow(self._network_widget)

        self._usb_widget = QWidget()
        usb_layout = QFormLayout(self._usb_widget)
        self._vid_edit = QLineEdit()
        self._vid_edit.setPlaceholderText('例如: 0x1234')
        usb_layout.addRow('Vendor ID:', self._vid_edit)
        self._pid_edit = QLineEdit()
        self._pid_edit.setPlaceholderText('例如: 0x5678')
        usb_layout.addRow('Product ID:', self._pid_edit)
        form_layout.addRow(self._usb_widget)

        layout.addLayout(form_layout)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

        self._on_driver_changed(self._driver_combo.currentText())

    def _on_driver_changed(self, driver_type: str) -> None:
        self._serial_widget.setVisible(driver_type == 'serial')
        self._network_widget.setVisible(driver_type == 'network')
        self._usb_widget.setVisible(driver_type == 'usb')

    def _load_device(self, device: PeripheralDevice) -> None:
        self._name_edit.setText(device.name)
        self._type_combo.setCurrentText(device.device_type)
        self._driver_combo.setCurrentText(device.driver_type)
        self._protocol_combo.setCurrentText(device.protocol_type)

        params = device.connection_params
        if device.driver_type == 'serial':
            self._port_edit.setText(params.get('port', ''))
            self._baudrate_spin.setValue(params.get('baudrate', 9600))
            self._slave_spin.setValue(params.get('slave_address', 1))
        elif device.driver_type == 'network':
            self._host_edit.setText(params.get('host', ''))
            self._port_spin.setValue(params.get('port', 502))
            self._net_slave_spin.setValue(params.get('slave_address', 1))
        elif device.driver_type == 'usb':
            self._vid_edit.setText(f"0x{params.get('vid', 0):04X}")
            self._pid_edit.setText(f"0x{params.get('pid', 0):04X}")

    def get_device(self) -> PeripheralDevice:
        driver_type = self._driver_combo.currentText()
        protocol_type = self._protocol_combo.currentText()

        connection_params = {}
        if driver_type == 'serial':
            connection_params = {
                'port': self._port_edit.text().strip(),
                'baudrate': self._baudrate_spin.value(),
                'slave_address': self._slave_spin.value()
            }
        elif driver_type == 'network':
            connection_params = {
                'host': self._host_edit.text().strip(),
                'port': self._port_spin.value(),
                'slave_address': self._net_slave_spin.value()
            }
        elif driver_type == 'usb':
            try:
                vid = int(self._vid_edit.text().strip(), 16)
                pid = int(self._pid_edit.text().strip(), 16)
            except ValueError:
                vid = 0
                pid = 0
            connection_params = {'vid': vid, 'pid': pid}

        device_id = self._device.device_id if self._device else str(uuid.uuid4())

        return PeripheralDevice(
            device_id=device_id,
            name=self._name_edit.text().strip() or '未命名设备',
            device_type=self._type_combo.currentText(),
            driver_type=driver_type,
            protocol_type=protocol_type,
            connection_params=connection_params,
            capabilities=['read', 'write']
        )

    def accept(self) -> None:
        if not self._name_edit.text().strip():
            QMessageBox.warning(self, '警告', '请输入设备名称')
            return
        super().accept()
