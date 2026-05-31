from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QGroupBox,
    QTextEdit, QComboBox, QListWidget, QListWidgetItem, QSplitter,
    QMessageBox, QInputDialog, QLineEdit, QFormLayout, QDialog,
    QDialogButtonBox, QCheckBox
)
from PySide6.QtCore import Qt
from PySide6.QtGui import QFont, QSyntaxHighlighter, QTextCharFormat, QColor
from src.project_manager.project_manager import ProjectManager
from src.script_engine.script_executor import ScriptExecutor
from src.script_engine.script_compiler import ScriptInfo, ScriptType
import re


class ScriptHighlighter(QSyntaxHighlighter):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._rules = []
        keyword_format = QTextCharFormat()
        keyword_format.setForeground(QColor("#569CD6"))
        keyword_format.setFontWeight(QFont.Bold)
        keywords = ["if", "else", "elif", "for", "while", "def", "return",
                   "import", "from", "as", "try", "except", "pass", "break",
                   "continue", "class", "in", "and", "or", "not", "is", "None",
                   "True", "False", "with"]
        for word in keywords:
            self._rules.append((rf'\b{word}\b', keyword_format))

        string_format = QTextCharFormat()
        string_format.setForeground(QColor("#CE9178"))
        self._rules.append((r'"[^"\\]*(\\.[^"\\]*)*"', string_format))
        self._rules.append((r"'[^'\\]*(\\.[^'\\]*)*'", string_format))

        comment_format = QTextCharFormat()
        comment_format.setForeground(QColor("#6A9955"))
        self._rules.append((r'#[^\n]*', comment_format))

        number_format = QTextCharFormat()
        number_format.setForeground(QColor("#B5CEA8"))
        self._rules.append((r'\b\d+\.?\d*\b', number_format))

        function_format = QTextCharFormat()
        function_format.setForeground(QColor("#DCDCAA"))
        self._rules.append((r'\b[A-Za-z_][A-Za-z0-9_]*(?=\()', function_format))

        tag_format = QTextCharFormat()
        tag_format.setForeground(QColor("#4EC9B0"))
        self._rules.append((r'tags?\[[^\]]+\]', tag_format))

    def highlightBlock(self, text):
        for pattern, format in self._rules:
            for match in re.finditer(pattern, text):
                self.setFormat(match.start(), match.end() - match.start(), format)


class ScriptPanel(QWidget):
    def __init__(self, project_manager: ProjectManager, parent=None):
        super().__init__(parent)
        self._project_manager = project_manager
        self._script_executor = ScriptExecutor()
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)

        splitter = QSplitter(Qt.Horizontal)

        list_group = QGroupBox("脚本列表")
        list_layout = QVBoxLayout(list_group)
        self._script_list = QListWidget()
        self._script_list.currentItemChanged.connect(self._on_script_selected)
        list_layout.addWidget(self._script_list)

        btn_layout = QHBoxLayout()
        new_btn = QPushButton("新建")
        new_btn.clicked.connect(self._new_script)
        delete_btn = QPushButton("删除")
        delete_btn.clicked.connect(self._delete_script)
        btn_layout.addWidget(new_btn)
        btn_layout.addWidget(delete_btn)
        list_layout.addLayout(btn_layout)
        splitter.addWidget(list_group)

        editor_group = QGroupBox("脚本编辑器")
        editor_layout = QVBoxLayout(editor_group)

        form_layout = QFormLayout()
        self._script_name_edit = QLineEdit()
        self._script_type_combo = QComboBox()
        for st in ScriptType:
            self._script_type_combo.addItem(st.value, st)
        self._script_desc_edit = QLineEdit()
        self._enabled_check = QCheckBox("启用")
        self._enabled_check.setChecked(True)
        form_layout.addRow("脚本名称:", self._script_name_edit)
        form_layout.addRow("脚本类型:", self._script_type_combo)
        form_layout.addRow("描述:", self._script_desc_edit)
        form_layout.addRow(self._enabled_check)
        editor_layout.addLayout(form_layout)

        self._script_editor = QTextEdit()
        self._script_editor.setFont(QFont("Consolas", 10))
        self._highlighter = ScriptHighlighter(self._script_editor.document())
        editor_layout.addWidget(self._script_editor)

        self._validation_label = QLabel("")
        self._validation_label.setWordWrap(True)
        editor_layout.addWidget(self._validation_label)

        editor_btn_layout = QHBoxLayout()
        validate_btn = QPushButton("校验")
        validate_btn.clicked.connect(self._validate_script)
        compile_btn = QPushButton("编译")
        compile_btn.clicked.connect(self._compile_script)
        save_btn = QPushButton("保存")
        save_btn.clicked.connect(self._save_script)
        run_btn = QPushButton("执行")
        run_btn.clicked.connect(self._run_script)
        editor_btn_layout.addWidget(validate_btn)
        editor_btn_layout.addWidget(compile_btn)
        editor_btn_layout.addWidget(save_btn)
        editor_btn_layout.addWidget(run_btn)
        editor_layout.addLayout(editor_btn_layout)

        splitter.addWidget(editor_group)

        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 3)
        layout.addWidget(splitter)

        self._refresh_script_list()

    def _refresh_script_list(self):
        self._script_list.clear()
        project = self._project_manager.current_project
        if not project:
            return
        for script_name, script_content in project.scripts.items():
            item = QListWidgetItem(script_name)
            item.setData(Qt.UserRole, script_content)
            self._script_list.addItem(item)

    def _on_script_selected(self, current, previous):
        if current:
            script_name = current.text()
            self._script_name_edit.setText(script_name)
            project = self._project_manager.current_project
            if project and script_name in project.scripts:
                self._script_editor.setPlainText(project.scripts[script_name])

    def _new_script(self):
        name, ok = QInputDialog.getText(self, "新建脚本", "请输入脚本名称:")
        if ok and name:
            project = self._project_manager.current_project
            if project:
                project.scripts[name] = ""
                self._refresh_script_list()

    def _delete_script(self):
        current = self._script_list.currentItem()
        if not current:
            return
        script_name = current.text()
        reply = QMessageBox.question(self, "确认", f"确定删除脚本 '{script_name}'?")
        if reply == QMessageBox.Yes:
            project = self._project_manager.current_project
            if project and script_name in project.scripts:
                del project.scripts[script_name]
                self._refresh_script_list()

    def _validate_script(self):
        content = self._script_editor.toPlainText()
        is_valid, errors = self._script_executor.validate_script(content)
        if is_valid:
            self._validation_label.setText("✓ 脚本语法正确")
            self._validation_label.setStyleSheet("color: green;")
        else:
            error_msgs = "\n".join([f"行{e.line}: {e.message}" for e in errors])
            self._validation_label.setText(f"✗ 校验失败:\n{error_msgs}")
            self._validation_label.setStyleSheet("color: red;")

    def _compile_script(self):
        content = self._script_editor.toPlainText()
        script_name = self._script_name_edit.text()
        if not script_name:
            QMessageBox.warning(self, "提示", "请输入脚本名称")
            return
        script_type = self._script_type_combo.currentData()
        script_info = ScriptInfo(
            script_id=script_name,
            script_name=script_name,
            script_type=script_type,
            content=content,
            description=self._script_desc_edit.text(),
            enabled=self._enabled_check.isChecked()
        )
        is_valid, errors = self._script_executor.add_script(script_info)
        if is_valid:
            self._validation_label.setText("✓ 编译成功")
            self._validation_label.setStyleSheet("color: green;")
        else:
            error_msgs = "\n".join([f"行{e.line}: {e.message}" for e in errors])
            self._validation_label.setText(f"✗ 编译失败:\n{error_msgs}")
            self._validation_label.setStyleSheet("color: red;")

    def _save_script(self):
        script_name = self._script_name_edit.text()
        if not script_name:
            QMessageBox.warning(self, "提示", "请输入脚本名称")
            return
        project = self._project_manager.current_project
        if not project:
            QMessageBox.warning(self, "提示", "请先创建或打开工程")
            return
        project.scripts[script_name] = self._script_editor.toPlainText()
        self._refresh_script_list()
        QMessageBox.information(self, "成功", "脚本已保存到工程")

    def _run_script(self):
        self._compile_script()
        script_name = self._script_name_edit.text()
        if script_name:
            QMessageBox.information(self, "执行", f"脚本 '{script_name}' 已加入执行队列")
