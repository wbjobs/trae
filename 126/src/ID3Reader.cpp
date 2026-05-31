#include "ID3Reader.h"
#include <QStringDecoder>
#include <QByteArray>
#include <QtEndian>
#include <cstring>

ID3Reader::ID3Reader()
{
}

ID3Tag ID3Reader::readTag(const QString& filePath)
{
    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly)) {
        return ID3Tag();
    }

    ID3Tag tag = readID3v2(file);
    if (tag.isValid) {
        file.close();
        return tag;
    }

    tag = readID3v1(file);
    file.close();
    return tag;
}

ID3Tag ID3Reader::readID3v1(QFile& file)
{
    ID3Tag tag;

    if (file.size() < 128)
        return tag;

    file.seek(file.size() - 128);
    QByteArray header = file.read(3);

    if (header != "TAG")
        return tag;

    char title[31] = {0};
    char artist[31] = {0};
    char album[31] = {0};
    char year[5] = {0};
    char comment[31] = {0};

    file.read(title, 30);
    file.read(artist, 30);
    file.read(album, 30);
    file.read(year, 4);
    file.read(comment, 30);

    qint8 trackByte = 0;
    if (comment[28] == 0 && comment[29] != 0) {
        trackByte = comment[29];
        comment[28] = 0;
    }

    QByteArray genreData = file.read(1);
    qint8 genreByte = genreData.isEmpty() ? -1 : static_cast<qint8>(genreData.at(0));

    tag.title = parseString(title, 30);
    tag.artist = parseString(artist, 30);
    tag.album = parseString(album, 30);
    tag.year = parseString(year, 4);
    tag.comment = parseString(comment, 28);
    if (trackByte > 0)
        tag.track = QString::number(trackByte);
    tag.genre = genreToString(genreByte);
    tag.isValid = true;

    return tag;
}

ID3Tag ID3Reader::readID3v2(QFile& file)
{
    ID3Tag tag;
    file.seek(0);

    QByteArray header = file.read(10);
    if (header.size() < 10 || header.left(3) != "ID3")
        return tag;

    quint8 version = header[3];
    quint8 revision = header[4];
    quint8 flags = header[5];
    int size = synchsafeToInt(header.constData() + 6);

    if (size <= 0 || size > file.size())
        return tag;

    QByteArray frameData = file.read(size);
    int pos = 0;

    QMap<QString, QString> frames;

    while (pos < frameData.size() - 10) {
        if (frameData.at(pos) == 0)
            break;

        QString frameId;
        int frameSize = 0;

        if (version == 4 || version == 3) {
            frameId = QString::fromLatin1(frameData.mid(pos, 4));
            if (version == 4)
                frameSize = synchsafeToInt(frameData.constData() + pos + 4);
            else {
                const uchar* sizePtr = reinterpret_cast<const uchar*>(frameData.constData() + pos + 4);
                frameSize = (sizePtr[0] << 24) | (sizePtr[1] << 16) | (sizePtr[2] << 8) | sizePtr[3];
            }
            pos += 10;
        } else if (version == 2) {
            frameId = QString::fromLatin1(frameData.mid(pos, 3));
            frameSize = (static_cast<uchar>(frameData[pos + 3]) << 16) |
                        (static_cast<uchar>(frameData[pos + 4]) << 8)  |
                         static_cast<uchar>(frameData[pos + 5]);
            pos += 6;
        } else {
            break;
        }

        if (frameSize <= 0 || pos + frameSize > frameData.size())
            break;

        QByteArray frameContent = frameData.mid(pos, frameSize);
        bool utf16 = (frameContent.size() > 0 && frameContent[0] == 1);
        QString value = parseString(frameContent.constData() + (utf16 ? 1 : 0),
                                    frameSize - (utf16 ? 1 : 0), utf16);

        frames[frameId] = value;
        pos += frameSize;
    }

    if (version == 2) {
        tag.title = frames.value("TT2");
        tag.artist = frames.value("TP1");
        tag.album = frames.value("TAL");
        tag.year = frames.value("TYE");
        tag.comment = frames.value("COM");
        tag.track = frames.value("TRK");
        tag.genre = frames.value("TCO");
    } else {
        tag.title = frames.value("TIT2");
        tag.artist = frames.value("TPE1");
        tag.album = frames.value("TALB");
        tag.year = frames.value("TYER");
        if (tag.year.isEmpty())
            tag.year = frames.value("TDRC");
        tag.comment = frames.value("COMM");
        tag.track = frames.value("TRCK");
        tag.genre = frames.value("TCON");
    }

    tag.isValid = !tag.title.isEmpty() || !tag.artist.isEmpty();
    return tag;
}

QString ID3Reader::parseString(const char* data, int maxLen, bool utf16)
{
    if (!data || maxLen <= 0)
        return QString();

    int len = 0;
    if (utf16) {
        while (len < maxLen - 1 && (data[len] != 0 || data[len + 1] != 0))
            len += 2;
        QStringDecoder decoder(QStringDecoder::Utf16LE);
        QString str = decoder(QByteArray(data, len));
        return str.trimmed();
    } else {
        while (len < maxLen && data[len] != 0)
            len++;
        QStringDecoder decoder(QStringDecoder::Latin1);
        QString str = decoder(QByteArray(data, len));
        return str.trimmed();
    }
}

int ID3Reader::synchsafeToInt(const char* bytes)
{
    return (static_cast<uchar>(bytes[0]) << 21) |
           (static_cast<uchar>(bytes[1]) << 14) |
           (static_cast<uchar>(bytes[2]) << 7)  |
            static_cast<uchar>(bytes[3]);
}

QString ID3Reader::genreToString(int genre)
{
    static const char* genres[] = {
        "Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk",
        "Grunge", "Hip-Hop", "Jazz", "Metal", "New Age", "Oldies",
        "Other", "Pop", "R&B", "Rap", "Reggae", "Rock",
        "Techno", "Industrial", "Alternative", "Ska", "Death Metal",
        "Pranks", "Soundtrack", "Euro-Techno", "Ambient", "Trip-Hop",
        "Vocal", "Jazz+Funk", "Fusion", "Trance", "Classical",
        "Instrumental", "Acid", "House", "Game", "Sound Clip",
        "Gospel", "Noise", "AlternRock", "Bass", "Soul", "Punk",
        "Space", "Meditative", "Instrumental Pop", "Instrumental Rock",
        "Ethnic", "Gothic", "Darkwave", "Techno-Industrial",
        "Electronic", "Pop-Folk", "Eurodance", "Dream",
        "Southern Rock", "Comedy", "Cult", "Gangsta", "Top 40",
        "Christian Rap", "Pop/Funk", "Jungle", "Native American",
        "Cabaret", "New Wave", "Psychadelic", "Rave", "Showtunes",
        "Trailer", "Lo-Fi", "Tribal", "Acid Punk", "Acid Jazz",
        "Polka", "Retro", "Musical", "Rock & Roll", "Hard Rock",
        "Folk", "Folk-Rock", "National Folk", "Swing",
        "Fast Fusion", "Bebob", "Latin", "Revival", "Celtic",
        "Bluegrass", "Avantgarde", "Gothic Rock", "Progressive Rock",
        "Psychedelic Rock", "Symphonic Rock", "Slow Rock", "Big Band",
        "Chorus", "Easy Listening", "Acoustic", "Humour", "Speech",
        "Chanson", "Opera", "Chamber Music", "Sonata", "Symphony",
        "Booty Bass", "Primus", "Porn Groove", "Satire",
        "Slow Jam", "Club", "Tango", "Samba", "Folklore",
        "Ballad", "Power Ballad", "Rhythmic Soul", "Freestyle",
        "Duet", "Punk Rock", "Drum Solo", "A Capella",
        "Euro-House", "Dance Hall", "Goa", "Drum & Bass",
        "Club-House", "Hardcore", "Terror", "Indie", "BritPop",
        "Negerpunk", "Polsk Punk", "Beat", "Christian Gangsta Rap",
        "Heavy Metal", "Black Metal", "Crossover",
        "Contemporary Christian", "Christian Rock", "Merengue",
        "Salsa", "Thrash Metal", "Anime", "JPop", "Synthpop"
    };

    if (genre >= 0 && genre < 148)
        return QString::fromLatin1(genres[genre]);
    return QString();
}

QString ID3Reader::formatFileName(const ID3Tag& tag, const QString& pattern)
{
    QString result = pattern;
    result.replace("%title%", tag.title);
    result.replace("%artist%", tag.artist);
    result.replace("%album%", tag.album);
    result.replace("%year%", tag.year);
    result.replace("%track%", tag.track);
    result.replace("%genre%", tag.genre);
    return result;
}
