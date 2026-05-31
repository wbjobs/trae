import uuid
from typing import Dict, Any, Optional, List

from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel,
    QListWidget, QListWidgetItem, QDialog, QFormLayout, QLineEdit,
    QComboBox, QSpinBox, QCheckBox, QDialogButtonBox, QMessageBox,
    QMenu, QAction, QTextEdit, QTabWidget, QTableWidget, QTableWidgetItem,
    QHeaderView, QInputDialog
)
from PyQt5.QtCore import Qt, pyqtSignal, QSize
from PyQt5.QtGui import QIcon, QColor

from command_editor import Command, CommandStep, CommandType, CommandParameter

import logging
logger = logging.getLogger(__name__)


class CommandWidget(QWidget):
    execute_clicked = pyqtSignal(str)
    edit_clicked = pyqtSignal(str)
    delete_clicked = pyqtSignal(str)

    def __init__(self, command: Command, parent=None):
        super().__init__(parent)
        self._command = command
        self._init_ui()

    def _init_ui(self) -> None:
        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(8)

        info_layout = QVBoxLayout()
        info_layout.setSpacing(2)

        name_label = QLabel(self._command.name)
        name_label.setStyleSheet('font-weight: bold; font-size: 14px;')
        info_layout.addWidget(name_label)

        desc = self._command.description or f'{len(self._command.steps)} 个步骤'
        if self._command.shortcut_key:
            desc += f' | 快捷键: {self._command.shortcut_key}'
        desc_label = QLabel(desc)
        desc_label.setStyleSheet('color: #888; font-size: 12px;')
        info_layout.addWidget(desc_label)

        layout.addLayout(info_layout, 1)

        button_layout = QHBoxLayout()
        button_layout.setSpacing(4)

        execute_btn = QPushButton('执行')
        execute_btn.setFixedSize(60, 28)
        execute_btn.setStyleSheet('background-color: #2196f3; color: white;')
        execute_btn.clicked.connect(lambda: self.execute_clicked.emit(self._command.command_id))
        button_layout.addWidget(execute_btn)

        menu_btn = QPushButton('...')
        menu_btn.setFixedSize(30, 28)
        menu_btn.clicked.connect(self._show_menu)
        button_layout.addWidget(menu_btn)

        layout.addLayout(button_layout)

    def _show_menu(self) -> None:
        menu = QMenu(self)

        edit_action = QAction('编辑', self)
        edit_action.triggered.connect(lambda: self.edit_clicked.emit(self._command.command_id))
        menu.addAction(edit_action)

        duplicate_action = QAction('复制', self)
        duplicate_action.triggered.connect(self._on_duplicate)
        menu.addAction(duplicate_action)

        delete_action = QAction('删除', self)
        delete_action.triggered.connect(lambda: self.delete_clicked.emit(self._command.command_id))
        menu.addAction(delete_action)

        menu.exec_(self.sender().mapToGlobal(self.sender().rect().bottomLeft()))

    def _on_duplicate(self) -> None:
        pass

    def update_command(self, command: Command) -> None:
        self._command = command


class CommandPanel(QWidget):
    def __init__(self, command_manager=None, device_manager=None, parent=None):
        super().__init__(parent)
        self._command_manager = command_manager
        self._device_manager = device_manager
        self._command_widgets: Dict[str, CommandWidget] = {}
        self._init_ui()
        self.refresh()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(5)

        header_layout = QHBoxLayout()
        title_label = QLabel('快捷指令')
        title_label.setStyleSheet('font-weight: bold; font-size: 16px;')
        header_layout.addWidget(title_label)
        header_layout.addStretch()

        import_btn = QPushButton('导入')
        import_btn.clicked.connect(self._on_import_commands)
        header_layout.addWidget(import_btn)

        export_btn = QPushButton('导出')
        export_btn.clicked.connect(self._on_export_commands)
        header_layout.addWidget(export_btn)

        add_btn = QPushButton('+ 添加')
        add_btn.clicked.connect(self.show_add_command_dialog)
        header_layout.addWidget(add_btn)

        layout.addLayout(header_layout)

        self._category_combo = QComboBox()
        self._category_combo.addItem('全部', '')
        self._category_combo.currentIndexChanged.connect(self._on_category_changed)
        layout.addWidget(self._category_combo)

        self._command_list = QListWidget()
        self._command_list.setSpacing(2)
        layout.addWidget(self._command_list, 1)

        execute_all_btn = QPushButton('执行选中')
        execute_all_btn.clicked.connect(self._on_execute_selected)
        layout.addWidget(execute_all_btn)

    def refresh(self) -> None:
        self._command_list.clear()
        self._command_widgets.clear()

        if not self._command_manager:
            return

        categories = set()
        for command in self._command_manager.get_all_commands():
            categories.add(command.category)

        current_category = self._category_combo.currentData()
        self._category_combo.blockSignals(True)
        self._category_combo.clear()
        self._category_combo.addItem('全部', '')
        for cat in sorted(categories):
            self._category_combo.addItem(cat, cat)
        if current_category:
            idx = self._category_combo.findData(current_category)
            if idx >= 0:
                self._category_combo.setCurrentIndex(idx)
        self._category_combo.blockSignals(False)

        self._filter_commands()

    def _filter_commands(self) -> None:
        self._command_list.clear()
        self._command_widgets.clear()

        if not self._command_manager:
            return

        category = self._category_combo.currentData()
        commands = self._command_manager.get_all_commands()
        if category:
            commands = [c for c in commands if c.category == category]

        for command in commands:
            self._add_command_widget(command)

    def _add_command_widget(self, command: Command) -> None:
        widget = CommandWidget(command)
        widget.execute_clicked.connect(self._on_execute_command)
        widget.edit_clicked.connect(self._on_edit_command)
        widget.delete_clicked.connect(self._on_delete_command)

        item = QListWidgetItem(self._command_list)
        item.setSizeHint(QSize(0, 60))
        self._command_list.addItem(item)
        self._command_list.setItemWidget(item, widget)
        self._command_widgets[command.command_id] = widget

    def _on_category_changed(self, index: int) -> None:
        self._filter_commands()

    def _on_execute_command(self, command_id: str) -> None:
        if self._command_manager:
            self._command_manager.execute_command_async(command_id)

    def _on_execute_selected(self) -> None:
        for i in range(self._command_list.count()):
            item = self._command_list.item(i)
            if item.isSelected():
                widget = self._command_list.itemWidget(item)
                if isinstance(widget, CommandWidget):
                    self._on_execute_command(widget._command.command_id)

    def _on_edit_command(self, command_id: str) -> None:
        if not self._command_manager:
            return

        command = self._command_manager.get_command(command_id)
        if not command:
            return

        dialog = CommandDialog(command, self._device_manager, self)
        if dialog.exec_() == QDialog.Accepted:
            updated_command = dialog.get_command()
            self._command_manager.update_command(command_id, updated_command)
            self.refresh()

    def _on_delete_command(self, command_id: str) -> None:
        reply = QMessageBox.question(
            self, '确认删除', '确定要删除这个指令吗?',
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No
        )
        if reply == QMessageBox.Yes and self._command_manager:
            self._command_manager.remove_command(command_id)
            self.refresh()

    def show_add_command_dialog(self) -> None:
        dialog = CommandDialog(None, self._device_manager, self)
        if dialog.exec_() == QDialog.Accepted:
            command = dialog.get_command()
            if self._command_manager:
                self._command_manager.add_command(command)
                self.refresh()

    def _on_import_commands(self) -> None:
        if not self._command_manager:
            return
        file_path, _ = QFileDialog.getOpenFileName(
            self, '导入指令脚本', '', 'JSON Files (*.json);;All Files (*)'
        )
        if not file_path:
            return
        reply = QMessageBox.question(
            self, '导入模式',
            '是否覆盖已存在的指令？\n是：覆盖现有指令\n否：保留现有指令，重命名导入的指令',
            QMessageBox.Yes | QMessageBox.No | QMessageBox.Cancel,
            QMessageBox.No
        )
        if reply == QMessageBox.Cancel:
            return
        replace_existing = (reply == QMessageBox.Yes)
        count = self._command_manager.import_commands(file_path, replace_existing)
        if count > 0:
            QMessageBox.information(self, '导入成功', f'成功导入 {count} 个指令')
            self.refresh()
        else:
            QMessageBox.warning(self, '导入失败', '未能导入任何指令，请检查文件格式')

    def _on_export_commands(self) -> None:
        if not self._command_manager:
            return
        file_path, _ = QFileDialog.getSaveFileName(
            self, '导出指令脚本', 'commands.json', 'JSON Files (*.json);;All Files (*)'
        )
        if not file_path:
            return
        if self._command_manager.export_commands(file_path):
            QMessageBox.information(self, '导出成功', '指令已成功导出')
        else:
            QMessageBox.warning(self, '导出失败', '导出指令失败')


class CommandDialog(QDialog):
    def __init__(self, command: Optional[Command] = None, device_manager=None, parent=None):
        super().__init__(parent)
        self.setWindowTitle('指令编辑')
        self.resize(600, 500)
        self._command = command
        self._device_manager = device_manager
        self._steps: List[Dict[str, Any]] = []
        self._init_ui()

        if command:
            self._load_command(command)

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)

        tabs = QTabWidget()

        basic_tab = QWidget()
        basic_layout = QFormLayout(basic_tab)

        self._name_edit = QLineEdit()
        basic_layout.addRow('指令名称:', self._name_edit)

        self._desc_edit = QLineEdit()
        basic_layout.addRow('描述:', self._desc_edit)

        self._category_edit = QLineEdit()
        self._category_edit.setText('default')
        basic_layout.addRow('分类:', self._category_edit)

        self._shortcut_edit = QLineEdit()
        self._shortcut_edit.setPlaceholderText('例如: Ctrl+Alt+F1')
        basic_layout.addRow('快捷键:', self._shortcut_edit)

        self._type_combo = QComboBox()
        self._type_combo.addItems(['顺序执行', '并行执行', '条件执行'])
        basic_layout.addRow('执行方式:', self._type_combo)

        tabs.addTab(basic_tab, '基本信息')

        steps_tab = QWidget()
        steps_layout = QVBoxLayout(steps_tab)

        self._steps_table = QTableWidget(0, 5)
        self._steps_table.setHorizontalHeaderLabels(['设备', '指令', '参数', '延迟(前)', '延迟(后)'])
        self._steps_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        steps_layout.addWidget(self._steps_table)

        steps_btn_layout = QHBoxLayout()
        add_step_btn = QPushButton('添加步骤')
        add_step_btn.clicked.connect(self._on_add_step)
        steps_btn_layout.addWidget(add_step_btn)

        edit_step_btn = QPushButton('编辑步骤')
        edit_step_btn.clicked.connect(self._on_edit_step)
        steps_btn_layout.addWidget(edit_step_btn)

        delete_step_btn = QPushButton('删除步骤')
        delete_step_btn.clicked.connect(self._on_delete_step)
        steps_btn_layout.addWidget(delete_step_btn)

        up_btn = QPushButton('上移')
        up_btn.clicked.connect(self._on_move_up)
        steps_btn_layout.addWidget(up_btn)

        down_btn = QPushButton('下移')
        down_btn.clicked.connect(self._on_move_down)
        steps_btn_layout.addWidget(down_btn)

        steps_layout.addLayout(steps_btn_layout)
        tabs.addTab(steps_tab, '步骤编辑')

        advanced_tab = QWidget()
        advanced_layout = QFormLayout(advanced_tab)

        self._timeout_spin = QSpinBox()
        self._timeout_spin.setRange(1, 300)
        self._timeout_spin.setValue(30)
        advanced_layout.addRow('超时时间(秒):', self._timeout_spin)

        self._retry_spin = QSpinBox()
        self._retry_spin.setRange(0, 10)
        self._retry_spin.setValue(0)
        advanced_layout.addRow('重试次数:', self._retry_spin)

        tabs.addTab(advanced_tab, '高级')

        layout.addWidget(tabs)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _get_devices(self) -> List[str]:
        if not self._device_manager:
            return []
        return [d.device_id for d in self._device_manager.get_all_devices()]

    def _on_add_step(self) -> None:
        devices = self._get_devices()
        if not devices:
            QMessageBox.warning(self, '警告', '请先添加设备')
            return

        dialog = StepDialog(devices, self)
        if dialog.exec_() == QDialog.Accepted:
            step_data = dialog.get_step_data()
            self._steps.append(step_data)
            self._refresh_steps_table()

    def _on_edit_step(self) -> None:
        row = self._steps_table.currentRow()
        if row < 0 or row >= len(self._steps):
            return

        devices = self._get_devices()
        dialog = StepDialog(devices, self._steps[row], self)
        if dialog.exec_() == QDialog.Accepted:
            self._steps[row] = dialog.get_step_data()
            self._refresh_steps_table()

    def _on_delete_step(self) -> None:
        row = self._steps_table.currentRow()
        if row >= 0 and row < len(self._steps):
            del self._steps[row]
            self._refresh_steps_table()

    def _on_move_up(self) -> None:
        row = self._steps_table.currentRow()
        if row > 0:
            self._steps[row - 1], self._steps[row] = self._steps[row], self._steps[row - 1]
            self._refresh_steps_table()
            self._steps_table.setCurrentRow(row - 1)

    def _on_move_down(self) -> None:
        row = self._steps_table.currentRow()
        if row < len(self._steps) - 1:
            self._steps[row + 1], self._steps[row] = self._steps[row], self._steps[row + 1]
            self._refresh_steps_table()
            self._steps_table.setCurrentRow(row + 1)

    def _refresh_steps_table(self) -> None:
        self._steps_table.setRowCount(len(self._steps))
        for row, step in enumerate(self._steps):
            self._steps_table.setItem(row, 0, QTableWidgetItem(step.get('device_id', '')))
            self._steps_table.setItem(row, 1, QTableWidgetItem(step.get('command', '')))
            self._steps_table.setItem(row, 2, QTableWidgetItem(str(step.get('params', {}))))
            self._steps_table.setItem(row, 3, QTableWidgetItem(str(step.get('delay_before', 0))))
            self._steps_table.setItem(row, 4, QTableWidgetItem(str(step.get('delay_after', 0))))

    def _load_command(self, command: Command) -> None:
        self._name_edit.setText(command.name)
        self._desc_edit.setText(command.description)
        self._category_edit.setText(command.category)
        self._shortcut_edit.setText(command.shortcut_key)

        if command.command_type == CommandType.SEQUENCE:
            self._type_combo.setCurrentIndex(0)
        elif command.command_type == CommandType.PARALLEL:
            self._type_combo.setCurrentIndex(1)
        else:
            self._type_combo.setCurrentIndex(2)

        self._steps = [
            {
                'step_id': s.step_id,
                'device_id': s.device_id,
                'command': s.command,
                'params': s.params,
                'delay_before': s.delay_before,
                'delay_after': s.delay_after
            }
            for s in sorted(command.steps, key=lambda x: x.order)
        ]
        self._refresh_steps_table()

    def get_command(self) -> Command:
        type_map = {
            0: CommandType.SEQUENCE,
            1: CommandType.PARALLEL,
            2: CommandType.CONDITIONAL
        }
        command_type = type_map.get(self._type_combo.currentIndex(), CommandType.SEQUENCE)

        steps = []
        for i, step_data in enumerate(self._steps):
            existing_step_id = step_data.get('step_id')
            step = CommandStep(
                step_id=existing_step_id or f'step_{i}_{uuid.uuid4().hex[:8]}',
                device_id=step_data.get('device_id', ''),
                command=step_data.get('command', ''),
                order=i,
                params=step_data.get('params', {}),
                delay_before=step_data.get('delay_before', 0.0),
                delay_after=step_data.get('delay_after', 0.0),
                timeout=self._timeout_spin.value(),
                retry_count=self._retry_spin.value()
            )
            steps.append(step)

        command_id = self._command.command_id if self._command else str(uuid.uuid4())

        return Command(
            command_id=command_id,
            name=self._name_edit.text().strip() or '未命名指令',
            description=self._desc_edit.text().strip(),
            command_type=command_type,
            steps=steps,
            shortcut_key=self._shortcut_edit.text().strip(),
            category=self._category_edit.text().strip() or 'default'
        )

    def accept(self) -> None:
        if not self._name_edit.text().strip():
            QMessageBox.warning(self, '警告', '请输入指令名称')
            return
        if not self._steps:
            QMessageBox.warning(self, '警告', '请添加至少一个步骤')
            return
        super().accept()


class StepDialog(QDialog):
    def __init__(self, devices: List[str], step_data: Optional[Dict[str, Any]] = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle('步骤配置')
        self.resize(400, 300)
        self._devices = devices
        self._step_data = step_data or {}
        self._init_ui()

    def _init_ui(self) -> None:
        layout = QFormLayout(self)

        self._device_combo = QComboBox()
        self._device_combo.addItems(self._devices)
        layout.addRow('目标设备:', self._device_combo)

        self._command_edit = QLineEdit()
        self._command_edit.setPlaceholderText('例如: write_single_register')
        layout.addRow('指令名称:', self._command_edit)

        self._params_edit = QTextEdit()
        self._params_edit.setPlaceholderText('参数 (JSON格式), 例如: {"address": 0, "value": 100}')
        self._params_edit.setFixedHeight(80)
        layout.addRow('参数:', self._params_edit)

        self._delay_before_spin = QSpinBox()
        self._delay_before_spin.setRange(0, 60000)
        self._delay_before_spin.setValue(0)
        layout.addRow('执行前延迟(毫秒):', self._delay_before_spin)

        self._delay_after_spin = QSpinBox()
        self._delay_after_spin.setRange(0, 60000)
        self._delay_after_spin.setValue(0)
        layout.addRow('执行后延迟(毫秒):', self._delay_after_spin)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addRow(buttons)

        if self._step_data:
            self._device_combo.setCurrentText(self._step_data.get('device_id', ''))
            self._command_edit.setText(self._step_data.get('command', ''))
            import json
            self._params_edit.setPlainText(json.dumps(self._step_data.get('params', {}), ensure_ascii=False))
            self._delay_before_spin.setValue(int(self._step_data.get('delay_before', 0) * 1000))
            self._delay_after_spin.setValue(int(self._step_data.get('delay_after', 0) * 1000))

    def get_step_data(self) -> Dict[str, Any]:
        import json
        try:
            params = json.loads(self._params_edit.toPlainText())
        except (json.JSONDecodeError, ValueError):
            params = {}

        return {
            'device_id': self._device_combo.currentText(),
            'command': self._command_edit.text().strip(),
            'params': params if isinstance(params, dict) else {},
            'delay_before': self._delay_before_spin.value() / 1000.0,
            'delay_after': self._delay_after_spin.value() / 1000.0
        }

    def accept(self) -> None:
        if not self._device_combo.currentText():
            QMessageBox.warning(self, '警告', '请选择目标设备')
            return
        if not self._command_edit.text().strip():
            QMessageBox.warning(self, '警告', '请输入指令名称')
            return
        super().accept()
