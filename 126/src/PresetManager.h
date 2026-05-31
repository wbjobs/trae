#ifndef PRESET_MANAGER_H
#define PRESET_MANAGER_H

#include <QString>
#include <QList>
#include <QJsonObject>
#include "RenameRule.h"

struct Preset {
    QString name;
    QString description;
    QList<RenameRule> rules;
    QString id3Pattern;
};

class PresetManager
{
public:
    PresetManager();

    static bool savePreset(const QString& filePath, const Preset& preset);
    static Preset loadPreset(const QString& filePath);

    static bool savePresets(const QString& filePath, const QList<Preset>& presets);
    static QList<Preset> loadPresets(const QString& filePath);

    static QJsonObject presetToJson(const Preset& preset);
    static Preset presetFromJson(const QJsonObject& json);

    QString lastError() const { return m_lastError; }

private:
    static QString m_lastError;
};

#endif
