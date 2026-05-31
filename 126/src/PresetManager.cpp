#include "PresetManager.h"
#include <QFile>
#include <QJsonDocument>
#include <QJsonArray>
#include <QJsonValue>

QString PresetManager::m_lastError;

PresetManager::PresetManager()
{
}

bool PresetManager::savePreset(const QString& filePath, const Preset& preset)
{
    QJsonObject json = presetToJson(preset);
    QJsonDocument doc(json);

    QFile file(filePath);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        m_lastError = QString("无法打开文件: %1").arg(filePath);
        return false;
    }

    file.write(doc.toJson(QJsonDocument::Indented));
    file.close();
    return true;
}

Preset PresetManager::loadPreset(const QString& filePath)
{
    Preset preset;

    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        m_lastError = QString("无法打开文件: %1").arg(filePath);
        return preset;
    }

    QByteArray data = file.readAll();
    file.close();

    QJsonDocument doc = QJsonDocument::fromJson(data);
    if (!doc.isObject()) {
        m_lastError = "无效的 JSON 格式";
        return preset;
    }

    return presetFromJson(doc.object());
}

bool PresetManager::savePresets(const QString& filePath, const QList<Preset>& presets)
{
    QJsonArray array;
    for (const Preset& preset : presets) {
        array.append(presetToJson(preset));
    }

    QJsonDocument doc(array);

    QFile file(filePath);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        m_lastError = QString("无法打开文件: %1").arg(filePath);
        return false;
    }

    file.write(doc.toJson(QJsonDocument::Indented));
    file.close();
    return true;
}

QList<Preset> PresetManager::loadPresets(const QString& filePath)
{
    QList<Preset> presets;

    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        m_lastError = QString("无法打开文件: %1").arg(filePath);
        return presets;
    }

    QByteArray data = file.readAll();
    file.close();

    QJsonDocument doc = QJsonDocument::fromJson(data);

    if (doc.isArray()) {
        QJsonArray array = doc.array();
        for (const QJsonValue& value : array) {
            if (value.isObject()) {
                presets.append(presetFromJson(value.toObject()));
            }
        }
    } else if (doc.isObject()) {
        presets.append(presetFromJson(doc.object()));
    } else {
        m_lastError = "无效的 JSON 格式";
    }

    return presets;
}

QJsonObject PresetManager::presetToJson(const Preset& preset)
{
    QJsonObject json;
    json["name"] = preset.name;
    json["description"] = preset.description;
    json["id3Pattern"] = preset.id3Pattern;

    QJsonArray rulesArray;
    for (const RenameRule& rule : preset.rules) {
        rulesArray.append(rule.toJson());
    }
    json["rules"] = rulesArray;

    return json;
}

Preset PresetManager::presetFromJson(const QJsonObject& json)
{
    Preset preset;
    preset.name = json["name"].toString();
    preset.description = json["description"].toString();
    preset.id3Pattern = json["id3Pattern"].toString();

    QJsonArray rulesArray = json["rules"].toArray();
    for (const QJsonValue& value : rulesArray) {
        if (value.isObject()) {
            preset.rules.append(RenameRule::fromJson(value.toObject()));
        }
    }

    return preset;
}
