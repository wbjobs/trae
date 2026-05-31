from typing import List
from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPropertyAnimation,
    QGraphicsOpacityEffect, QScrollArea, QFrame
)
from PyQt5.QtCore import Qt, QTimer, QPropertyAnimation, QPoint, QEasingCurve
from PyQt5.QtGui import QColor, QPainter, QBrush, QPen, QFont

import logging
logger = logging.getLogger(__name__)


class NotificationWidget(QFrame):
    def __init__(self, title: str, message: str, is_error: bool = False, parent=None):
        super().__init__(parent)
        self._title = title
        self._message = message
        self._is_error = is_error
        self._init_ui()
        self._setup_animation()

    def _init_ui(self) -> None:
        self.setFixedSize(320, 80)
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.Tool | Qt.WindowStaysOnTopHint)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setAttribute(Qt.WA_ShowWithoutActivating)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 8, 12, 8)
        layout.setSpacing(4)

        title_label = QLabel(self._title)
        title_font = QFont()
        title_font.setBold(True)
        title_font.setPointSize(10)
        title_label.setFont(title_font)
        title_label.setStyleSheet('color: white;')
        layout.addWidget(title_label)

        message_label = QLabel(self._message)
        message_label.setStyleSheet('color: rgba(255, 255, 255, 0.9);')
        message_label.setWordWrap(True)
        layout.addWidget(message_label)

        self._opacity_effect = QGraphicsOpacityEffect()
        self.setGraphicsEffect(self._opacity_effect)
        self._opacity_effect.setOpacity(0.0)

    def _setup_animation(self) -> None:
        self._fade_in_anim = QPropertyAnimation(self._opacity_effect, b'opacity')
        self._fade_in_anim.setDuration(200)
        self._fade_in_anim.setStartValue(0.0)
        self._fade_in_anim.setEndValue(1.0)
        self._fade_in_anim.setEasingCurve(QEasingCurve.InOutQuad)

        self._fade_out_anim = QPropertyAnimation(self._opacity_effect, b'opacity')
        self._fade_out_anim.setDuration(300)
        self._fade_out_anim.setStartValue(1.0)
        self._fade_out_anim.setEndValue(0.0)
        self._fade_out_anim.setEasingCurve(QEasingCurve.InOutQuad)

    def paintEvent(self, event) -> None:
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        if self._is_error:
            bg_color = QColor(244, 67, 54, 240)
        else:
            bg_color = QColor(33, 150, 243, 240)

        painter.setBrush(QBrush(bg_color))
        painter.setPen(Qt.NoPen)
        painter.drawRoundedRect(self.rect(), 8, 8)

        painter.setPen(QPen(QColor(255, 255, 255, 40)))
        painter.drawLine(8, 28, self.width() - 8, 28)

    def show_notification(self, timeout: int = 3000) -> None:
        self.show()
        self._fade_in_anim.start()

        QTimer.singleShot(timeout, self._start_fade_out)

    def _start_fade_out(self) -> None:
        self._fade_out_anim.finished.connect(self.close)
        self._fade_out_anim.start()


class NotificationManager:
    def __init__(self, parent=None):
        self._parent = parent
        self._notifications: List[NotificationWidget] = []
        self._max_notifications = 5
        self._spacing = 10

    def show_notification(self, title: str, message: str, is_error: bool = False, timeout: int = 3000) -> None:
        if len(self._notifications) >= self._max_notifications:
            oldest = self._notifications.pop(0)
            oldest.close()

        notification = NotificationWidget(title, message, is_error)
        self._notifications.append(notification)

        notification.destroyed.connect(lambda: self._on_notification_closed(notification))

        self._position_notifications()
        notification.show_notification(timeout)

    def _on_notification_closed(self, notification: NotificationWidget) -> None:
        if notification in self._notifications:
            self._notifications.remove(notification)
            self._position_notifications()

    def _position_notifications(self) -> None:
        if not self._parent:
            return

        parent_rect = self._parent.frameGeometry()
        y = parent_rect.bottom() - 10

        for notification in reversed(self._notifications):
            if not notification.isVisible():
                continue

            x = parent_rect.right() - notification.width() - 10
            y -= notification.height() + self._spacing
            notification.move(x, y)

    def clear_all(self) -> None:
        for notification in self._notifications:
            notification.close()
        self._notifications.clear()
