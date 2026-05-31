#ifndef HISTORY_MANAGER_H
#define HISTORY_MANAGER_H

#include <QString>
#include <QList>
#include <QSqlDatabase>
#include <QDateTime>
#include <QPair>

struct RenameRecord {
    int id;
    QString oldPath;
    QString newPath;
    QString timestamp;
    bool undone;
};

struct HistoryBatch {
    int batchId;
    QString timestamp;
    QList<RenameRecord> records;
};

class HistoryManager
{
public:
    HistoryManager();
    ~HistoryManager();

    bool init(const QString& dbPath = QString());
    void close();

    int beginBatch();
    void addRecord(int batchId, const QString& oldPath, const QString& newPath);
    void addRecords(int batchId, const QList<QPair<QString, QString>>& records);
    void commitBatch(int batchId);
    void rollbackBatch(int batchId);

    bool canUndo() const;
    bool canRedo() const;

    QList<RenameRecord> undo();
    QList<RenameRecord> redo();

    QList<HistoryBatch> getHistory() const;
    void clearHistory();

    QString lastError() const { return m_lastError; }

private:
    bool createTables();
    bool optimizeDatabase();
    int getCurrentPosition() const;
    int getMaxBatchId() const;

    QSqlDatabase m_db;
    QString m_lastError;
    int m_currentBatchId;
};

#endif
