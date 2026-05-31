from typing import Dict, Any
from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidget, QTableWidgetItem, QHeaderView, QComboBox,
    QSpinBox, QMessageBox
)
from PyQt5.QtCore import Qt, QTimer, QSize
from PyQt5.QtGui import QColor

from device_scheduler import TaskStatus

import logging
logger = logging.getLogger(__name__)


class SchedulerPanel(QWidget):
    def __init__(self, scheduler=None, parent=None):
        super().__init__(parent)
        self._scheduler = scheduler
        self._init_ui()

        self._update_timer = QTimer(self)
        self._update_timer.timeout.connect(self._refresh_tasks)
        self._update_timer.start(1000)

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(5)

        header_layout = QHBoxLayout()
        title_label = QLabel('任务队列')
        title_label.setStyleSheet('font-weight: bold; font-size: 16px;')
        header_layout.addWidget(title_label)
        header_layout.addStretch()

        clear_btn = QPushButton('清除已完成')
        clear_btn.clicked.connect(self._on_clear_completed)
        header_layout.addWidget(clear_btn)

        layout.addLayout(header_layout)

        stats_layout = QHBoxLayout()
        self._stats_label = QLabel('等待: 0 | 运行中: 0 | 已完成: 0 | 失败: 0')
        stats_layout.addWidget(self._stats_label)
        stats_layout.addStretch()
        layout.addLayout(stats_layout)

        self._task_table = QTableWidget(0, 6)
        self._task_table.setHorizontalHeaderLabels([
            '任务ID', '名称', '设备', '指令', '状态', '耗时(秒)'
        ])
        self._task_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self._task_table.verticalHeader().setVisible(False)
        self._task_table.setSelectionBehavior(QTableWidget.SelectRows)
        layout.addWidget(self._task_table, 1)

        button_layout = QHBoxLayout()
        cancel_btn = QPushButton('取消选中任务')
        cancel_btn.clicked.connect(self._on_cancel_task)
        button_layout.addWidget(cancel_btn)
        button_layout.addStretch()
        layout.addLayout(button_layout)

    def _refresh_tasks(self) -> None:
        if not self._scheduler:
            return

        stats = self._scheduler.get_statistics()
        self._stats_label.setText(
            f'等待: {stats["queued"]} | 运行中: {stats["running"]} | '
            f'已完成: {stats["completed"]} | 失败: {stats["failed"]}'
        )

        tasks = self._scheduler.queue.get_all_tasks()
        tasks.sort(key=lambda t: t.created_at, reverse=True)

        self._task_table.setRowCount(min(len(tasks), 100))

        status_colors = {
            'queued': QColor('#FFF9C4'),
            'running': QColor('#BBDEFB'),
            'completed': QColor('#C8E6C9'),
            'failed': QColor('#FFCDD2'),
            'cancelled': QColor('#E0E0E0'),
            'timeout': QColor('#FFECB3')
        }

        for row, task in enumerate(tasks[:100]):
            self._task_table.setItem(row, 0, QTableWidgetItem(task.task_id[:8]))
            self._task_table.setItem(row, 1, QTableWidgetItem(task.name))
            self._task_table.setItem(row, 2, QTableWidgetItem(task.device_id))
            self._task_table.setItem(row, 3, QTableWidgetItem(task.command))
            self._task_table.setItem(row, 4, QTableWidgetItem(task.status.value))

            duration = ''
            if task.status == TaskStatus.COMPLETED and task.completed_at > 0:
                duration = f'{task.completed_at - task.started_at:.2f}'
            elif task.status == TaskStatus.RUNNING and task.started_at > 0:
                import time
                duration = f'{time.time() - task.started_at:.2f}'
            self._task_table.setItem(row, 5, QTableWidgetItem(duration))

            color = status_colors.get(task.status.value, QColor('#FFFFFF'))
            for col in range(6):
                item = self._task_table.item(row, col)
                if item:
                    item.setBackground(color)

    def _on_cancel_task(self) -> None:
        current_row = self._task_table.currentRow()
        if current_row < 0:
            return

        task_id_item = self._task_table.item(current_row, 0)
        if not task_id_item:
            return

        task_id_prefix = task_id_item.text()
        if not self._scheduler:
            return

        for task in self._scheduler.queue.get_all_tasks():
            if task.task_id.startswith(task_id_prefix):
                if self._scheduler.cancel_task(task.task_id):
                    QMessageBox.information(self, '成功', f'任务已取消: {task.name}')
                    self._refresh_tasks()
                else:
                    QMessageBox.warning(self, '警告', '无法取消正在运行或已完成的任务')
                break

    def _on_clear_completed(self) -> None:
        if not self._scheduler:
            return
        count = self._scheduler.queue.remove_completed_tasks(older_than=0)
        if count > 0:
            QMessageBox.information(self, '成功', f'已清除 {count} 个已完成任务')
            self._refresh_tasks()
