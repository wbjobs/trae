#ifndef ID3_READER_H
#define ID3_READER_H

#include <QString>
#include <QMap>
#include <QFile>

struct ID3Tag {
    QString title;
    QString artist;
    QString album;
    QString year;
    QString comment;
    QString track;
    QString genre;
    bool isValid = false;
};

class ID3Reader
{
public:
    ID3Reader();

    static ID3Tag readTag(const QString& filePath);
    static QString formatFileName(const ID3Tag& tag, const QString& pattern);

private:
    static ID3Tag readID3v1(QFile& file);
    static ID3Tag readID3v2(QFile& file);
    static QString parseString(const char* data, int maxLen, bool utf16 = false);
    static int synchsafeToInt(const char* bytes);
    static QString genreToString(int genre);
};

#endif
