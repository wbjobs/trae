#ifndef MAIN_WINDOW_H
#define MAIN_WINDOW_H

#include <QMainWindow>
#include <QTableWidget>
#include <QListWidget>
#include <QComboBox>
#include <QLineEdit>
#include <QPushButton>
#include <QCheckBox>
#include <QSpinBox>
#include <QGroupBox>
#include <QLabel>
#include <QProgressBar>
#include <QThread>
#include "FileRenamer.h"
#include "PresetManager.h"

class RenameWorker : public QObject
{
    Q_OBJECT

public:
    enum Operation {
        Execute,
        Undo,
        Redo
    };

    explicit RenameWorker(FileRenamer* renamer, Operation op, QObject* parent = nullptr)
        : QObject(parent), m_renamer(renamer), m_operation(op) {}

public slots:
    void process() {
        bool success = false;
        switch (m_operation) {
        case Execute:
            success = m_renamer->execute();
            break;
        case Undo:
            success = m_renamer->undo();
            break;
        case Redo:
            success = m_renamer->redo();
            break;
        }
        emit finished(success);
    }

signals:
    void finished(bool success);

private:
    FileRenamer* m_renamer;
    Operation m_operation;
};

class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    MainWindow(QWidget* parent = nullptr);
    ~MainWindow();

private slots:
    void addFiles();
    void addFolder();
    void removeSelected();
    void clearAll();

    void addRule();
    void removeRule();
    void moveRuleUp();
    void moveRuleDown();
    void updateRuleUI();

    void refreshPreview();
    void executeRename();

    void undo();
    void redo();

    void savePreset();
    void loadPreset();

    void ruleTypeChanged(int index);
    void ruleParamChanged();
    void ruleEnabledChanged(bool checked);

    void updateUndoRedoButtons();
    void updateProgress(int current, int total);
    void onOperationFinished(bool success);
    void onConflictResolutionChanged(int index);

private:
    void setupUI();
    void setupMenuBar();
    void setupConnections();

    void populateRulesList();
    void populatePreviewTable();
    void updateRuleDetails(int index);
    void startOperation(RenameWorker::Operation op);
    void setUIEnabled(bool enabled);

    FileRenamer* m_renamer;
    QThread* m_workerThread;

    QTableWidget* m_previewTable;

    QListWidget* m_rulesList;
    QComboBox* m_ruleTypeCombo;
    QLineEdit* m_ruleParam1Edit;
    QLineEdit* m_ruleParam2Edit;
    QCheckBox* m_ruleEnabledCheck;
    QLabel* m_ruleParam1Label;
    QLabel* m_ruleParam2Label;

    QCheckBox* m_useID3Check;
    QLineEdit* m_id3PatternEdit;

    QComboBox* m_conflictCombo;

    QPushButton* m_addRuleBtn;
    QPushButton* m_removeRuleBtn;
    QPushButton* m_moveUpBtn;
    QPushButton* m_moveDownBtn;

    QPushButton* m_undoBtn;
    QPushButton* m_redoBtn;

    QPushButton* m_executeBtn;

    QProgressBar* m_progressBar;
    QLabel* m_statusLabel;

    QString m_currentPresetPath;
    bool m_operationInProgress;
};

#endif
