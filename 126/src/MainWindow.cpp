#include "MainWindow.h"
#include <QFileDialog>
#include <QMessageBox>
#include <QHeaderView>
#include <QHBoxLayout>
#include <QVBoxLayout>
#include <QSplitter>
#include <QMenuBar>
#include <QMenu>
#include <QAction>
#include <QToolBar>
#include <QStatusBar>
#include <QInputDialog>
#include <QDirIterator>
#include <QFileInfo>
#include <QBrush>
#include <QColor>
#include <QSet>
#include <algorithm>

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
    , m_renamer(new FileRenamer(this))
    , m_workerThread(nullptr)
    , m_operationInProgress(false)
{
    setupUI();
    setupMenuBar();
    setupConnections();
    refreshPreview();
    updateUndoRedoButtons();
    resize(1200, 800);
}

MainWindow::~MainWindow()
{
    if (m_workerThread) {
        m_workerThread->quit();
        m_workerThread->wait();
        delete m_workerThread;
    }
}

void MainWindow::setupUI()
{
    setWindowTitle("批量文件重命名工具");

    QWidget* centralWidget = new QWidget(this);
    QHBoxLayout* mainLayout = new QHBoxLayout(centralWidget);

    QSplitter* splitter = new QSplitter(Qt::Horizontal, centralWidget);

    QWidget* leftPanel = new QWidget(splitter);
    QVBoxLayout* leftLayout = new QVBoxLayout(leftPanel);
    leftLayout->setContentsMargins(5, 5, 5, 5);

    QGroupBox* filesGroup = new QGroupBox("文件列表", leftPanel);
    QVBoxLayout* filesLayout = new QVBoxLayout(filesGroup);

    QHBoxLayout* fileBtnsLayout = new QHBoxLayout();
    QPushButton* addFilesBtn = new QPushButton("添加文件", filesGroup);
    QPushButton* addFolderBtn = new QPushButton("添加文件夹", filesGroup);
    QPushButton* removeBtn = new QPushButton("移除选中", filesGroup);
    QPushButton* clearBtn = new QPushButton("清空", filesGroup);
    fileBtnsLayout->addWidget(addFilesBtn);
    fileBtnsLayout->addWidget(addFolderBtn);
    fileBtnsLayout->addWidget(removeBtn);
    fileBtnsLayout->addWidget(clearBtn);
    filesLayout->addLayout(fileBtnsLayout);

    m_previewTable = new QTableWidget(filesGroup);
    m_previewTable->setColumnCount(3);
    m_previewTable->setHorizontalHeaderLabels(QStringList() << "原文件名" << "新文件名" << "状态");
    m_previewTable->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    m_previewTable->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_previewTable->setEditTriggers(QAbstractItemView::NoEditTriggers);
    m_previewTable->setAlternatingRowColors(true);
    filesLayout->addWidget(m_previewTable);

    leftLayout->addWidget(filesGroup);

    QGroupBox* actionGroup = new QGroupBox("操作", leftPanel);
    QVBoxLayout* actionLayout = new QVBoxLayout(actionGroup);

    QHBoxLayout* undoRedoLayout = new QHBoxLayout();
    m_undoBtn = new QPushButton("撤销", actionGroup);
    m_redoBtn = new QPushButton("重做", actionGroup);
    m_undoBtn->setEnabled(false);
    m_redoBtn->setEnabled(false);
    undoRedoLayout->addWidget(m_undoBtn);
    undoRedoLayout->addWidget(m_redoBtn);
    actionLayout->addLayout(undoRedoLayout);

    QHBoxLayout* presetLayout = new QHBoxLayout();
    QPushButton* savePresetBtn = new QPushButton("保存预设", actionGroup);
    QPushButton* loadPresetBtn = new QPushButton("加载预设", actionGroup);
    presetLayout->addWidget(savePresetBtn);
    presetLayout->addWidget(loadPresetBtn);
    actionLayout->addLayout(presetLayout);

    m_executeBtn = new QPushButton("执行重命名", actionGroup);
    m_executeBtn->setStyleSheet("font-weight: bold; padding: 10px;");
    actionLayout->addWidget(m_executeBtn);

    m_progressBar = new QProgressBar(actionGroup);
    m_progressBar->setVisible(false);
    actionLayout->addWidget(m_progressBar);

    m_statusLabel = new QLabel(actionGroup);
    m_statusLabel->setAlignment(Qt::AlignCenter);
    actionLayout->addWidget(m_statusLabel);

    leftLayout->addWidget(actionGroup);
    leftLayout->addStretch();

    QWidget* rightPanel = new QWidget(splitter);
    QVBoxLayout* rightLayout = new QVBoxLayout(rightPanel);
    rightLayout->setContentsMargins(5, 5, 5, 5);

    QGroupBox* rulesGroup = new QGroupBox("重命名规则", rightPanel);
    QVBoxLayout* rulesLayout = new QVBoxLayout(rulesGroup);

    QHBoxLayout* ruleBtnsLayout = new QHBoxLayout();
    m_addRuleBtn = new QPushButton("添加规则", rulesGroup);
    m_removeRuleBtn = new QPushButton("删除规则", rulesGroup);
    m_moveUpBtn = new QPushButton("上移", rulesGroup);
    m_moveDownBtn = new QPushButton("下移", rulesGroup);
    ruleBtnsLayout->addWidget(m_addRuleBtn);
    ruleBtnsLayout->addWidget(m_removeRuleBtn);
    ruleBtnsLayout->addWidget(m_moveUpBtn);
    ruleBtnsLayout->addWidget(m_moveDownBtn);
    rulesLayout->addLayout(ruleBtnsLayout);

    m_rulesList = new QListWidget(rulesGroup);
    rulesLayout->addWidget(m_rulesList);

    QGroupBox* ruleDetailsGroup = new QGroupBox("规则详情", rightPanel);
    QVBoxLayout* detailsLayout = new QVBoxLayout(ruleDetailsGroup);

    QHBoxLayout* typeLayout = new QHBoxLayout();
    typeLayout->addWidget(new QLabel("规则类型:"));
    m_ruleTypeCombo = new QComboBox(ruleDetailsGroup);
    m_ruleTypeCombo->addItem("正则替换", static_cast<int>(RuleType::Replace));
    m_ruleTypeCombo->addItem("插入文本", static_cast<int>(RuleType::Insert));
    m_ruleTypeCombo->addItem("序号", static_cast<int>(RuleType::Sequence));
    m_ruleTypeCombo->addItem("日期", static_cast<int>(RuleType::Date));
    m_ruleTypeCombo->addItem("ID3标签", static_cast<int>(RuleType::ID3Tag));
    typeLayout->addWidget(m_ruleTypeCombo);
    detailsLayout->addLayout(typeLayout);

    m_ruleParam1Label = new QLabel("查找:", ruleDetailsGroup);
    m_ruleParam1Edit = new QLineEdit(ruleDetailsGroup);
    detailsLayout->addWidget(m_ruleParam1Label);
    detailsLayout->addWidget(m_ruleParam1Edit);

    m_ruleParam2Label = new QLabel("替换为:", ruleDetailsGroup);
    m_ruleParam2Edit = new QLineEdit(ruleDetailsGroup);
    detailsLayout->addWidget(m_ruleParam2Label);
    detailsLayout->addWidget(m_ruleParam2Edit);

    m_ruleEnabledCheck = new QCheckBox("启用此规则", ruleDetailsGroup);
    m_ruleEnabledCheck->setChecked(true);
    detailsLayout->addWidget(m_ruleEnabledCheck);

    rightLayout->addWidget(rulesGroup);
    rightLayout->addWidget(ruleDetailsGroup);

    QGroupBox* conflictGroup = new QGroupBox("文件名冲突处理", rightPanel);
    QVBoxLayout* conflictLayout = new QVBoxLayout(conflictGroup);

    conflictLayout->addWidget(new QLabel("冲突解决模式:"));
    m_conflictCombo = new QComboBox(conflictGroup);
    m_conflictCombo->addItem("自动重命名 (_1, _2...)", static_cast<int>(ConflictResolution::AutoRename));
    m_conflictCombo->addItem("跳过冲突文件", static_cast<int>(ConflictResolution::Skip));
    m_conflictCombo->addItem("覆盖已有文件", static_cast<int>(ConflictResolution::Overwrite));
    m_conflictCombo->addItem("手动确认", static_cast<int>(ConflictResolution::Ask));
    conflictLayout->addWidget(m_conflictCombo);

    QLabel* legendLabel = new QLabel(
        "<table cellpadding='3'>"
        "<tr><td><span style='color:green;'>●</span></td><td>正常重命名</td></tr>"
        "<tr><td><span style='color:#FFA500;'>●</span></td><td>自动重命名冲突</td></tr>"
        "<tr><td><span style='color:red;'>●</span></td><td>将覆盖/跳过</td></tr>"
        "<tr><td><span style='color:#9932CC;'>●</span></td><td>内部冲突</td></tr>"
        "<tr><td><span style='color:gray;'>●</span></td><td>无变化</td></tr>"
        "</table>", conflictGroup);
    legendLabel->setTextFormat(Qt::RichText);
    conflictLayout->addWidget(legendLabel);

    rightLayout->addWidget(conflictGroup);

    QGroupBox* id3Group = new QGroupBox("MP3 ID3 标签设置", rightPanel);
    QVBoxLayout* id3Layout = new QVBoxLayout(id3Group);

    m_useID3Check = new QCheckBox("使用 ID3 标签重命名 MP3 文件", id3Group);
    id3Layout->addWidget(m_useID3Check);

    id3Layout->addWidget(new QLabel("命名模式 (可用变量: %title%, %artist%, %album%, %year%, %track%, %genre%):"));
    m_id3PatternEdit = new QLineEdit("%track% - %title%", id3Group);
    id3Layout->addWidget(m_id3PatternEdit);

    rightLayout->addWidget(id3Group);
    rightLayout->addStretch();

    splitter->addWidget(leftPanel);
    splitter->addWidget(rightPanel);
    splitter->setStretchFactor(0, 2);
    splitter->setStretchFactor(1, 1);

    mainLayout->addWidget(splitter);
    setCentralWidget(centralWidget);

    statusBar()->showMessage("就绪");
}

void MainWindow::setupMenuBar()
{
    QMenuBar* menubar = menuBar();

    QMenu* fileMenu = menubar->addMenu("文件(&F)");
    fileMenu->addAction("添加文件", this, &MainWindow::addFiles, QKeySequence::Open);
    fileMenu->addAction("添加文件夹", this, &MainWindow::addFolder);
    fileMenu->addSeparator();
    fileMenu->addAction("保存预设", this, &MainWindow::savePreset, QKeySequence::Save);
    fileMenu->addAction("加载预设", this, &MainWindow::loadPreset, QKeySequence::Open);
    fileMenu->addSeparator();
    fileMenu->addAction("退出", this, &QWidget::close, QKeySequence::Quit);

    QMenu* editMenu = menubar->addMenu("编辑(&E)");
    editMenu->addAction("撤销", this, &MainWindow::undo, QKeySequence::Undo);
    editMenu->addAction("重做", this, &MainWindow::redo, QKeySequence::Redo);

    QMenu* helpMenu = menubar->addMenu("帮助(&H)");
    helpMenu->addAction("关于", this, [this]() {
        QMessageBox::about(this, "关于",
            "批量文件重命名工具 v1.0\n\n"
            "功能特性:\n"
            "- 正则表达式替换\n"
            "- 插入日期/序号\n"
            "- MP3 ID3 标签读取\n"
            "- 预览修改前后对比\n"
            "- SQLite 支持撤销/重做\n"
            "- JSON 格式预设保存");
    });
}

void MainWindow::setupConnections()
{
    connect(m_addRuleBtn, &QPushButton::clicked, this, &MainWindow::addRule);
    connect(m_removeRuleBtn, &QPushButton::clicked, this, &MainWindow::removeRule);
    connect(m_moveUpBtn, &QPushButton::clicked, this, &MainWindow::moveRuleUp);
    connect(m_moveDownBtn, &QPushButton::clicked, this, &MainWindow::moveRuleDown);

    connect(m_ruleTypeCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &MainWindow::ruleTypeChanged);
    connect(m_ruleParam1Edit, &QLineEdit::editingFinished, this, &MainWindow::ruleParamChanged);
    connect(m_ruleParam2Edit, &QLineEdit::editingFinished, this, &MainWindow::ruleParamChanged);
    connect(m_ruleEnabledCheck, &QCheckBox::toggled, this, &MainWindow::ruleEnabledChanged);

    connect(m_rulesList, &QListWidget::currentRowChanged, this, &MainWindow::updateRuleDetails);

    connect(m_undoBtn, &QPushButton::clicked, this, &MainWindow::undo);
    connect(m_redoBtn, &QPushButton::clicked, this, &MainWindow::redo);

    connect(m_executeBtn, &QPushButton::clicked, this, &MainWindow::executeRename);

    connect(m_renamer, &FileRenamer::filesChanged, this, &MainWindow::refreshPreview);
    connect(m_renamer, &FileRenamer::rulesChanged, this, &MainWindow::refreshPreview);

    connect(m_useID3Check, &QCheckBox::toggled, this, [this](bool checked) {
        if (!m_operationInProgress) {
            m_renamer->setUseID3(checked);
            refreshPreview();
        }
    });
    connect(m_id3PatternEdit, &QLineEdit::editingFinished, this, [this]() {
        if (!m_operationInProgress) {
            m_renamer->setID3Pattern(m_id3PatternEdit->text());
            refreshPreview();
        }
    });
    connect(m_conflictCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &MainWindow::onConflictResolutionChanged);

    connect(m_renamer, &FileRenamer::progress, this, &MainWindow::updateProgress);

    connect(m_renamer, &FileRenamer::renameCompleted, this, [this](int success, int fail) {
        statusBar()->showMessage(QString("重命名完成: 成功 %1 个, 失败 %2 个").arg(success).arg(fail));
        updateUndoRedoButtons();
    });
}

void MainWindow::addFiles()
{
    if (m_operationInProgress) return;
    QStringList files = QFileDialog::getOpenFileNames(
        this, "选择文件", QDir::homePath(), "所有文件 (*.*)");
    for (const QString& file : files) {
        m_renamer->addFile(file);
    }
}

void MainWindow::addFolder()
{
    if (m_operationInProgress) return;
    QString folder = QFileDialog::getExistingDirectory(
        this, "选择文件夹", QDir::homePath(), QFileDialog::ShowDirsOnly);
    if (folder.isEmpty())
        return;

    QDirIterator it(folder, QDir::Files, QDirIterator::NoIteratorFlags);
    while (it.hasNext()) {
        m_renamer->addFile(it.next());
    }
}

void MainWindow::removeSelected()
{
    if (m_operationInProgress) return;
    QList<QTableWidgetItem*> selected = m_previewTable->selectedItems();
    if (selected.isEmpty())
        return;

    QSet<int> rows;
    for (QTableWidgetItem* item : selected) {
        rows.insert(item->row());
    }

    QList<int> rowList = rows.values();
    std::sort(rowList.begin(), rowList.end(), std::greater<int>());
    for (int row : rowList) {
        m_renamer->removeFile(row);
    }
}

void MainWindow::clearAll()
{
    if (m_operationInProgress) return;
    m_renamer->clearFiles();
}

void MainWindow::addRule()
{
    if (m_operationInProgress) return;
    RuleType type = static_cast<RuleType>(m_ruleTypeCombo->currentData().toInt());
    RenameRule rule(type, m_ruleParam1Edit->text(), m_ruleParam2Edit->text(), true);
    m_renamer->addRule(rule);
    populateRulesList();
    m_rulesList->setCurrentRow(m_rulesList->count() - 1);
}

void MainWindow::removeRule()
{
    if (m_operationInProgress) return;
    int row = m_rulesList->currentRow();
    if (row >= 0) {
        m_renamer->removeRule(row);
        populateRulesList();
        refreshPreview();
    }
}

void MainWindow::moveRuleUp()
{
    if (m_operationInProgress) return;
    int row = m_rulesList->currentRow();
    if (row <= 0) return;

    QList<RenameRule> rules = m_renamer->rules();
    rules.swapItemsAt(row, row - 1);
    m_renamer->setRules(rules);
    populateRulesList();
    m_rulesList->setCurrentRow(row - 1);
}

void MainWindow::moveRuleDown()
{
    if (m_operationInProgress) return;
    int row = m_rulesList->currentRow();
    QList<RenameRule> rules = m_renamer->rules();
    if (row < 0 || row >= rules.size() - 1) return;

    rules.swapItemsAt(row, row + 1);
    m_renamer->setRules(rules);
    populateRulesList();
    m_rulesList->setCurrentRow(row + 1);
}

void MainWindow::updateRuleUI()
{
    RuleType type = static_cast<RuleType>(m_ruleTypeCombo->currentData().toInt());

    switch (type) {
    case RuleType::Replace:
        m_ruleParam1Label->setText("查找 (正则):");
        m_ruleParam2Label->setText("替换为:");
        m_ruleParam1Edit->setPlaceholderText("例如: \\.txt$");
        m_ruleParam2Edit->setPlaceholderText("例如: .md");
        break;
    case RuleType::Insert:
        m_ruleParam1Label->setText("插入位置 (负数表示从末尾):");
        m_ruleParam2Label->setText("插入文本:");
        m_ruleParam1Edit->setPlaceholderText("例如: 0 或 -1");
        m_ruleParam2Edit->setPlaceholderText("例如: prefix_");
        break;
    case RuleType::Sequence:
        m_ruleParam1Label->setText("起始序号:");
        m_ruleParam2Label->setText("数字宽度:");
        m_ruleParam1Edit->setPlaceholderText("例如: 1");
        m_ruleParam2Edit->setPlaceholderText("例如: 3");
        break;
    case RuleType::Date:
        m_ruleParam1Label->setText("日期格式 (yyyyMMdd):");
        m_ruleParam2Label->setText("位置 (prefix/suffix):");
        m_ruleParam1Edit->setPlaceholderText("例如: yyyyMMdd");
        m_ruleParam2Edit->setPlaceholderText("prefix 或 suffix");
        break;
    case RuleType::ID3Tag:
        m_ruleParam1Label->setText("命名模式:");
        m_ruleParam2Label->setText("(留空使用全局设置)");
        m_ruleParam1Edit->setPlaceholderText("%track% - %title%");
        m_ruleParam2Edit->clear();
        break;
    }
}

void MainWindow::ruleTypeChanged(int index)
{
    Q_UNUSED(index);
    updateRuleUI();
}

void MainWindow::ruleParamChanged()
{
    if (m_operationInProgress) return;
    int row = m_rulesList->currentRow();
    QList<RenameRule> rules = m_renamer->rules();
    if (row >= 0 && row < rules.size()) {
        rules[row].setParam1(m_ruleParam1Edit->text());
        rules[row].setParam2(m_ruleParam2Edit->text());
        m_renamer->setRules(rules);
        populateRulesList();
        refreshPreview();
    }
}

void MainWindow::ruleEnabledChanged(bool checked)
{
    if (m_operationInProgress) return;
    int row = m_rulesList->currentRow();
    QList<RenameRule> rules = m_renamer->rules();
    if (row >= 0 && row < rules.size()) {
        rules[row].setEnabled(checked);
        m_renamer->setRules(rules);
        populateRulesList();
        refreshPreview();
    }
}

void MainWindow::populateRulesList()
{
    m_rulesList->blockSignals(true);
    m_rulesList->clear();
    QList<RenameRule> rules = m_renamer->rules();
    for (int i = 0; i < rules.size(); ++i) {
        QListWidgetItem* item = new QListWidgetItem(
            QString("%1. %2").arg(i + 1).arg(rules[i].description()));
        if (!rules[i].enabled()) {
            item->setForeground(QBrush(QColor(128, 128, 128)));
        }
        m_rulesList->addItem(item);
    }
    m_rulesList->blockSignals(false);
}

void MainWindow::populatePreviewTable()
{
    QList<RenamePreview> previews = m_renamer->preview();
    m_previewTable->setRowCount(previews.size());

    for (int i = 0; i < previews.size(); ++i) {
        const RenamePreview& p = previews[i];

        QTableWidgetItem* oldItem = new QTableWidgetItem(p.oldName);
        QTableWidgetItem* newItem = new QTableWidgetItem(p.newName);
        QTableWidgetItem* statusItem = new QTableWidgetItem();

        if (!p.willChange) {
            if (p.conflictType != ConflictType::None) {
                statusItem->setText(p.errorMessage);
                statusItem->setForeground(QBrush(QColor(255, 0, 0)));
                newItem->setForeground(QBrush(QColor(255, 0, 0)));
            } else {
                statusItem->setText("无变化");
                statusItem->setForeground(QBrush(QColor(128, 128, 128)));
                newItem->setForeground(QBrush(QColor(128, 128, 128)));
            }
        } else if (p.conflictType == ConflictType::WithOtherRename) {
            if (p.resolution == ConflictResolution::AutoRename) {
                statusItem->setText(p.errorMessage);
                statusItem->setForeground(QBrush(QColor(153, 50, 204)));
                newItem->setForeground(QBrush(QColor(153, 50, 204)));
            } else if (p.resolution == ConflictResolution::Overwrite) {
                statusItem->setText(p.errorMessage);
                statusItem->setForeground(QBrush(QColor(255, 0, 0)));
                newItem->setForeground(QBrush(QColor(255, 0, 0)));
            } else {
                statusItem->setText(p.errorMessage);
                statusItem->setForeground(QBrush(QColor(255, 0, 0)));
                newItem->setForeground(QBrush(QColor(255, 0, 0)));
            }
        } else if (p.conflictType == ConflictType::WithExistingFile) {
            if (p.resolution == ConflictResolution::AutoRename) {
                statusItem->setText(p.errorMessage);
                statusItem->setForeground(QBrush(QColor(255, 165, 0)));
                newItem->setForeground(QBrush(QColor(255, 165, 0)));
            } else if (p.resolution == ConflictResolution::Overwrite) {
                statusItem->setText(p.errorMessage);
                statusItem->setForeground(QBrush(QColor(255, 0, 0)));
                newItem->setForeground(QBrush(QColor(255, 0, 0)));
            } else {
                statusItem->setText(p.errorMessage);
                statusItem->setForeground(QBrush(QColor(255, 0, 0)));
                newItem->setForeground(QBrush(QColor(255, 0, 0)));
            }
        } else {
            statusItem->setText("将重命名");
            statusItem->setForeground(QBrush(QColor(0, 128, 0)));
            newItem->setForeground(QBrush(QColor(0, 128, 0)));
        }

        m_previewTable->setItem(i, 0, oldItem);
        m_previewTable->setItem(i, 1, newItem);
        m_previewTable->setItem(i, 2, statusItem);
    }
}

void MainWindow::onConflictResolutionChanged(int index)
{
    if (m_operationInProgress) return;
    ConflictResolution resolution = static_cast<ConflictResolution>(
        m_conflictCombo->itemData(index).toInt());
    m_renamer->setConflictResolution(resolution);
    refreshPreview();
}

void MainWindow::updateRuleDetails(int index)
{
    QList<RenameRule> rules = m_renamer->rules();
    if (index < 0 || index >= rules.size())
        return;

    const RenameRule& rule = rules[index];

    m_rulesList->blockSignals(true);
    m_ruleTypeCombo->blockSignals(true);
    m_ruleParam1Edit->blockSignals(true);
    m_ruleParam2Edit->blockSignals(true);
    m_ruleEnabledCheck->blockSignals(true);

    m_ruleTypeCombo->setCurrentIndex(m_ruleTypeCombo->findData(static_cast<int>(rule.type())));
    m_ruleParam1Edit->setText(rule.param1());
    m_ruleParam2Edit->setText(rule.param2());
    m_ruleEnabledCheck->setChecked(rule.enabled());

    updateRuleUI();

    m_rulesList->blockSignals(false);
    m_ruleTypeCombo->blockSignals(false);
    m_ruleParam1Edit->blockSignals(false);
    m_ruleParam2Edit->blockSignals(false);
    m_ruleEnabledCheck->blockSignals(false);
}

void MainWindow::refreshPreview()
{
    if (m_operationInProgress) return;
    populateRulesList();
    populatePreviewTable();
}

void MainWindow::executeRename()
{
    if (m_operationInProgress) return;

    QList<RenamePreview> previews = m_renamer->preview();
    int willChange = 0;
    int errors = 0;
    for (const RenamePreview& p : previews) {
        if (p.willChange && p.errorMessage.isEmpty())
            willChange++;
        if (!p.errorMessage.isEmpty())
            errors++;
    }

    if (willChange == 0) {
        QMessageBox::information(this, "提示", "没有需要重命名的文件");
        return;
    }

    QString msg = QString("确定要重命名 %1 个文件吗？").arg(willChange);
    if (errors > 0) {
        msg += QString("\n注意: 有 %1 个文件存在冲突或错误，将被跳过").arg(errors);
    }

    if (QMessageBox::question(this, "确认", msg,
        QMessageBox::Yes | QMessageBox::No) != QMessageBox::Yes) {
        return;
    }

    startOperation(RenameWorker::Execute);
}

void MainWindow::undo()
{
    if (m_operationInProgress || !m_renamer->canUndo()) return;
    startOperation(RenameWorker::Undo);
}

void MainWindow::redo()
{
    if (m_operationInProgress || !m_renamer->canRedo()) return;
    startOperation(RenameWorker::Redo);
}

void MainWindow::startOperation(RenameWorker::Operation op)
{
    if (m_workerThread) {
        m_workerThread->quit();
        m_workerThread->wait();
        delete m_workerThread;
    }

    m_operationInProgress = true;
    setUIEnabled(false);

    m_progressBar->setVisible(true);
    m_progressBar->setValue(0);
    m_progressBar->setRange(0, 0);

    QString opName;
    switch (op) {
    case RenameWorker::Execute:
        opName = "正在重命名文件...";
        break;
    case RenameWorker::Undo:
        opName = "正在撤销...";
        break;
    case RenameWorker::Redo:
        opName = "正在重做...";
        break;
    }
    m_statusLabel->setText(opName);

    m_workerThread = new QThread();
    RenameWorker* worker = new RenameWorker(m_renamer, op);
    worker->moveToThread(m_workerThread);

    connect(m_workerThread, &QThread::started, worker, &RenameWorker::process);
    connect(worker, &RenameWorker::finished, this, &MainWindow::onOperationFinished);
    connect(worker, &RenameWorker::finished, m_workerThread, &QThread::quit);
    connect(worker, &RenameWorker::finished, worker, &QObject::deleteLater);
    connect(m_workerThread, &QThread::finished, m_workerThread, &QObject::deleteLater);

    m_workerThread->start();
}

void MainWindow::setUIEnabled(bool enabled)
{
    m_addRuleBtn->setEnabled(enabled);
    m_removeRuleBtn->setEnabled(enabled);
    m_moveUpBtn->setEnabled(enabled);
    m_moveDownBtn->setEnabled(enabled);
    m_executeBtn->setEnabled(enabled);
    m_ruleTypeCombo->setEnabled(enabled);
    m_ruleParam1Edit->setEnabled(enabled);
    m_ruleParam2Edit->setEnabled(enabled);
    m_ruleEnabledCheck->setEnabled(enabled);
    m_useID3Check->setEnabled(enabled);
    m_id3PatternEdit->setEnabled(enabled);
    m_rulesList->setEnabled(enabled);
    m_previewTable->setEnabled(enabled);
}

void MainWindow::updateProgress(int current, int total)
{
    if (total > 0) {
        m_progressBar->setRange(0, total);
        m_progressBar->setValue(current);
        m_statusLabel->setText(QString("%1 / %2").arg(current).arg(total));
    }
}

void MainWindow::onOperationFinished(bool success)
{
    Q_UNUSED(success);

    m_operationInProgress = false;
    m_progressBar->setVisible(false);
    m_statusLabel->clear();
    setUIEnabled(true);

    if (m_workerThread) {
        m_workerThread->deleteLater();
        m_workerThread = nullptr;
    }

    updateUndoRedoButtons();
    refreshPreview();
}

void MainWindow::updateUndoRedoButtons()
{
    m_undoBtn->setEnabled(m_renamer->canUndo() && !m_operationInProgress);
    m_redoBtn->setEnabled(m_renamer->canRedo() && !m_operationInProgress);
}

void MainWindow::savePreset()
{
    if (m_operationInProgress) return;
    QString filePath = QFileDialog::getSaveFileName(
        this, "保存预设", QDir::homePath() + "/preset.json", "JSON 文件 (*.json)");
    if (filePath.isEmpty())
        return;

    bool ok;
    QString name = QInputDialog::getText(this, "预设名称", "请输入预设名称:",
        QLineEdit::Normal, "我的预设", &ok);
    if (!ok || name.isEmpty())
        return;

    Preset preset;
    preset.name = name;
    preset.rules = m_renamer->rules();
    preset.id3Pattern = m_id3PatternEdit->text();
    preset.description = QString("包含 %1 条规则").arg(preset.rules.size());

    if (PresetManager::savePreset(filePath, preset)) {
        m_currentPresetPath = filePath;
        statusBar()->showMessage("预设已保存: " + filePath);
    } else {
        QMessageBox::warning(this, "错误", "保存预设失败: " + PresetManager().lastError());
    }
}

void MainWindow::loadPreset()
{
    if (m_operationInProgress) return;
    QString filePath = QFileDialog::getOpenFileName(
        this, "加载预设", QDir::homePath(), "JSON 文件 (*.json)");
    if (filePath.isEmpty())
        return;

    Preset preset = PresetManager::loadPreset(filePath);
    if (preset.name.isEmpty()) {
        QMessageBox::warning(this, "错误", "加载预设失败: " + PresetManager().lastError());
        return;
    }

    m_renamer->setRules(preset.rules);
    if (!preset.id3Pattern.isEmpty()) {
        m_id3PatternEdit->setText(preset.id3Pattern);
        m_renamer->setID3Pattern(preset.id3Pattern);
    }

    populateRulesList();
    refreshPreview();
    m_currentPresetPath = filePath;
    statusBar()->showMessage("已加载预设: " + preset.name);
}
