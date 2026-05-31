package com.z3950.gateway.util;

import com.z3950.gateway.model.Book;
import lombok.extern.slf4j.Slf4j;
import org.marc4j.MarcReader;
import org.marc4j.MarcXmlReader;
import org.marc4j.marc.DataField;
import org.marc4j.marc.Record;
import org.marc4j.marc.Subfield;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Component
public class MarcParser {

    private static final Pattern ENCODING_PATTERN =
        Pattern.compile("encoding\\s*=\\s*[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);

    private static final Charset[] DETECT_CHARSETS = {
        StandardCharsets.UTF_8,
        Charset.forName("GBK"),
        Charset.forName("GB2312"),
        Charset.forName("GB18030"),
        StandardCharsets.UTF_16LE,
        StandardCharsets.UTF_16BE,
        StandardCharsets.ISO_8859_1
    };

    public Book parseMarcXml(byte[] marcXmlData) {
        Charset detectedCharset = detectCharset(marcXmlData);
        log.debug("Detected charset: {}", detectedCharset.name());

        try {
            ByteArrayInputStream inputStream = new ByteArrayInputStream(marcXmlData);
            InputStreamReader reader = new InputStreamReader(inputStream, detectedCharset);
            MarcReader marcReader = new MarcXmlReader(reader);

            if (marcReader.hasNext()) {
                Record record = marcReader.next();
                return parseRecord(record);
            }
        } catch (Exception e) {
            log.warn("Failed to parse MARC XML with charset {}, trying alternative method: {}",
                detectedCharset.name(), e.getMessage());
            return parseMarcXmlManually(marcXmlData, detectedCharset);
        }
        return null;
    }

    private Charset detectCharset(byte[] data) {
        try {
            String header = new String(data, 0, Math.min(200, data.length), StandardCharsets.ISO_8859_1);
            Matcher matcher = ENCODING_PATTERN.matcher(header);
            if (matcher.find()) {
                String encoding = matcher.group(1).trim();
                try {
                    return Charset.forName(encoding);
                } catch (Exception e) {
                    log.debug("Unsupported encoding in XML declaration: {}", encoding);
                }
            }
        } catch (Exception e) {
            log.debug("Failed to extract encoding from XML declaration");
        }

        if (data.length >= 3) {
            if ((data[0] & 0xFF) == 0xEF && (data[1] & 0xFF) == 0xBB && (data[2] & 0xFF) == 0xBF) {
                return StandardCharsets.UTF_8;
            }
        }
        if (data.length >= 2) {
            if ((data[0] & 0xFF) == 0xFF && (data[1] & 0xFF) == 0xFE) {
                return StandardCharsets.UTF_16LE;
            }
            if ((data[0] & 0xFF) == 0xFE && (data[1] & 0xFF) == 0xFF) {
                return StandardCharsets.UTF_16BE;
            }
        }

        return detectByContentAnalysis(data);
    }

    private Charset detectByContentAnalysis(byte[] data) {
        Charset bestCharset = StandardCharsets.UTF_8;
        int bestScore = -1;

        for (Charset charset : DETECT_CHARSETS) {
            try {
                String decoded = new String(data, charset);
                int score = scoreDecodedString(decoded, charset);
                if (score > bestScore) {
                    bestScore = score;
                    bestCharset = charset;
                }
            } catch (Exception e) {
                // Skip this charset
            }
        }

        return bestCharset;
    }

    private int scoreDecodedString(String decoded, Charset charset) {
        int score = 0;

        if (decoded.contains("<?xml") || decoded.contains("<record")) {
            score += 100;
        }

        int validXmlChars = 0;
        int invalidChars = 0;
        for (char c : decoded.toCharArray()) {
            if (c == 0xFFFD || c == '\uFFFE' || c == '\uFFFF') {
                invalidChars++;
            } else if (c < 0x20 && c != '\t' && c != '\n' && c != '\r') {
                invalidChars++;
            } else {
                validXmlChars++;
            }
        }

        if (invalidChars > 0) {
            score -= invalidChars * 50;
        }

        if (charset.name().startsWith("GB") || charset.name().equals("UTF-8")) {
            int chineseCount = 0;
            for (char c : decoded.toCharArray()) {
                if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF)) {
                    chineseCount++;
                }
            }
            if (chineseCount > 0) {
                score += chineseCount * 10;
            }
        }

        return score;
    }

    private Book parseRecord(Record record) {
        Book.BookBuilder builder = Book.builder();

        DataField titleField = (DataField) record.getVariableField("245");
        if (titleField != null) {
            StringBuilder title = new StringBuilder();
            Subfield subfieldA = titleField.getSubfield('a');
            if (subfieldA != null) {
                title.append(subfieldA.getData());
            }
            Subfield subfieldB = titleField.getSubfield('b');
            if (subfieldB != null) {
                title.append(" ").append(subfieldB.getData());
            }
            builder.title(title.toString().trim().replaceAll("/$", "").trim());
        }

        DataField authorField = (DataField) record.getVariableField("100");
        if (authorField == null) {
            authorField = (DataField) record.getVariableField("110");
        }
        if (authorField == null) {
            authorField = (DataField) record.getVariableField("700");
        }
        if (authorField != null) {
            Subfield subfieldA = authorField.getSubfield('a');
            if (subfieldA != null) {
                builder.author(subfieldA.getData().trim());
            }
        }

        DataField isbnField = (DataField) record.getVariableField("020");
        if (isbnField != null) {
            Subfield subfieldA = isbnField.getSubfield('a');
            if (subfieldA != null) {
                String isbn = subfieldA.getData().trim();
                isbn = isbn.replaceAll("[^0-9Xx]", "");
                if (!isbn.isEmpty()) {
                    builder.isbn(isbn);
                }
            }
        }

        return builder.build();
    }

    private Book parseMarcXmlManually(byte[] marcXmlData, Charset charset) {
        try {
            String xml = new String(marcXmlData, charset);
            Book.BookBuilder builder = Book.builder();

            String title = extractField(xml, "245", 'a');
            if (title != null) {
                builder.title(title.trim().replaceAll("/$", "").trim());
            }

            String author = extractField(xml, "100", 'a');
            if (author == null) {
                author = extractField(xml, "700", 'a');
            }
            if (author != null) {
                builder.author(author.trim());
            }

            String isbn = extractField(xml, "020", 'a');
            if (isbn != null) {
                isbn = isbn.replaceAll("[^0-9Xx]", "");
                if (!isbn.isEmpty()) {
                    builder.isbn(isbn);
                }
            }

            return builder.build();
        } catch (Exception e) {
            log.error("Failed to parse MARC XML manually", e);
            return null;
        }
    }

    private String extractField(String xml, String tag, char code) {
        String regex = "tag=\"" + tag + "\"[\\s\\S]*?<subfield code=\"" + code + "\">([\\s\\S]*?)</subfield>";
        Pattern p = Pattern.compile(regex);
        Matcher m = p.matcher(xml);
        if (m.find()) {
            return m.group(1);
        }
        return null;
    }

    public List<Book> parseMarcRecords(List<byte[]> marcRecords, String sourceServer) {
        List<Book> books = new ArrayList<>();
        for (byte[] record : marcRecords) {
            Book book = parseMarcXml(record);
            if (book != null && (book.getTitle() != null || book.getIsbn() != null)) {
                if (book.getSourceServers() == null) {
                    book.setSourceServers(new ArrayList<>());
                }
                if (!book.getSourceServers().contains(sourceServer)) {
                    book.getSourceServers().add(sourceServer);
                }
                books.add(book);
            }
        }
        return books;
    }
}
