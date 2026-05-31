#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
工业组态参数调校桌面客户端
跨平台工业组态参数调校系统，支持Windows/Linux双平台
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PySide6.QtWidgets import QApplication
from PySide6.QtCore import Qt
from PySide6.QtGui import QFont

from src.ui.main_window import MainWindow


def main():
    QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    QApplication.setAttribute(Qt.AA_UseHighDpiPixmaps, True)

    app = QApplication(sys.argv)
    app.setApplicationName("Industrial Config Studio")
    app.setOrganizationName("Industrial Config Team")
    app.setApplicationVersion("1.0.0")

    font = QFont("Microsoft YaHei", 9)
    app.setFont(font)

    window = MainWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
