import uuid
from typing import Dict, Any, Optional
from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QListWidget, QListWidgetItem, QDialog, QFormLayout, QLineEdit,
    QComboBox, QSpinBox, QCheckBox, QDialogButtonBox, QMessageBox,
    QTextEdit, QTableWidget, QTableWidgetItem, QHeaderView
)
from PyQt5.QtCore import Qt, pyqtSignal, QSize

from device_scheduler import LinkageRule, LinkageCondition, LinkageAction
from device_scheduler import LinkageConditionType, LinkageActionType

import logging
logger = logging.getLogger(__name__)


class LinkagePanel(QWidget):
    def __init__(self, linkage_engine=None, parent=None):
        super().__init__(parent)
        self._linkage_engine = linkage_engine
        self._init_ui()
        self.refresh()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(5)

        header_layout = QHBoxLayout()
        title_label = QLabel('联动规则')
        title_label.setStyleSheet('font-weight: bold; font-size: 16px;')
        header_layout.addWidget(title_label)
        header_layout.addStretch()

        add_btn = QPushButton('+ 添加规则')
        add_btn.clicked.connect(self._on_add_rule)
        header_layout.addWidget(add_btn)

        layout.addLayout(header_layout)

        self._rule_list = QListWidget()
        self._rule_list.setSpacing(2)
        layout.addWidget(self._rule_list, 1)

        button_layout = QHBoxLayout()
        edit_btn = QPushButton('编辑')
        edit_btn.clicked.connect(self._on_edit_rule)
        button_layout.addWidget(edit_btn)

        delete_btn = QPushButton('删除')
        delete_btn.clicked.connect(self._on_delete_rule)
        button_layout.addWidget(delete_btn)

        toggle_btn = QPushButton('启用/禁用')
        toggle_btn.clicked.connect(self._on_toggle_rule)
        button_layout.addWidget(toggle_btn)

        trigger_btn = QPushButton('立即触发')
        trigger_btn.clicked.connect(self._on_trigger_rule)
        button_layout.addWidget(trigger_btn)

        button_layout.addStretch()
        layout.addLayout(button_layout)

    def refresh(self) -> None:
        self._rule_list.clear()

        if not self._linkage_engine:
            return

        for rule in self._linkage_engine.get_all_rules():
            item = QListWidgetItem()
            item.setSizeHint(QSize(0, 50))

            widget = QWidget()
            widget_layout = QHBoxLayout(widget)
            widget_layout.setContentsMargins(8, 4, 8, 4)

            status_indicator = QLabel()
            status_indicator.setFixedSize(12, 12)
            if rule.enabled:
                status_indicator.setStyleSheet('background-color: #4CAF50; border-radius: 6px;')
            else:
                status_indicator.setStyleSheet('background-color: #9E9E9E; border-radius: 6px;')
            widget_layout.addWidget(status_indicator)

            info_layout = QVBoxLayout()
            info_layout.setSpacing(2)

            name_label = QLabel(rule.name)
            name_label.setStyleSheet('font-weight: bold;')
            info_layout.addWidget(name_label)

            desc = rule.description or f'{len(rule.conditions)} 条件, {len(rule.actions)} 动作'
            if rule.trigger_count > 0:
                desc += f' | 已触发 {rule.trigger_count} 次'
            desc_label = QLabel(desc)
            desc_label.setStyleSheet('color: #888; font-size: 12px;')
            info_layout.addWidget(desc_label)

            widget_layout.addLayout(info_layout, 1)

            item.setData(Qt.UserRole, rule.rule_id)
            self._rule_list.addItem(item)
            self._rule_list.setItemWidget(item, widget)

    def _get_selected_rule_id(self) -> Optional[str]:
        current_item = self._rule_list.currentItem()
        if not current_item:
            return None
        return current_item.data(Qt.UserRole)

    def _on_add_rule(self) -> None:
        dialog = LinkageRuleDialog(parent=self)
        if dialog.exec_() == QDialog.Accepted:
            rule = dialog.get_rule()
            if self._linkage_engine:
                self._linkage_engine.add_rule(rule)
                self.refresh()

    def _on_edit_rule(self) -> None:
        rule_id = self._get_selected_rule_id()
        if not rule_id or not self._linkage_engine:
            return

        rule = self._linkage_engine.get_rule(rule_id)
        if not rule:
            return

        dialog = LinkageRuleDialog(rule, self)
        if dialog.exec_() == QDialog.Accepted:
            updated_rule = dialog.get_rule()
            self._linkage_engine.remove_rule(rule_id)
            self._linkage_engine.add_rule(updated_rule)
            self.refresh()

    def _on_delete_rule(self) -> None:
        rule_id = self._get_selected_rule_id()
        if not rule_id:
            return

        reply = QMessageBox.question(
            self, '确认删除', '确定要删除这个联动规则吗?',
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No
        )
        if reply == QMessageBox.Yes and self._linkage_engine:
            self._linkage_engine.remove_rule(rule_id)
            self.refresh()

    def _on_toggle_rule(self) -> None:
        rule_id = self._get_selected_rule_id()
        if not rule_id or not self._linkage_engine:
            return

        rule = self._linkage_engine.get_rule(rule_id)
        if not rule:
            return

        if rule.enabled:
            self._linkage_engine.disable_rule(rule_id)
        else:
            self._linkage_engine.enable_rule(rule_id)
        self.refresh()

    def _on_trigger_rule(self) -> None:
        rule_id = self._get_selected_rule_id()
        if not rule_id or not self._linkage_engine:
            return

        if self._linkage_engine.trigger_rule(rule_id):
            QMessageBox.information(self, '成功', '规则已触发')
        else:
            QMessageBox.warning(self, '警告', '规则未启用或不存在')


class LinkageRuleDialog(QDialog):
    def __init__(self, rule: Optional[LinkageRule] = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle('联动规则配置')
        self.resize(600, 500)
        self._rule = rule
        self._conditions: List[Dict[str, Any]] = []
        self._actions: List[Dict[str, Any]] = []
        self._init_ui()

        if rule:
            self._load_rule(rule)

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)

        form_layout = QFormLayout()

        self._name_edit = QLineEdit()
        form_layout.addRow('规则名称:', self._name_edit)

        self._desc_edit = QLineEdit()
        form_layout.addRow('描述:', self._desc_edit)

        self._enabled_check = QCheckBox('启用规则')
        self._enabled_check.setChecked(True)
        form_layout.addRow('', self._enabled_check)

        self._cooldown_spin = QSpinBox()
        self._cooldown_spin.setRange(0, 3600)
        self._cooldown_spin.setValue(1)
        self._cooldown_spin.setSuffix(' 秒')
        form_layout.addRow('冷却时间:', self._cooldown_spin)

        layout.addLayout(form_layout)

        from PyQt5.QtWidgets import QTabWidget
        tabs = QTabWidget()

        conditions_tab = QWidget()
        conditions_layout = QVBoxLayout(conditions_tab)

        self._conditions_table = QTableWidget(0, 3)
        self._conditions_table.setHorizontalHeaderLabels(['类型', '参数', '表达式'])
        self._conditions_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        conditions_layout.addWidget(self._conditions_table)

        cond_btn_layout = QHBoxLayout()
        add_cond_btn = QPushButton('添加条件')
        add_cond_btn.clicked.connect(self._on_add_condition)
        cond_btn_layout.addWidget(add_cond_btn)

        edit_cond_btn = QPushButton('编辑条件')
        edit_cond_btn.clicked.connect(self._on_edit_condition)
        cond_btn_layout.addWidget(edit_cond_btn)

        del_cond_btn = QPushButton('删除条件')
        del_cond_btn.clicked.connect(self._on_delete_condition)
        cond_btn_layout.addWidget(del_cond_btn)
        cond_btn_layout.addStretch()
        conditions_layout.addLayout(cond_btn_layout)

        tabs.addTab(conditions_tab, '触发条件')

        actions_tab = QWidget()
        actions_layout = QVBoxLayout(actions_tab)

        self._actions_table = QTableWidget(0, 3)
        self._actions_table.setHorizontalHeaderLabels(['类型', '参数', '延迟'])
        self._actions_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        actions_layout.addWidget(self._actions_table)

        act_btn_layout = QHBoxLayout()
        add_act_btn = QPushButton('添加动作')
        add_act_btn.clicked.connect(self._on_add_action)
        act_btn_layout.addWidget(add_act_btn)

        edit_act_btn = QPushButton('编辑动作')
        edit_act_btn.clicked.connect(self._on_edit_action)
        act_btn_layout.addWidget(edit_act_btn)

        del_act_btn = QPushButton('删除动作')
        del_act_btn.clicked.connect(self._on_delete_action)
        act_btn_layout.addWidget(del_act_btn)
        act_btn_layout.addStretch()
        actions_layout.addLayout(act_btn_layout)

        tabs.addTab(actions_tab, '执行动作')

        layout.addWidget(tabs)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _on_add_condition(self) -> None:
        dialog = ConditionDialog(self)
        if dialog.exec_() == QDialog.Accepted:
            self._conditions.append(dialog.get_condition_data())
            self._refresh_conditions_table()

    def _on_edit_condition(self) -> None:
        row = self._conditions_table.currentRow()
        if row < 0 or row >= len(self._conditions):
            return

        dialog = ConditionDialog(self._conditions[row], self)
        if dialog.exec_() == QDialog.Accepted:
            self._conditions[row] = dialog.get_condition_data()
            self._refresh_conditions_table()

    def _on_delete_condition(self) -> None:
        row = self._conditions_table.currentRow()
        if row >= 0 and row < len(self._conditions):
            del self._conditions[row]
            self._refresh_conditions_table()

    def _refresh_conditions_table(self) -> None:
        self._conditions_table.setRowCount(len(self._conditions))
        for row, cond in enumerate(self._conditions):
            self._conditions_table.setItem(row, 0, QTableWidgetItem(cond.get('condition_type', '')))
            self._conditions_table.setItem(row, 1, QTableWidgetItem(str(cond.get('parameters', {}))))
            self._conditions_table.setItem(row, 2, QTableWidgetItem(cond.get('expression', '')))

    def _on_add_action(self) -> None:
        dialog = ActionDialog(self)
        if dialog.exec_() == QDialog.Accepted:
            self._actions.append(dialog.get_action_data())
            self._refresh_actions_table()

    def _on_edit_action(self) -> None:
        row = self._actions_table.currentRow()
        if row < 0 or row >= len(self._actions):
            return

        dialog = ActionDialog(self._actions[row], self)
        if dialog.exec_() == QDialog.Accepted:
            self._actions[row] = dialog.get_action_data()
            self._refresh_actions_table()

    def _on_delete_action(self) -> None:
        row = self._actions_table.currentRow()
        if row >= 0 and row < len(self._actions):
            del self._actions[row]
            self._refresh_actions_table()

    def _refresh_actions_table(self) -> None:
        self._actions_table.setRowCount(len(self._actions))
        for row, act in enumerate(self._actions):
            self._actions_table.setItem(row, 0, QTableWidgetItem(act.get('action_type', '')))
            self._actions_table.setItem(row, 1, QTableWidgetItem(str(act.get('parameters', {}))))
            self._actions_table.setItem(row, 2, QTableWidgetItem(f'{act.get("delay", 0)}s'))

    def _load_rule(self, rule: LinkageRule) -> None:
        self._name_edit.setText(rule.name)
        self._desc_edit.setText(rule.description)
        self._enabled_check.setChecked(rule.enabled)
        self._cooldown_spin.setValue(int(rule.cooldown))

        self._conditions = [c.to_dict() for c in rule.conditions]
        self._actions = [a.to_dict() for a in rule.actions]

        self._refresh_conditions_table()
        self._refresh_actions_table()

    def get_rule(self) -> LinkageRule:
        conditions = [LinkageCondition.from_dict(c) for c in self._conditions]
        actions = [LinkageAction.from_dict(a) for a in self._actions]

        rule_id = self._rule.rule_id if self._rule else str(uuid.uuid4())

        return LinkageRule(
            rule_id=rule_id,
            name=self._name_edit.text().strip() or '未命名规则',
            description=self._desc_edit.text().strip(),
            enabled=self._enabled_check.isChecked(),
            conditions=conditions,
            actions=actions,
            cooldown=float(self._cooldown_spin.value())
        )

    def accept(self) -> None:
        if not self._name_edit.text().strip():
            QMessageBox.warning(self, '警告', '请输入规则名称')
            return
        super().accept()


class ConditionDialog(QDialog):
    def __init__(self, condition_data: Optional[Dict[str, Any]] = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle('条件配置')
        self.resize(400, 350)
        self._condition_data = condition_data or {}
        self._init_ui()

    def _init_ui(self) -> None:
        layout = QFormLayout(self)

        self._type_combo = QComboBox()
        self._type_combo.addItems([
            'device_status', 'device_value', 'time_schedule', 'custom_expression'
        ])
        self._type_combo.currentTextChanged.connect(self._on_type_changed)
        layout.addRow('条件类型:', self._type_combo)

        self._params_edit = QTextEdit()
        self._params_edit.setPlaceholderText('参数 (JSON格式)')
        self._params_edit.setFixedHeight(100)
        layout.addRow('参数:', self._params_edit)

        self._expression_edit = QLineEdit()
        self._expression_edit.setPlaceholderText('自定义表达式 (可选)')
        layout.addRow('表达式:', self._expression_edit)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addRow(buttons)

        if self._condition_data:
            self._type_combo.setCurrentText(self._condition_data.get('condition_type', 'device_status'))
            import json
            self._params_edit.setPlainText(json.dumps(self._condition_data.get('parameters', {}), ensure_ascii=False))
            self._expression_edit.setText(self._condition_data.get('expression', ''))

    def _on_type_changed(self, type_name: str) -> None:
        examples = {
            'device_status': '{"device_id": "plc1", "status": "connected"}',
            'device_value': '{"device_id": "sensor1", "field": "temperature", "operator": ">", "value": 30}',
            'time_schedule': '{"start_time": "08:00", "end_time": "18:00", "days": [0, 1, 2, 3, 4]}',
            'custom_expression': '{}'
        }
        self._params_edit.setPlaceholderText(f'例如: {examples.get(type_name, "")}')

    def get_condition_data(self) -> Dict[str, Any]:
        import json
        try:
            params = json.loads(self._params_edit.toPlainText())
        except (json.JSONDecodeError, ValueError):
            params = {}

        return {
            'condition_type': self._type_combo.currentText(),
            'parameters': params if isinstance(params, dict) else {},
            'expression': self._expression_edit.text().strip()
        }

    def accept(self) -> None:
        super().accept()


class ActionDialog(QDialog):
    def __init__(self, action_data: Optional[Dict[str, Any]] = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle('动作配置')
        self.resize(400, 300)
        self._action_data = action_data or {}
        self._init_ui()

    def _init_ui(self) -> None:
        layout = QFormLayout(self)

        self._type_combo = QComboBox()
        self._type_combo.addItems([
            'send_command', 'execute_command', 'delay', 'notify', 'webhook'
        ])
        self._type_combo.currentTextChanged.connect(self._on_type_changed)
        layout.addRow('动作类型:', self._type_combo)

        self._params_edit = QTextEdit()
        self._params_edit.setPlaceholderText('参数 (JSON格式)')
        self._params_edit.setFixedHeight(100)
        layout.addRow('参数:', self._params_edit)

        self._delay_spin = QSpinBox()
        self._delay_spin.setRange(0, 3600)
        self._delay_spin.setValue(0)
        self._delay_spin.setSuffix(' 秒')
        layout.addRow('执行延迟:', self._delay_spin)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addRow(buttons)

        if self._action_data:
            self._type_combo.setCurrentText(self._action_data.get('action_type', 'send_command'))
            import json
            self._params_edit.setPlainText(json.dumps(self._action_data.get('parameters', {}), ensure_ascii=False))
            self._delay_spin.setValue(int(self._action_data.get('delay', 0)))

    def _on_type_changed(self, type_name: str) -> None:
        examples = {
            'send_command': '{"device_id": "plc1", "command": "write_single_register", "params": {"address": 0, "value": 1}}',
            'execute_command': '{"command_id": "cmd_001"}',
            'delay': '{"seconds": 2}',
            'notify': '{"title": "提醒", "message": "温度过高!"}',
            'webhook': '{"url": "http://example.com/api", "method": "POST", "data": {"key": "value"}}'
        }
        self._params_edit.setPlaceholderText(f'例如: {examples.get(type_name, "")}')

    def get_action_data(self) -> Dict[str, Any]:
        import json
        try:
            params = json.loads(self._params_edit.toPlainText())
        except (json.JSONDecodeError, ValueError):
            params = {}

        return {
            'action_type': self._type_combo.currentText(),
            'parameters': params if isinstance(params, dict) else {},
            'delay': float(self._delay_spin.value())
        }

    def accept(self) -> None:
        super().accept()
