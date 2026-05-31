import sys
import os
import uuid
from typing import List, Optional, Tuple
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QListWidget, QListWidgetItem, QMessageBox,
    QTextEdit, QSplitter, QFrame, QGroupBox, QDialog, QLineEdit,
    QDialogButtonBox
)
from PySide6.QtCore import Qt, QPoint, QSize, QTimer
from PySide6.QtGui import (
    QPainter, QColor, QPen, QBrush, QFont, QDrag, QPixmap,
    QAction
)
from PySide6.QtWidgets import QGraphicsView, QGraphicsScene, QGraphicsItem
from PySide6.QtWidgets import QGraphicsRectItem, QGraphicsSimpleTextItem
from PySide6.QtWidgets import QGraphicsItemGroup, QGraphicsEllipseItem
from PySide6.QtWidgets import QGraphicsLineItem, QGridLayout

from ..parser import parse_source
from ..code_generator import generate_code
from ..simulator import PLCSimulator
from .model import ElementType, LadderElement, LadderRung, LadderProgram


class ElementPaletteItem(QFrame):
    def __init__(self, element_type: ElementType, display_name: str, parent=None):
        super().__init__(parent)
        self.element_type = element_type
        self.display_name = display_name
        self.setFrameStyle(QFrame.StyledPanel | QFrame.Raised)
        self.setFixedHeight(60)
        self.setCursor(Qt.OpenHandCursor)
        self.setStyleSheet("""
            QFrame {
                background-color: #f0f0f0;
                border: 2px solid #999;
                border-radius: 6px;
            }
            QFrame:hover {
                background-color: #e0e8f0;
                border-color: #5a9;
            }
        """)
        
        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 5, 8, 5)
        
        preview = QLabel()
        preview.setFixedSize(40, 40)
        preview.setStyleSheet(self._get_preview_style())
        layout.addWidget(preview)
        
        label = QLabel(display_name)
        label.setFont(QFont("Arial", 10, QFont.Bold))
        layout.addWidget(label, 1)
    
    def _get_preview_style(self) -> str:
        if self.element_type == ElementType.CONTACT:
            return "background-color: #fff; border: 2px solid #333; border-radius: 3px;"
        elif self.element_type == ElementType.CONTACT_NOT:
            return "background-color: #fff; border: 2px solid #333; border-radius: 3px;"
        elif self.element_type == ElementType.OUTPUT:
            return "background-color: #fff; border: 2px solid #c33; border-radius: 20px;"
        return "background-color: #ccc; border: 2px solid #666;"
    
    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            drag = QDrag(self)
            mime_data = drag.mimeData()
            mime_data.setText(f"{self.element_type.value}")
            pixmap = QPixmap(self.size())
            self.render(pixmap)
            drag.setPixmap(pixmap)
            drag.setHotSpot(event.position().toPoint())
            drag.exec(Qt.CopyAction)


class NameDialog(QDialog):
    def __init__(self, title: str, default_name: str = "", parent=None):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.setFixedSize(300, 120)
        
        layout = QVBoxLayout(self)
        
        self.name_edit = QLineEdit(default_name)
        self.name_edit.setPlaceholderText("输入名称 (如 X0, Y0, M0)")
        layout.addWidget(QLabel("元件名称:"))
        layout.addWidget(self.name_edit)
        
        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)
    
    def get_name(self) -> str:
        return self.name_edit.text().strip()


class ContactGraphicsItem(QGraphicsItemGroup):
    def __init__(self, element: LadderElement, x: int, y: int, parent=None):
        super().__init__(parent)
        self.element = element
        self._build(x, y)
    
    def _build(self, x: int, y: int):
        rect = QGraphicsRectItem(x, y, 50, 30)
        rect.setBrush(QBrush(QColor("#ffffff")))
        rect.setPen(QPen(QColor("#333333"), 2))
        self.addToGroup(rect)
        
        left_wire = QGraphicsLineItem(x - 15, y + 15, x, y + 15)
        left_wire.setPen(QPen(QColor("#444444"), 3))
        self.addToGroup(left_wire)
        
        right_wire = QGraphicsLineItem(x + 50, y + 15, x + 65, y + 15)
        right_wire.setPen(QPen(QColor("#444444"), 3))
        self.addToGroup(right_wire)
        
        label = QGraphicsSimpleTextItem(self.element.name)
        label.setBrush(QColor("#333333"))
        label_font = QFont("Consolas", 11, QFont.Bold)
        label.setFont(label_font)
        label_width = label.boundingRect().width()
        label.setPos(x + 25 - label_width / 2, y + 7)
        self.addToGroup(label)
        
        if self.element.type == ElementType.CONTACT_NOT:
            not_mark = QGraphicsEllipseItem(x + 20, y + 33, 10, 10)
            not_mark.setBrush(QBrush(QColor("#ffffff")))
            not_mark.setPen(QPen(QColor("#333333"), 2))
            self.addToGroup(not_mark)


class OutputGraphicsItem(QGraphicsItemGroup):
    def __init__(self, element: LadderElement, x: int, y: int, parent=None):
        super().__init__(parent)
        self.element = element
        self._build(x, y)
    
    def _build(self, x: int, y: int):
        ellipse = QGraphicsEllipseItem(x, y, 40, 40)
        ellipse.setBrush(QBrush(QColor("#ffe5e5")))
        ellipse.setPen(QPen(QColor("#cc3333"), 2))
        self.addToGroup(ellipse)
        
        left_wire = QGraphicsLineItem(x - 15, y + 20, x, y + 20)
        left_wire.setPen(QPen(QColor("#444444"), 3))
        self.addToGroup(left_wire)
        
        label = QGraphicsSimpleTextItem(self.element.name)
        label.setBrush(QColor("#cc3333"))
        label_font = QFont("Consolas", 11, QFont.Bold)
        label.setFont(label_font)
        label_width = label.boundingRect().width()
        label.setPos(x + 20 - label_width / 2, y + 12)
        self.addToGroup(label)


class RungGraphicsItem(QGraphicsItemGroup):
    ELEMENT_SPACING = 20
    
    def __init__(self, rung: LadderRung, rung_index: int, parent=None):
        super().__init__(parent)
        self.rung = rung
        self.rung_index = rung_index
        self.setFlag(QGraphicsItem.ItemIsSelectable, False)
        self._build()
    
    def _build(self):
        y_offset = self.rung_index * 90
        scene_width = 900
        
        label = QGraphicsSimpleTextItem(f"Rung {self.rung_index + 1}")
        label.setBrush(QColor("#888888"))
        label.setFont(QFont("Arial", 9))
        label.setPos(10, y_offset + 5)
        self.addToGroup(label)
        
        left_rail = QGraphicsRectItem(30, y_offset + 25, 8, 45)
        left_rail.setBrush(QBrush(QColor("#555555")))
        left_rail.setPen(QPen(Qt.NoPen))
        self.addToGroup(left_rail)
        
        right_rail = QGraphicsRectItem(scene_width - 50, y_offset + 25, 8, 45)
        right_rail.setBrush(QBrush(QColor("#555555")))
        right_rail.setPen(QPen(Qt.NoPen))
        self.addToGroup(right_rail)
        
        contacts = [e for e in self.rung.elements if e.type in (ElementType.CONTACT, ElementType.CONTACT_NOT)]
        
        current_x = 60
        
        for i, contact in enumerate(contacts):
            contact_item = ContactGraphicsItem(contact, current_x, y_offset + 32)
            self.addToGroup(contact_item)
            current_x += 50 + self.ELEMENT_SPACING + 30
        
        if self.rung.output:
            output_x = scene_width - 110
            if contacts:
                last_contact_x = 60 + len(contacts) * (50 + self.ELEMENT_SPACING + 30) - self.ELEMENT_SPACING - 30
                if last_contact_x + 50 < output_x:
                    connect_line = QGraphicsLineItem(
                        last_contact_x + 50, y_offset + 47,
                        output_x, y_offset + 47
                    )
                    connect_line.setPen(QPen(QColor("#444444"), 3))
                    self.addToGroup(connect_line)
            
            output_item = OutputGraphicsItem(self.rung.output, output_x, y_offset + 27)
            self.addToGroup(output_item)
            
            output_right_line = QGraphicsLineItem(
                output_x + 40, y_offset + 47,
                scene_width - 50, y_offset + 47
            )
            output_right_line.setPen(QPen(QColor("#444444"), 3))
            self.addToGroup(output_right_line)
        else:
            if contacts:
                last_contact_x = 60 + len(contacts) * (50 + self.ELEMENT_SPACING + 30) - self.ELEMENT_SPACING - 30
                right_connect = QGraphicsLineItem(
                    last_contact_x + 50, y_offset + 47,
                    scene_width - 50, y_offset + 47
                )
                right_connect.setPen(QPen(QColor("#444444"), 3))
                self.addToGroup(right_connect)


class LadderEditorScene(QGraphicsScene):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.program = LadderProgram()
        self._element_counter = 0
        self.setSceneRect(0, 0, 900, 500)
        self.setBackgroundBrush(QBrush(QColor("#fafafa")))
    
    def _next_element_id(self) -> str:
        self._element_counter += 1
        return f"elem_{self._element_counter}"
    
    def refresh(self):
        self.clear()
        rung_count = len(self.program.rungs)
        scene_height = max(90 * (rung_count + 1), 300)
        self.setSceneRect(0, 0, 900, scene_height)
        
        for i, rung in enumerate(self.program.rungs):
            item = RungGraphicsItem(rung, i)
            self.addItem(item)
    
    def add_new_rung(self) -> LadderRung:
        rung = self.program.add_rung()
        self.refresh()
        return rung
    
    def add_contact_to_rung(self, rung_index: int, element_type: ElementType, name: str) -> bool:
        if rung_index >= len(self.program.rungs):
            return False
        
        if element_type not in (ElementType.CONTACT, ElementType.CONTACT_NOT):
            return False
        
        rung = self.program.rungs[rung_index]
        
        element = LadderElement(
            id=self._next_element_id(),
            type=element_type,
            name=name
        )
        rung.elements.append(element)
        
        self.refresh()
        return True
    
    def set_output_to_rung(self, rung_index: int, name: str) -> bool:
        if rung_index >= len(self.program.rungs):
            return False
        
        rung = self.program.rungs[rung_index]
        
        element = LadderElement(
            id=self._next_element_id(),
            type=ElementType.OUTPUT,
            name=name
        )
        rung.output = element
        
        self.refresh()
        return True
    
    def get_ladder_text(self) -> str:
        return self.program.to_ladder_text()


class LadderEditorView(QGraphicsView):
    def __init__(self, scene: LadderEditorScene, parent=None):
        super().__init__(scene, parent)
        self.setAcceptDrops(True)
        self.setRenderHint(QPainter.Antialiasing)
        self.setRenderHint(QPainter.SmoothPixmapTransform)
        self.setDragMode(QGraphicsView.NoDrag)
        self._scene = scene
    
    def dragEnterEvent(self, event):
        if event.mimeData().hasText():
            event.acceptProposedAction()
    
    def dragMoveEvent(self, event):
        if event.mimeData().hasText():
            event.acceptProposedAction()
    
    def dropEvent(self, event):
        if not event.mimeData().hasText():
            return
        
        element_type_value = event.mimeData().text()
        try:
            element_type = ElementType(element_type_value)
        except ValueError:
            return
        
        pos = self.mapToScene(event.position().toPoint())
        rung_index = int(pos.y() // 90)
        
        while rung_index >= len(self._scene.program.rungs):
            self._scene.add_new_rung()
        
        if element_type == ElementType.OUTPUT:
            title = "输出线圈名称"
            default = f"Y{rung_index}"
        else:
            title = "触点名称"
            default = f"X{len(self._scene.program.rungs[rung_index].elements)}"
        
        dialog = NameDialog(title, default, self)
        if dialog.exec() == QDialog.Accepted:
            name = dialog.get_name().strip()
            if name:
                if element_type == ElementType.OUTPUT:
                    self._scene.set_output_to_rung(rung_index, name)
                else:
                    self._scene.add_contact_to_rung(rung_index, element_type, name)
                event.acceptProposedAction()


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("PLC 梯形图编辑器 - 修复版")
        self.setMinimumSize(1300, 750)
        
        self.simulator: Optional[PLCSimulator] = None
        self.sim_timer = QTimer()
        self.sim_timer.timeout.connect(self._on_sim_timer)
        
        self._element_counter = 0
        
        self._create_menu()
        self._create_central_widget()
    
    def _next_element_id(self) -> str:
        self._element_counter += 1
        return f"elem_{self._element_counter}"
    
    def _create_menu(self):
        menu_bar = self.menuBar()
        
        file_menu = menu_bar.addMenu("文件")
        
        generate_action = QAction("生成 Python 代码", self)
        generate_action.setShortcut("Ctrl+G")
        generate_action.triggered.connect(self._on_generate_code)
        file_menu.addAction(generate_action)
        
        file_menu.addSeparator()
        
        exit_action = QAction("退出", self)
        exit_action.setShortcut("Ctrl+Q")
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)
        
        edit_menu = menu_bar.addMenu("编辑")
        
        add_rung_action = QAction("添加梯形梯级", self)
        add_rung_action.triggered.connect(self._on_add_rung)
        edit_menu.addAction(add_rung_action)
        
        clear_rung_action = QAction("清空当前梯级", self)
        clear_rung_action.triggered.connect(self._on_clear_rung)
        edit_menu.addAction(clear_rung_action)
        
        clear_all_action = QAction("清空所有", self)
        clear_all_action.triggered.connect(self._on_clear_all)
        edit_menu.addAction(clear_all_action)
        
        sim_menu = menu_bar.addMenu("模拟")
        
        run_sim_action = QAction("运行模拟", self)
        run_sim_action.triggered.connect(self._on_run_simulation)
        sim_menu.addAction(run_sim_action)
        
        stop_sim_action = QAction("停止模拟", self)
        stop_sim_action.triggered.connect(self._on_stop_simulation)
        sim_menu.addAction(stop_sim_action)
    
    def _create_central_widget(self):
        central = QWidget()
        self.setCentralWidget(central)
        
        main_layout = QHBoxLayout(central)
        main_layout.setContentsMargins(8, 8, 8, 8)
        main_layout.setSpacing(10)
        
        palette = self._create_palette()
        main_layout.addWidget(palette)
        
        splitter = QSplitter(Qt.Horizontal)
        
        editor_container = QWidget()
        editor_layout = QVBoxLayout(editor_container)
        editor_layout.setContentsMargins(0, 0, 0, 0)
        
        toolbar = QHBoxLayout()
        toolbar.setSpacing(10)
        
        title_label = QLabel("🔧 梯形图编辑器")
        title_label.setFont(QFont("Arial", 12, QFont.Bold))
        toolbar.addWidget(title_label)
        
        toolbar.addStretch()
        
        add_rung_btn = QPushButton("➕ 添加梯级")
        add_rung_btn.setMinimumWidth(100)
        add_rung_btn.clicked.connect(self._on_add_rung)
        toolbar.addWidget(add_rung_btn)
        
        clear_rung_btn = QPushButton("🗑️ 清空当前")
        clear_rung_btn.setMinimumWidth(100)
        clear_rung_btn.clicked.connect(self._on_clear_rung)
        toolbar.addWidget(clear_rung_btn)
        
        toolbar_widget = QWidget()
        toolbar_widget.setLayout(toolbar)
        toolbar_widget.setStyleSheet("background-color: #f0f0f0; padding: 5px; border-radius: 5px;")
        editor_layout.addWidget(toolbar_widget)
        
        self.scene = LadderEditorScene()
        self.view = LadderEditorView(self.scene)
        self.view.setStyleSheet("""
            QGraphicsView {
                background-color: #ffffff;
                border: 2px solid #ddd;
                border-radius: 5px;
            }
        """)
        editor_layout.addWidget(self.view, 1)
        
        info_label = QLabel("💡 提示: 从左侧拖拽元件到梯形图区域。每个梯级 (Rung) 可以包含多个串联触点和一个输出线圈。")
        info_label.setWordWrap(True)
        info_label.setStyleSheet("background-color: #fff9e6; padding: 8px; border: 1px solid #ffd633; border-radius: 4px; color: #665c00;")
        editor_layout.addWidget(info_label)
        
        splitter.addWidget(editor_container)
        
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(10)
        
        code_group = QGroupBox("📝 梯形图代码 (LD 指令)")
        code_layout = QVBoxLayout(code_group)
        
        self.code_text = QTextEdit()
        self.code_text.setReadOnly(False)
        self.code_text.setFont(QFont("Consolas", 11))
        self.code_text.setPlaceholderText("示例:\nLD X0\nAND X1\nAND X2\nOUT Y0")
        code_layout.addWidget(self.code_text, 1)
        
        btn_layout = QHBoxLayout()
        
        parse_btn = QPushButton("🔄 解析代码→图形")
        parse_btn.clicked.connect(self._on_parse_text)
        btn_layout.addWidget(parse_btn)
        
        sync_btn = QPushButton("📋 图形→代码")
        sync_btn.clicked.connect(self._on_sync_to_text)
        btn_layout.addWidget(sync_btn)
        
        code_layout.addLayout(btn_layout)
        
        right_layout.addWidget(code_group, 2)
        
        sim_group = QGroupBox("⚡ PLC 实时模拟")
        sim_layout = QGridLayout(sim_group)
        
        sim_layout.addWidget(QLabel("输入状态 (勾选激活):"), 0, 0, 1, 2)
        self.input_list = QListWidget()
        self.input_list.itemChanged.connect(self._on_input_changed)
        sim_layout.addWidget(self.input_list, 1, 0, 1, 2)
        
        sim_layout.addWidget(QLabel("输出状态 (只读):"), 2, 0, 1, 2)
        self.output_list = QListWidget()
        self.output_list.setEnabled(False)
        sim_layout.addWidget(self.output_list, 3, 0, 1, 2)
        
        btn_row = QHBoxLayout()
        run_btn = QPushButton("▶ 运行")
        run_btn.setMinimumHeight(35)
        run_btn.setStyleSheet("background-color: #4CAF50; color: white; font-weight: bold;")
        run_btn.clicked.connect(self._on_run_simulation)
        btn_row.addWidget(run_btn)
        
        stop_btn = QPushButton("■ 停止")
        stop_btn.setMinimumHeight(35)
        stop_btn.setStyleSheet("background-color: #f44336; color: white; font-weight: bold;")
        stop_btn.clicked.connect(self._on_stop_simulation)
        btn_row.addWidget(stop_btn)
        
        sim_layout.addLayout(btn_row, 4, 0, 1, 2)
        
        right_layout.addWidget(sim_group, 1)
        
        splitter.addWidget(right_panel)
        splitter.setSizes([750, 450])
        
        main_layout.addWidget(splitter, 1)
        
        self.scene.add_new_rung()
        self.statusBar().showMessage("就绪 - 拖拽元件到梯形图区域")
    
    def _create_palette(self) -> QWidget:
        palette = QWidget()
        palette.setFixedWidth(220)
        palette.setStyleSheet("""
            QWidget {
                background-color: #f8f8f8;
                border-right: 2px solid #ddd;
            }
        """)
        
        layout = QVBoxLayout(palette)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(8)
        
        title = QLabel("🎨 元件面板")
        title.setFont(QFont("Arial", 13, QFont.Bold))
        title.setAlignment(Qt.AlignCenter)
        layout.addWidget(title)
        
        hint = QLabel("拖拽下方元件到右侧梯形图区域")
        hint.setWordWrap(True)
        hint.setStyleSheet("color: #666; font-size: 11px;")
        hint.setAlignment(Qt.AlignCenter)
        layout.addWidget(hint)
        
        separator = QFrame()
        separator.setFrameShape(QFrame.HLine)
        separator.setFrameShadow(QFrame.Sunken)
        separator.setStyleSheet("color: #ccc;")
        layout.addWidget(separator)
        
        contact_group = QGroupBox("🔌 输入触点 (串联连接)")
        contact_group.setStyleSheet("QGroupBox { font-weight: bold; padding: 5px; }")
        contact_layout = QVBoxLayout(contact_group)
        contact_layout.setSpacing(8)
        
        contact_normal = ElementPaletteItem(ElementType.CONTACT, "常开触点 (LD/AND)")
        contact_layout.addWidget(contact_normal)
        
        contact_not = ElementPaletteItem(ElementType.CONTACT_NOT, "常闭触点 (LDI/ANI)")
        contact_layout.addWidget(contact_not)
        
        layout.addWidget(contact_group)
        
        output_group = QGroupBox("💡 输出线圈")
        output_group.setStyleSheet("QGroupBox { font-weight: bold; padding: 5px; }")
        output_layout = QVBoxLayout(output_group)
        output_layout.setSpacing(8)
        
        output_coil = ElementPaletteItem(ElementType.OUTPUT, "输出线圈 (OUT)")
        output_layout.addWidget(output_coil)
        
        layout.addWidget(output_group)
        
        layout.addStretch()
        
        rules_label = QLabel(
            "📖 使用规则:\n\n"
            "• 每个梯级(Rung)可添加\n  多个串联触点\n"
            "• 拖拽触点到梯级会自动\n  串联(AND逻辑)\n"
            "• 每个梯级只能有一个\n  输出线圈\n"
            "• 触点支持常开/常闭两种"
        )
        rules_label.setWordWrap(True)
        rules_label.setStyleSheet("""
            QLabel {
                background-color: #e8f4fc;
                color: #1a5276;
                padding: 10px;
                border: 1px solid #85c1e9;
                border-radius: 6px;
                font-size: 10px;
            }
        """)
        layout.addWidget(rules_label)
        
        return palette
    
    def _on_add_rung(self):
        self.scene.add_new_rung()
        self.statusBar().showMessage(f"已添加新梯级，当前共 {len(self.scene.program.rungs)} 个梯级")
    
    def _on_clear_rung(self):
        if len(self.scene.program.rungs) > 0:
            last_rung = self.scene.program.rungs[-1]
            last_rung.elements.clear()
            last_rung.output = None
            self.scene.refresh()
            self.statusBar().showMessage("已清空最后一个梯级")
    
    def _on_clear_all(self):
        reply = QMessageBox.question(
            self, "确认清空",
            "确定要清空所有梯级吗？此操作不可撤销。",
            QMessageBox.Yes | QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self.scene.program = LadderProgram()
            self.scene.add_new_rung()
            self.scene.refresh()
            self.statusBar().showMessage("已清空所有梯级")
    
    def _on_parse_text(self):
        text = self.code_text.toPlainText().strip()
        if not text:
            QMessageBox.warning(self, "警告", "请输入梯形图代码")
            return
        
        try:
            ast = parse_source(text)
            
            self.scene.program = LadderProgram()
            self._element_counter = 0
            
            element_count = 0
            for rung in ast.rungs:
                new_rung = self.scene.add_new_rung()
                contact_count = self._add_ast_to_rung(new_rung, rung.condition)
                
                from ..ast_nodes import OutputNode
                if isinstance(rung.output, OutputNode):
                    self.scene.set_output_to_rung(
                        len(self.scene.program.rungs) - 1,
                        rung.output.name
                    )
                    element_count += 1
                
                element_count += contact_count
            
            self.scene.refresh()
            self.statusBar().showMessage(f"解析成功: {len(ast.rungs)} 个梯级, {element_count} 个元件")
            QMessageBox.information(self, "成功", f"代码解析成功!\n\n梯级数: {len(ast.rungs)}\n元件数: {element_count}")
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            QMessageBox.critical(self, "解析错误", f"解析失败: {str(e)}")
    
    def _add_ast_to_rung(self, rung: LadderRung, node) -> int:
        from ..ast_nodes import ContactNode, AndNode, OrNode
        
        count = 0
        
        if isinstance(node, ContactNode):
            elem_type = ElementType.CONTACT_NOT if node.negated else ElementType.CONTACT
            elem = LadderElement(
                id=self._next_element_id(),
                type=elem_type,
                name=node.name
            )
            rung.elements.append(elem)
            count = 1
        elif isinstance(node, AndNode):
            count += self._add_ast_to_rung(rung, node.left)
            count += self._add_ast_to_rung(rung, node.right)
        elif isinstance(node, OrNode):
            count += self._add_ast_to_rung(rung, node.left)
            count += self._add_ast_to_rung(rung, node.right)
        
        return count
    
    def _on_sync_to_text(self):
        ladder_text = self.scene.get_ladder_text()
        self.code_text.setPlainText(ladder_text)
        
        contact_count = 0
        for rung in self.scene.program.rungs:
            contact_count += len([e for e in rung.elements if e.type in (ElementType.CONTACT, ElementType.CONTACT_NOT)])
        
        self.statusBar().showMessage(f"已同步到文本: {len(self.scene.program.rungs)} 个梯级, {contact_count} 个触点")
    
    def _on_generate_code(self):
        ladder_text = self.scene.get_ladder_text()
        
        if not ladder_text.strip():
            text = self.code_text.toPlainText().strip()
            if not text:
                QMessageBox.warning(self, "警告", "请先创建或输入梯形图")
                return
            ladder_text = text
        
        try:
            ast = parse_source(ladder_text)
            python_code = generate_code(ast)
            
            output_path = os.path.join(os.getcwd(), "output.py")
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(python_code)
            
            self.statusBar().showMessage(f"代码已生成: {output_path}")
            QMessageBox.information(self, "成功", f"Python 代码已生成!\n\n保存位置:\n{output_path}")
            
        except Exception as e:
            QMessageBox.critical(self, "生成错误", f"代码生成失败: {str(e)}")
    
    def _on_run_simulation(self):
        ladder_text = self.scene.get_ladder_text()
        
        if not ladder_text.strip():
            text = self.code_text.toPlainText().strip()
            if not text:
                QMessageBox.warning(self, "警告", "请先创建或输入梯形图")
                return
            ladder_text = text
        
        try:
            ast = parse_source(ladder_text)
            self.simulator = PLCSimulator(ast, scan_interval_ms=100)
            
            self.input_list.clear()
            self.output_list.clear()
            
            inputs = self.simulator.get_all_inputs()
            outputs = self.simulator.get_all_outputs()
            
            if not inputs:
                QMessageBox.warning(self, "警告", "未检测到任何输入触点，请先创建梯形图")
                return
            
            for name, value in sorted(inputs.items()):
                item = QListWidgetItem(f"  {name}:  {'ON' if value else 'OFF'}")
                item.setFlags(item.flags() | Qt.ItemIsUserCheckable)
                item.setCheckState(Qt.Checked if value else Qt.Unchecked)
                item.setFont(QFont("Consolas", 11))
                self.input_list.addItem(item)
            
            for name, value in sorted(outputs.items()):
                item = QListWidgetItem(f"  {name}:  {'ON' if value else 'OFF'}")
                item.setForeground(QBrush(QColor("#cc3333") if value else QColor("#888888")))
                item.setFont(QFont("Consolas", 11, QFont.Bold))
                self.output_list.addItem(item)
            
            self.sim_timer.start(100)
            self.statusBar().showMessage(f"PLC 模拟运行中 - 输入: {len(inputs)} 个, 输出: {len(outputs)} 个")
            QMessageBox.information(
                self, "模拟已启动",
                f"PLC 扫描周期模拟已启动!\n\n"
                f"输入数: {len(inputs)}\n"
                f"输出数: {len(outputs)}\n\n"
                f"请勾选左侧输入列表来改变输入状态，"
                f"观察输出的实时变化。"
            )
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            QMessageBox.critical(self, "模拟错误", f"模拟启动失败: {str(e)}")
    
    def _on_stop_simulation(self):
        self.sim_timer.stop()
        self.simulator = None
        self.statusBar().showMessage("模拟已停止")
    
    def _on_input_changed(self, item):
        if not self.simulator:
            return
        
        text = item.text().strip()
        name = text.split(":")[0].strip()
        is_checked = item.checkState() == Qt.Checked
        
        self.simulator.set_input(name, is_checked)
        item.setText(f"  {name}:  {'ON' if is_checked else 'OFF'}")
    
    def _on_sim_timer(self):
        if not self.simulator:
            return
        
        result = self.simulator.scan()
        
        for i in range(self.output_list.count()):
            item = self.output_list.item(i)
            text = item.text().strip()
            name = text.split(":")[0].strip()
            value = result.outputs.get(name, False)
            item.setText(f"  {name}:  {'ON' if value else 'OFF'}")
            item.setForeground(QBrush(QColor("#cc3333") if value else QColor("#888888")))
        
        self.statusBar().showMessage(f"扫描周期: {result.cycle_number}  |  输入: {dict(result.inputs)}  |  输出: {dict(result.outputs)}")


def main():
    app = QApplication(sys.argv)
    app.setStyle('Fusion')
    window = MainWindow()
    window.showMaximized()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
