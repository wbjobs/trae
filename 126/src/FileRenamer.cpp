#include "FileRenamer.h"
#include <QFile>
#include <QDir>
#include <QFileInfo>
#include <QDebug>
#include <QSet>

FileRenamer::FileRenamer(QObject* parent)
    : QObject(parent)
    , m_history(new HistoryManager())
    , m_useID3(false)
    , m_conflictResolution(ConflictResolution::AutoRename)
{
    m_history->init();
}

FileRenamer::~FileRenamer()
{
    m_history->close();
    delete m_history;
}

void FileRenamer::setFiles(const QStringList& filePaths)
{
    m_files = filePaths;
    emit filesChanged();
}

void FileRenamer::addFile(const QString& filePath)
{
    if (!m_files.contains(filePath)) {
        m_files.append(filePath);
        emit filesChanged();
    }
}

void FileRenamer::removeFile(int index)
{
    if (index >= 0 && index < m_files.size()) {
        m_files.removeAt(index);
        emit filesChanged();
    }
}

void FileRenamer::clearFiles()
{
    m_files.clear();
    emit filesChanged();
}

void FileRenamer::setRules(const QList<RenameRule>& rules)
{
    m_rules = rules;
    emit rulesChanged();
}

void FileRenamer::addRule(const RenameRule& rule)
{
    m_rules.append(rule);
    emit rulesChanged();
}

void FileRenamer::removeRule(int index)
{
    if (index >= 0 && index < m_rules.size()) {
        m_rules.removeAt(index);
        emit rulesChanged();
    }
}

void FileRenamer::clearRules()
{
    m_rules.clear();
    emit rulesChanged();
}

void FileRenamer::setID3Pattern(const QString& pattern)
{
    m_id3Pattern = pattern;
}

void FileRenamer::setUseID3(bool use)
{
    m_useID3 = use;
}

void FileRenamer::setConflictResolution(ConflictResolution resolution)
{
    if (m_conflictResolution != resolution) {
        m_conflictResolution = resolution;
        emit conflictResolutionChanged();
        emit rulesChanged();
    }
}

QString FileRenamer::applyID3Tag(const QString& filePath) const
{
    if (!m_useID3 || m_id3Pattern.isEmpty())
        return QString();

    QFileInfo info(filePath);
    if (info.suffix().toLower() != "mp3")
        return QString();

    ID3Tag tag = ID3Reader::readTag(filePath);
    if (!tag.isValid)
        return QString();

    QString name = ID3Reader::formatFileName(tag, m_id3Pattern);
    if (name.isEmpty())
        return QString();

    return name + "." + info.suffix();
}

QString FileRenamer::applyRules(const QString& fileName, int index, const QString& filePath) const
{
    QString result;

    if (m_useID3 && !m_id3Pattern.isEmpty()) {
        result = applyID3Tag(filePath);
        if (!result.isEmpty()) {
            for (const RenameRule& rule : m_rules) {
                if (rule.type() != RuleType::ID3Tag) {
                    QFileInfo info(result);
                    QString baseName = info.completeBaseName();
                    QString suffix = info.suffix();
                    baseName = rule.apply(baseName, index);
                    result = baseName + "." + suffix;
                }
            }
            return result;
        }
    }

    QFileInfo info(fileName);
    QString baseName = info.completeBaseName();
    QString suffix = info.suffix();

    for (int i = 0; i < m_rules.size(); ++i) {
        const RenameRule& rule = m_rules[i];
        if (!rule.enabled())
            continue;

        if (rule.type() == RuleType::ID3Tag) {
            QString id3Name = applyID3Tag(filePath);
            if (!id3Name.isEmpty()) {
                QFileInfo id3Info(id3Name);
                baseName = id3Info.completeBaseName();
                suffix = id3Info.suffix();
            }
        } else {
            baseName = rule.apply(baseName, index);
        }
    }

    result = baseName;
    if (!suffix.isEmpty())
        result += "." + suffix;

    return result;
}

QString FileRenamer::makeUniquePath(const QString& path) const
{
    if (!QFile::exists(path))
        return path;

    QFileInfo info(path);
    QString dir = info.path();
    QString baseName = info.completeBaseName();
    QString suffix = info.suffix();

    int counter = 1;
    QString newPath;
    do {
        if (suffix.isEmpty()) {
            newPath = QString("%1/%2_%3").arg(dir, baseName).arg(counter);
        } else {
            newPath = QString("%1/%2_%3.%4").arg(dir, baseName).arg(counter).arg(suffix);
        }
        counter++;
    } while (QFile::exists(newPath));

    return newPath;
}

QString FileRenamer::makeUniquePathWithExisting(
    const QString& path, const QSet<QString>& usedPaths) const
{
    if (!QFile::exists(path) && !usedPaths.contains(path))
        return path;

    QFileInfo info(path);
    QString dir = info.path();
    QString baseName = info.completeBaseName();
    QString suffix = info.suffix();

    int counter = 1;
    QString newPath;
    do {
        if (suffix.isEmpty()) {
            newPath = QString("%1/%2_%3").arg(dir, baseName).arg(counter);
        } else {
            newPath = QString("%1/%2_%3.%4").arg(dir, baseName).arg(counter).arg(suffix);
        }
        counter++;
    } while (QFile::exists(newPath) || usedPaths.contains(newPath));

    return newPath;
}

bool FileRenamer::safeRename(const QString& oldPath, const QString& newPath, bool overwrite)
{
    if (oldPath == newPath)
        return true;

    if (overwrite && QFile::exists(newPath)) {
        QFile::remove(newPath);
    } else if (QFile::exists(newPath)) {
        m_lastError = QString("目标文件已存在: %1").arg(newPath);
        return false;
    }

    QFile file(oldPath);
    if (!file.rename(newPath)) {
        m_lastError = file.errorString();
        return false;
    }

    return true;
}

bool FileRenamer::safeRename(const QString& oldPath, const QString& newPath)
{
    return safeRename(oldPath, newPath, false);
}

QList<RenamePreview> FileRenamer::resolveConflicts(const QList<RenamePreview>& previews) const
{
    QList<RenamePreview> result = previews;
    QMultiMap<QString, int> newPathMap;
    QSet<QString> resolvedPaths;

    for (int i = 0; i < result.size(); ++i) {
        if (result[i].willChange && result[i].conflictType != ConflictType::WithExistingFile) {
            newPathMap.insert(result[i].newPath, i);
        }
    }

    for (int i = 0; i < result.size(); ++i) {
        RenamePreview& p = result[i];
        if (!p.willChange)
            continue;

        if (QFile::exists(p.newPath)) {
            p.conflictType = ConflictType::WithExistingFile;
        } else if (newPathMap.count(p.newPath) > 1) {
            p.conflictType = ConflictType::WithOtherRename;
        } else {
            p.conflictType = ConflictType::None;
        }

        p.resolution = m_conflictResolution;
        p.resolvedNewPath = p.newPath;
        p.errorMessage.clear();

        if (p.conflictType != ConflictType::None) {
            switch (m_conflictResolution) {
            case ConflictResolution::AutoRename: {
                QString resolved = makeUniquePathWithExisting(p.newPath, resolvedPaths);
                p.resolvedNewPath = resolved;
                resolvedPaths.insert(resolved);
                QFileInfo info(resolved);
                p.newName = info.fileName();
                if (p.conflictType == ConflictType::WithExistingFile) {
                    p.errorMessage = QString("自动重命名: %1").arg(info.fileName());
                } else {
                    p.errorMessage = QString("内部冲突，已重命名: %1").arg(info.fileName());
                }
                break;
            }
            case ConflictResolution::Skip:
                p.willChange = false;
                p.errorMessage = "将跳过";
                break;
            case ConflictResolution::Overwrite:
                p.resolvedNewPath = p.newPath;
                resolvedPaths.insert(p.newPath);
                if (p.conflictType == ConflictType::WithExistingFile) {
                    p.errorMessage = "将覆盖已有文件";
                } else {
                    p.errorMessage = "内部冲突，将覆盖";
                }
                break;
            case ConflictResolution::Ask:
                p.willChange = false;
                p.errorMessage = "需要手动确认";
                break;
            }
        } else {
            resolvedPaths.insert(p.newPath);
        }
    }

    return result;
}

QList<RenamePreview> FileRenamer::preview() const
{
    QList<RenamePreview> previews;

    for (int i = 0; i < m_files.size(); ++i) {
        const QString& filePath = m_files[i];
        QFileInfo info(filePath);

        RenamePreview preview;
        preview.oldPath = filePath;
        preview.oldName = info.fileName();
        preview.willChange = false;
        preview.errorMessage.clear();
        preview.conflictType = ConflictType::None;
        preview.resolution = m_conflictResolution;
        preview.resolvedNewPath.clear();

        QString newName = applyRules(info.fileName(), i, filePath);
        if (newName.isEmpty()) {
            newName = info.fileName();
            preview.errorMessage = "无法生成新文件名";
        }

        QString newPath = info.path() + "/" + newName;

        if (newPath != filePath) {
            preview.willChange = true;
        }

        preview.newName = newName;
        preview.newPath = newPath;
        previews.append(preview);
    }

    return resolveConflicts(previews);
}

bool FileRenamer::execute()
{
    QList<RenamePreview> previews = preview();
    QList<QPair<QString, QString>> renamePairs;

    int batchId = m_history->beginBatch();
    int successCount = 0;
    int failCount = 0;
    int skippedCount = 0;
    int totalToRename = 0;

    for (int i = 0; i < previews.size(); ++i) {
        if (previews[i].willChange) {
            totalToRename++;
        }
    }

    emit progress(0, totalToRename);

    for (int i = 0; i < previews.size(); ++i) {
        const RenamePreview& p = previews[i];

        if (!p.willChange) {
            if (p.conflictType != ConflictType::None) {
                skippedCount++;
            }
            continue;
        }

        QString oldPath = p.oldPath;
        QString newPath = p.resolvedNewPath;
        bool overwrite = (p.conflictType != ConflictType::None &&
                         p.resolution == ConflictResolution::Overwrite);

        if (safeRename(oldPath, newPath, overwrite)) {
            renamePairs.append(qMakePair(oldPath, newPath));
            m_files[i] = newPath;
            successCount++;
            emit progress(successCount, totalToRename);
        } else {
            failCount++;
        }
    }

    if (successCount > 0) {
        m_history->addRecords(batchId, renamePairs);
        m_history->commitBatch(batchId);
    } else {
        m_history->rollbackBatch(batchId);
    }

    emit renameCompleted(successCount, failCount);
    emit filesChanged();

    return successCount > 0;
}

bool FileRenamer::canUndo() const
{
    return m_history->canUndo();
}

bool FileRenamer::canRedo() const
{
    return m_history->canRedo();
}

bool FileRenamer::undo()
{
    if (!canUndo())
        return false;

    QList<RenameRecord> records = m_history->undo();
    int restoredCount = 0;
    int total = records.size();

    emit progress(0, total);

    for (int i = 0; i < records.size(); ++i) {
        const RenameRecord& rec = records[i];
        QString oldPath = rec.newPath;
        QString newPath = rec.oldPath;

        if (safeRename(oldPath, newPath)) {
            int idx = m_files.indexOf(oldPath);
            if (idx != -1) {
                m_files[idx] = newPath;
            }
            restoredCount++;
            emit progress(restoredCount, total);
        }
    }

    emit filesChanged();
    return restoredCount > 0;
}

bool FileRenamer::redo()
{
    if (!canRedo())
        return false;

    QList<RenameRecord> records = m_history->redo();
    int restoredCount = 0;
    int total = records.size();

    emit progress(0, total);

    for (int i = 0; i < records.size(); ++i) {
        const RenameRecord& rec = records[i];
        QString oldPath = rec.oldPath;
        QString newPath = rec.newPath;

        if (safeRename(oldPath, newPath)) {
            int idx = m_files.indexOf(oldPath);
            if (idx != -1) {
                m_files[idx] = newPath;
            }
            restoredCount++;
            emit progress(restoredCount, total);
        }
    }

    emit filesChanged();
    return restoredCount > 0;
}
