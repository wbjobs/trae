#ifndef RENAME_RULE_H
#define RENAME_RULE_H

#include <QString>
#include <QJsonObject>
#include <QRegularExpression>

enum class RuleType {
    Replace,
    Insert,
    Sequence,
    Date,
    ID3Tag
};

class RenameRule
{
public:
    RenameRule();
    RenameRule(RuleType type, const QString& param1 = QString(),
               const QString& param2 = QString(), bool enabled = true);

    RuleType type() const { return m_type; }
    void setType(RuleType type) { m_type = type; }

    QString param1() const { return m_param1; }
    void setParam1(const QString& param) { m_param1 = param; }

    QString param2() const { return m_param2; }
    void setParam2(const QString& param) { m_param2 = param; }

    bool enabled() const { return m_enabled; }
    void setEnabled(bool enabled) { m_enabled = enabled; }

    QString apply(const QString& input, int index = 0) const;

    QJsonObject toJson() const;
    static RenameRule fromJson(const QJsonObject& json);

    QString description() const;

private:
    RuleType m_type;
    QString m_param1;
    QString m_param2;
    bool m_enabled;

    QString applyReplace(const QString& input) const;
    QString applyInsert(const QString& input) const;
    QString applySequence(const QString& input, int index) const;
    QString applyDate(const QString& input) const;
};

#endif
