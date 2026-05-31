#ifndef FILE_RENAMER_H
#define FILE_RENAMER_H

#include <QObject>
#include <QStringList>
#include <QList>
#include <QFileInfo>
#include "RenameRule.h"
#include "HistoryManager.h"
#include "ID3Reader.h"

enum class ConflictResolution {
    AutoRename,
    Skip,
    Overwrite,
    Ask
};

enum class ConflictType {
    None,
    WithExistingFile,
    WithOtherRename
};

struct RenamePreview {
    QString oldPath;
    QString oldName;
    QString newName;
    QString newPath;
    QString resolvedNewPath;
    bool willChange;
    QString errorMessage;
    ConflictType conflictType;
    ConflictResolution resolution;
};

class FileRenamer : public QObject
{
    Q_OBJECT

public:
    explicit FileRenamer(QObject* parent = nullptr);
    ~FileRenamer();

    void setFiles(const QStringList& filePaths);
    void addFile(const QString& filePath);
    void removeFile(int index);
    void clearFiles();

    void setRules(const QList<RenameRule>& rules);
    void addRule(const RenameRule& rule);
    void removeRule(int index);
    void clearRules();

    void setID3Pattern(const QString& pattern);
    void setUseID3(bool use);

    void setConflictResolution(ConflictResolution resolution);
    ConflictResolution conflictResolution() const { return m_conflictResolution; }

    QList<RenamePreview> preview() const;
    bool execute();

    bool canUndo() const;
    bool canRedo() const;
    bool undo();
    bool redo();

    QStringList files() const { return m_files; }
    QList<RenameRule> rules() const { return m_rules; }

    QString lastError() const { return m_lastError; }

signals:
    void filesChanged();
    void rulesChanged();
    void renameCompleted(int successCount, int failCount);
    void progress(int current, int total);
    void conflictResolutionChanged();

private:
    QStringList m_files;
    QList<RenameRule> m_rules;
    HistoryManager* m_history;
    QString m_id3Pattern;
    bool m_useID3;
    ConflictResolution m_conflictResolution;
    QString m_lastError;

    QString applyRules(const QString& fileName, int index, const QString& filePath) const;
    QString applyID3Tag(const QString& filePath) const;
    bool safeRename(const QString& oldPath, const QString& newPath);
    bool safeRename(const QString& oldPath, const QString& newPath, bool overwrite);
    QString makeUniquePath(const QString& path) const;
    QString makeUniquePathWithExisting(const QString& path, const QSet<QString>& usedPaths) const;
    QList<RenamePreview> resolveConflicts(const QList<RenamePreview>& previews) const;
};

#endif
