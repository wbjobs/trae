#include "RenameRule.h"
#include <QDateTime>

RenameRule::RenameRule()
    : m_type(RuleType::Replace)
    , m_enabled(true)
{
}

RenameRule::RenameRule(RuleType type, const QString& param1,
                       const QString& param2, bool enabled)
    : m_type(type)
    , m_param1(param1)
    , m_param2(param2)
    , m_enabled(enabled)
{
}

QString RenameRule::apply(const QString& input, int index) const
{
    if (!m_enabled)
        return input;

    switch (m_type) {
    case RuleType::Replace:
        return applyReplace(input);
    case RuleType::Insert:
        return applyInsert(input);
    case RuleType::Sequence:
        return applySequence(input, index);
    case RuleType::Date:
        return applyDate(input);
    case RuleType::ID3Tag:
        return input;
    default:
        return input;
    }
}

QString RenameRule::applyReplace(const QString& input) const
{
    QRegularExpression regex(m_param1);
    if (!regex.isValid())
        return input;
    return input.replace(regex, m_param2);
}

QString RenameRule::applyInsert(const QString& input) const
{
    bool ok;
    int position = m_param1.toInt(&ok);
    if (!ok)
        return input;

    QString text = m_param2;
    if (position < 0)
        position = input.length() + position + 1;
    position = qMax(0, qMin(position, input.length()));

    QString result = input;
    result.insert(position, text);
    return result;
}

QString RenameRule::applySequence(const QString& input, int index) const
{
    bool ok;
    int start = m_param1.toInt(&ok);
    if (!ok)
        start = 1;

    int width = m_param2.toInt(&ok);
    if (!ok)
        width = 3;

    int num = start + index;
    QString seqStr = QString("%1").arg(num, width, 10, QChar('0'));
    return input + seqStr;
}

QString RenameRule::applyDate(const QString& input) const
{
    QString format = m_param1.isEmpty() ? "yyyyMMdd" : m_param1;
    QString position = m_param2;
    QString dateStr = QDateTime::currentDateTime().toString(format);

    if (position == "prefix" || position.isEmpty())
        return dateStr + input;
    else if (position == "suffix")
        return input + dateStr;
    else
        return input;
}

QJsonObject RenameRule::toJson() const
{
    QJsonObject json;
    json["type"] = static_cast<int>(m_type);
    json["param1"] = m_param1;
    json["param2"] = m_param2;
    json["enabled"] = m_enabled;
    return json;
}

RenameRule RenameRule::fromJson(const QJsonObject& json)
{
    RenameRule rule;
    rule.m_type = static_cast<RuleType>(json["type"].toInt());
    rule.m_param1 = json["param1"].toString();
    rule.m_param2 = json["param2"].toString();
    rule.m_enabled = json["enabled"].toBool(true);
    return rule;
}

QString RenameRule::description() const
{
    if (!m_enabled)
        return "[禁用] ";

    switch (m_type) {
    case RuleType::Replace:
        return QString("替换: '%1' -> '%2'").arg(m_param1, m_param2);
    case RuleType::Insert:
        return QString("插入: 位置%1 -> '%2'").arg(m_param1, m_param2);
    case RuleType::Sequence:
        return QString("序号: 起始%1, 宽度%2").arg(m_param1, m_param2);
    case RuleType::Date:
        return QString("日期: 格式%1, 位置%2").arg(
            m_param1.isEmpty() ? "yyyyMMdd" : m_param1,
            m_param2.isEmpty() ? "前缀" : m_param2);
    case RuleType::ID3Tag:
        return QString("ID3标签: %1").arg(m_param1);
    default:
        return "未知规则";
    }
}
