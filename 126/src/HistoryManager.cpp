#include "HistoryManager.h"
#include <QSqlQuery>
#include <QSqlError>
#include <QDir>
#include <QDebug>
#include <QSqlRecord>

HistoryManager::HistoryManager()
    : m_currentBatchId(-1)
{
}

HistoryManager::~HistoryManager()
{
    close();
}

bool HistoryManager::init(const QString& dbPath)
{
    QString path = dbPath;
    if (path.isEmpty()) {
        path = QDir::homePath() + "/.batch_rename_history.db";
    }

    m_db = QSqlDatabase::addDatabase("QSQLITE", "history_conn");
    m_db.setDatabaseName(path);

    if (!m_db.open()) {
        m_lastError = m_db.lastError().text();
        return false;
    }

    if (!optimizeDatabase()) {
        qWarning() << "Failed to optimize database:" << m_lastError;
    }

    return createTables();
}

void HistoryManager::close()
{
    if (m_db.isOpen()) {
        m_db.close();
    }
    QSqlDatabase::removeDatabase("history_conn");
}

bool HistoryManager::optimizeDatabase()
{
    QSqlQuery query(m_db);

    QList<QPair<QString, QString>> pragmas = {
        {"journal_mode", "WAL"},
        {"synchronous", "NORMAL"},
        {"cache_size", "10000"},
        {"temp_store", "MEMORY"},
        {"mmap_size", "268435456"},
        {"busy_timeout", "5000"}
    };

    for (const auto& pragma : pragmas) {
        QString sql = QString("PRAGMA %1 = %2").arg(pragma.first, pragma.second);
        if (!query.exec(sql)) {
            m_lastError = QString("PRAGMA %1 failed: %2").arg(pragma.first, query.lastError().text());
            return false;
        }
    }

    return true;
}

bool HistoryManager::createTables()
{
    QSqlQuery query(m_db);

    QString createBatches = R"(
        CREATE TABLE IF NOT EXISTS batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            undone INTEGER DEFAULT 0
        )
    )";

    if (!query.exec(createBatches)) {
        m_lastError = query.lastError().text();
        return false;
    }

    QString createRecords = R"(
        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id INTEGER,
            old_path TEXT,
            new_path TEXT,
            undone INTEGER DEFAULT 0,
            FOREIGN KEY (batch_id) REFERENCES batches(id)
        )
    )";

    if (!query.exec(createRecords)) {
        m_lastError = query.lastError().text();
        return false;
    }

    query.exec("CREATE INDEX IF NOT EXISTS idx_batch_id ON records(batch_id)");

    return true;
}

int HistoryManager::beginBatch()
{
    QSqlQuery query(m_db);
    query.exec("BEGIN IMMEDIATE TRANSACTION");
    query.exec("INSERT INTO batches (undone) VALUES (0)");
    m_currentBatchId = query.lastInsertId().toInt();
    query.exec("COMMIT");
    return m_currentBatchId;
}

void HistoryManager::addRecord(int batchId, const QString& oldPath, const QString& newPath)
{
    QSqlQuery query(m_db);
    query.prepare("INSERT INTO records (batch_id, old_path, new_path, undone) "
                  "VALUES (?, ?, ?, 0)");
    query.addBindValue(batchId);
    query.addBindValue(oldPath);
    query.addBindValue(newPath);
    query.exec();
}

void HistoryManager::addRecords(int batchId, const QList<QPair<QString, QString>>& records)
{
    if (records.isEmpty())
        return;

    QSqlQuery query(m_db);
    query.exec("BEGIN IMMEDIATE TRANSACTION");

    query.prepare("INSERT INTO records (batch_id, old_path, new_path, undone) "
                  "VALUES (?, ?, ?, 0)");

    for (const auto& record : records) {
        query.addBindValue(batchId);
        query.addBindValue(record.first);
        query.addBindValue(record.second);
        query.exec();
    }

    query.exec("COMMIT");
}

void HistoryManager::commitBatch(int batchId)
{
    QSqlQuery query(m_db);
    query.prepare("UPDATE batches SET undone = 0 WHERE id = ?");
    query.addBindValue(batchId);
    query.exec();
    m_currentBatchId = -1;
}

void HistoryManager::rollbackBatch(int batchId)
{
    QSqlQuery query(m_db);
    query.exec("BEGIN IMMEDIATE TRANSACTION");

    query.prepare("DELETE FROM records WHERE batch_id = ?");
    query.addBindValue(batchId);
    query.exec();

    query.prepare("DELETE FROM batches WHERE id = ?");
    query.addBindValue(batchId);
    query.exec();

    query.exec("COMMIT");
    m_currentBatchId = -1;
}

int HistoryManager::getCurrentPosition() const
{
    QSqlQuery query(m_db);
    query.exec("SELECT COALESCE(MAX(id), 0) FROM batches WHERE undone = 0");
    if (query.next()) {
        return query.value(0).toInt();
    }
    return 0;
}

int HistoryManager::getMaxBatchId() const
{
    QSqlQuery query(m_db);
    query.exec("SELECT COALESCE(MAX(id), 0) FROM batches");
    if (query.next()) {
        return query.value(0).toInt();
    }
    return 0;
}

bool HistoryManager::canUndo() const
{
    return getCurrentPosition() > 0;
}

bool HistoryManager::canRedo() const
{
    QSqlQuery query(m_db);
    query.exec("SELECT COUNT(*) FROM batches WHERE undone = 1");
    if (query.next()) {
        return query.value(0).toInt() > 0;
    }
    return false;
}

QList<RenameRecord> HistoryManager::undo()
{
    QList<RenameRecord> result;

    int currentPos = getCurrentPosition();
    if (currentPos <= 0)
        return result;

    QSqlQuery query(m_db);

    query.exec("BEGIN IMMEDIATE TRANSACTION");

    query.prepare("SELECT id, old_path, new_path FROM records "
                  "WHERE batch_id = ? ORDER BY id DESC");
    query.addBindValue(currentPos);

    if (!query.exec()) {
        query.exec("ROLLBACK");
        return result;
    }

    while (query.next()) {
        RenameRecord rec;
        rec.id = query.value(0).toInt();
        rec.oldPath = query.value(1).toString();
        rec.newPath = query.value(2).toString();
        rec.undone = true;
        result.append(rec);
    }

    query.prepare("UPDATE batches SET undone = 1 WHERE id = ?");
    query.addBindValue(currentPos);
    query.exec();

    query.prepare("UPDATE records SET undone = 1 WHERE batch_id = ?");
    query.addBindValue(currentPos);
    query.exec();

    query.exec("COMMIT");

    return result;
}

QList<RenameRecord> HistoryManager::redo()
{
    QList<RenameRecord> result;

    QSqlQuery query(m_db);
    query.exec("SELECT id FROM batches WHERE undone = 1 ORDER BY id ASC LIMIT 1");
    if (!query.next())
        return result;

    int batchId = query.value(0).toInt();

    query.exec("BEGIN IMMEDIATE TRANSACTION");

    query.prepare("SELECT id, old_path, new_path FROM records "
                  "WHERE batch_id = ? ORDER BY id ASC");
    query.addBindValue(batchId);

    if (!query.exec()) {
        query.exec("ROLLBACK");
        return result;
    }

    while (query.next()) {
        RenameRecord rec;
        rec.id = query.value(0).toInt();
        rec.oldPath = query.value(1).toString();
        rec.newPath = query.value(2).toString();
        rec.undone = false;
        result.append(rec);
    }

    query.prepare("UPDATE batches SET undone = 0 WHERE id = ?");
    query.addBindValue(batchId);
    query.exec();

    query.prepare("UPDATE records SET undone = 0 WHERE batch_id = ?");
    query.addBindValue(batchId);
    query.exec();

    query.exec("COMMIT");

    return result;
}

QList<HistoryBatch> HistoryManager::getHistory() const
{
    QList<HistoryBatch> result;

    QSqlQuery query(m_db);
    query.exec("SELECT id, timestamp, undone FROM batches ORDER BY id DESC");

    while (query.next()) {
        HistoryBatch batch;
        batch.batchId = query.value(0).toInt();
        batch.timestamp = query.value(1).toString();

        QSqlQuery recordQuery(m_db);
        recordQuery.prepare("SELECT id, old_path, new_path, undone FROM records "
                            "WHERE batch_id = ? ORDER BY id");
        recordQuery.addBindValue(batch.batchId);
        recordQuery.exec();

        while (recordQuery.next()) {
            RenameRecord rec;
            rec.id = recordQuery.value(0).toInt();
            rec.oldPath = recordQuery.value(1).toString();
            rec.newPath = recordQuery.value(2).toString();
            rec.undone = recordQuery.value(3).toBool();
            batch.records.append(rec);
        }

        result.append(batch);
    }

    return result;
}

void HistoryManager::clearHistory()
{
    QSqlQuery query(m_db);
    query.exec("BEGIN IMMEDIATE TRANSACTION");
    query.exec("DELETE FROM records");
    query.exec("DELETE FROM batches");
    query.exec("DELETE FROM sqlite_sequence WHERE name='batches'");
    query.exec("DELETE FROM sqlite_sequence WHERE name='records'");
    query.exec("COMMIT");
}
