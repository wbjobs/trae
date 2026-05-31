from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QTabWidget,
    QStatusBar, QMenuBar, QToolBar, QSplitter, QTreeWidget, QTreeWidgetItem,
    QLabel, QPushButton, QFileDialog, QMessageBox, QInputDialog
)
from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QAction, QIcon, QKeySequence
from typing import Optional
from src.core.models import ProjectInfo
from src.core.config_manager import ConfigManager
from src.core.event_bus import EventBus, EventType
from src.project_manager.project_manager import ProjectManager
from .panels import (
    ProjectPanel, ParameterPanel, MonitorPanel,
    ScriptPanel, SimulationPanel
)


class MainWindow(QMainWindow):
    project_loaded = Signal(object)
    project_saved = Signal(str)

    def __init__(self):
        super().__init__()
        self._config = ConfigManager()
        self._project_manager = ProjectManager()
        self._event_bus = EventBus()
        self._init_ui()
        self._init_menu()
        self._init_toolbar()
        self._init_statusbar()
        self._connect_events()
        self._update_title()

    def _init_ui(self):
        self.setMinimumSize(1280, 800)
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        splitter = QSplitter(Qt.Horizontal)
        main_layout.addWidget(splitter)

        self._project_tree = QTreeWidget()
        self._project_tree.setHeaderLabel("项目结构")
        self._project_tree.setMinimumWidth(250)
        splitter.addWidget(self._project_tree)

        self._tab_widget = QTabWidget()
        splitter.addWidget(self._tab_widget)

        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 4)

        self._project_panel = ProjectPanel(self._project_manager)
        self._parameter_panel = ParameterPanel(self._project_manager)
        self._monitor_panel = MonitorPanel(self._project_manager)
        self._script_panel = ScriptPanel(self._project_manager)
        self._simulation_panel = SimulationPanel(self._project_manager)

        self._tab_widget.addTab(self._project_panel, "工程管理")
        self._tab_widget.addTab(self._parameter_panel, "参数调校")
        self._tab_widget.addTab(self._monitor_panel, "实时监控")
        self._tab_widget.addTab(self._script_panel, "组态脚本")
        self._tab_widget.addTab(self._simulation_panel, "离线联调")

    def _init_menu(self):
        menu_bar = self.menuBar()

        file_menu = menu_bar.addMenu("文件(&F)")

        new_action = QAction("新建工程(&N)", self)
        new_action.setShortcut(QKeySequence.New)
        new_action.triggered.connect(self._new_project)
        file_menu.addAction(new_action)

        open_action = QAction("打开工程(&O)", self)
        open_action.setShortcut(QKeySequence.Open)
        open_action.triggered.connect(self._open_project)
        file_menu.addAction(open_action)

        import_menu = file_menu.addMenu("导入工程")
        import_json = QAction("从 JSON 导入", self)
        import_json.triggered.connect(lambda: self._import_project("JSON Files (*.json)"))
        import_menu.addAction(import_json)
        import_csv = QAction("从 CSV 导入", self)
        import_csv.triggered.connect(lambda: self._import_project("CSV Files (*.csv)"))
        import_menu.addAction(import_csv)

        save_action = QAction("保存工程(&S)", self)
        save_action.setShortcut(QKeySequence.Save)
        save_action.triggered.connect(self._save_project)
        file_menu.addAction(save_action)

        save_as_action = QAction("另存为(&A)...", self)
        save_as_action.setShortcut(QKeySequence.SaveAs)
        save_as_action.triggered.connect(self._save_project_as)
        file_menu.addAction(save_as_action)

        export_menu = file_menu.addMenu("导出工程")
        export_json = QAction("导出为 JSON", self)
        export_json.triggered.connect(lambda: self._export_project("json"))
        export_menu.addAction(export_json)
        export_yaml = QAction("导出为 YAML", self)
        export_yaml.triggered.connect(lambda: self._export_project("yaml"))
        export_menu.addAction(export_yaml)
        export_encrypted = QAction("加密导出", self)
        export_encrypted.triggered.connect(lambda: self._export_project("encrypted"))
        export_menu.addAction(export_encrypted)

        file_menu.addSeparator()
        exit_action = QAction("退出(&X)", self)
        exit_action.setShortcut(QKeySequence.Quit)
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)

        tools_menu = menu_bar.addMenu("工具(&T)")
        batch_calib_action = QAction("批量校准", self)
        batch_calib_action.triggered.connect(self._batch_calibration)
        tools_menu.addAction(batch_calib_action)

        help_menu = menu_bar.addMenu("帮助(&H)")
        about_action = QAction("关于", self)
        about_action.triggered.connect(self._show_about)
        help_menu.addAction(about_action)

    def _init_toolbar(self):
        toolbar = QToolBar("主工具栏")
        toolbar.setMovable(False)
        self.addToolBar(toolbar)

        new_action = QAction("新建", self)
        new_action.triggered.connect(self._new_project)
        toolbar.addAction(new_action)

        open_action = QAction("打开", self)
        open_action.triggered.connect(self._open_project)
        toolbar.addAction(open_action)

        save_action = QAction("保存", self)
        save_action.triggered.connect(self._save_project)
        toolbar.addAction(save_action)

        toolbar.addSeparator()

        connect_action = QAction("连接设备", self)
        connect_action.triggered.connect(self._connect_devices)
        toolbar.addAction(connect_action)

        simulate_action = QAction("仿真模式", self)
        simulate_action.triggered.connect(self._toggle_simulation)
        toolbar.addAction(simulate_action)

    def _init_statusbar(self):
        self._status_bar = QStatusBar()
        self.setStatusBar(self._status_bar)
        self._status_label = QLabel("就绪")
        self._status_bar.addWidget(self._status_label)
        self._connection_label = QLabel("设备: 未连接")
        self._status_bar.addPermanentWidget(self._connection_label)

    def _connect_events(self):
        self._event_bus.subscribe(EventType.PROJECT_LOADED, self._on_project_loaded)
        self._event_bus.subscribe(EventType.PROJECT_SAVED, self._on_project_saved)
        self._event_bus.subscribe(EventType.LOG_MESSAGE, self._on_log_message)

    def _new_project(self):
        name, ok = QInputDialog.getText(self, "新建工程", "请输入工程名称:")
        if ok and name:
            project = self._project_manager.create_project(name)
            self._refresh_project_tree()
            self._status_label.setText(f"已创建工程: {name}")

    def _open_project(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self, "打开工程", "",
            "Config Project Files (*.json *.icp);;All Files (*)"
        )
        if file_path:
            project = self._project_manager.load_project(file_path)
            if project:
                self._refresh_project_tree()
                self._status_label.setText(f"已加载工程: {project.project_name}")
            else:
                QMessageBox.warning(self, "错误", "无法打开工程文件")

    def _import_project(self, filter_str: str):
        file_path, _ = QFileDialog.getOpenFileName(
            self, "导入工程", "", filter_str
        )
        if file_path:
            project = self._project_manager.import_project(file_path)
            if project:
                self._refresh_project_tree()
                self._status_label.setText(f"已导入工程: {project.project_name}")
            else:
                QMessageBox.warning(self, "错误", "无法导入工程文件")

    def _save_project(self):
        if self._project_manager.project_path:
            self._project_manager.save_project(self._project_manager.project_path)
        else:
            self._save_project_as()

    def _save_project_as(self):
        file_path, _ = QFileDialog.getSaveFileName(
            self, "保存工程", "",
            "Config Project Files (*.json *.icp);;All Files (*)"
        )
        if file_path:
            if not file_path.endswith('.json') and not file_path.endswith('.icp'):
                file_path += '.json'
            self._project_manager.save_project(file_path)

    def _export_project(self, format: str):
        if not self._project_manager.current_project:
            QMessageBox.warning(self, "提示", "请先打开或创建工程")
            return
        filters = {
            "json": "JSON Files (*.json)",
            "yaml": "YAML Files (*.yaml *.yml)",
            "encrypted": "Encrypted Project (*.icp)"
        }
        file_path, _ = QFileDialog.getSaveFileName(
            self, f"导出为 {format.upper()}", "", filters.get(format, "All Files (*)")
        )
        if file_path:
            password = None
            if format == "encrypted":
                password, ok = QInputDialog.getText(
                    self, "加密导出", "请输入密码:", echo=QLineEdit.Password
                )
                if not ok:
                    return
            success = self._project_manager.export_project(file_path, format, password)
            if success:
                QMessageBox.information(self, "成功", "工程导出成功")
            else:
                QMessageBox.warning(self, "错误", "工程导出失败")

    def _refresh_project_tree(self):
        self._project_tree.clear()
        project = self._project_manager.current_project
        if not project:
            return
        project_item = QTreeWidgetItem([project.project_name])
        project_item.setIcon(0, self.style().standardIcon(self.style().SP_DirIcon))
        devices_item = QTreeWidgetItem(["设备"])
        for device_id, device in project.devices.items():
            device_item = QTreeWidgetItem([device.device_name])
            device_item.setData(0, Qt.UserRole, ("device", device_id))
            tags_item = QTreeWidgetItem(["点位"])
            for tag_name in device.tags:
                tag_item = QTreeWidgetItem([tag_name])
                tag_item.setData(0, Qt.UserRole, ("tag", f"{device_id}.{tag_name}"))
                tags_item.addChild(tag_item)
            device_item.addChild(tags_item)
            devices_item.addChild(device_item)
        project_item.addChild(devices_item)

        scripts_item = QTreeWidgetItem(["脚本"])
        for script_name in project.scripts:
            script_item = QTreeWidgetItem([script_name])
            script_item.setData(0, Qt.UserRole, ("script", script_name))
            scripts_item.addChild(script_item)
        project_item.addChild(scripts_item)

        self._project_tree.addTopLevelItem(project_item)
        project_item.setExpanded(True)
        devices_item.setExpanded(True)

    def _connect_devices(self):
        self._status_label.setText("正在连接设备...")

    def _toggle_simulation(self):
        self._status_label.setText("切换到仿真模式")

    def _batch_calibration(self):
        if self._project_manager.current_project:
            self._tab_widget.setCurrentWidget(self._parameter_panel)

    def _show_about(self):
        QMessageBox.about(
            self, "关于",
            "工业组态参数调校客户端 v1.0\n\n"
            "跨平台工业组态参数调校桌面客户端\n"
            "支持 Windows/Linux 双平台运行"
        )

    def _on_project_loaded(self, project: ProjectInfo):
        self._update_title()
        self.project_loaded.emit(project)

    def _on_project_saved(self, file_path: str):
        self._update_title()
        self.project_saved.emit(file_path)
        self._status_label.setText(f"工程已保存: {file_path}")

    def _on_log_message(self, message: str):
        self._status_label.setText(message)

    def _update_title(self):
        project = self._project_manager.current_project
        if project:
            self.setWindowTitle(f"{project.project_name} - 工业组态参数调校客户端")
        else:
            self.setWindowTitle("工业组态参数调校客户端")

    def closeEvent(self, event):
        if self._project_manager.current_project:
            reply = QMessageBox.question(
                self, "确认退出", "是否保存当前工程?",
                QMessageBox.Yes | QMessageBox.No | QMessageBox.Cancel
            )
            if reply == QMessageBox.Yes:
                self._save_project()
            elif reply == QMessageBox.Cancel:
                event.ignore()
                return
        event.accept()


from PySide6.QtWidgets import QLineEdit
