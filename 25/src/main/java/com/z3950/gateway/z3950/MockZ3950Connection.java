package com.z3950.gateway.z3950;

import com.z3950.gateway.config.Z3950Config;
import lombok.extern.slf4j.Slf4j;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
public class MockZ3950Connection implements Z3950Connection {
    private boolean connected = false;
    private String serverName;
    private Z3950Config.ServerConfig config;

    private static final String[][] MOCK_DATA = {
            {"The Great Gatsby", "F. Scott Fitzgerald", "9780743273565"},
            {"To Kill a Mockingbird", "Harper Lee", "9780061120084"},
            {"1984", "George Orwell", "9780451524935"},
            {"Pride and Prejudice", "Jane Austen", "9780141439518"},
            {"The Catcher in the Rye", "J.D. Salinger", "9780316769488"},
            {"One Hundred Years of Solitude", "Gabriel Garcia Marquez", "9780060883287"},
            {"Brave New World", "Aldous Huxley", "9780060850524"},
            {"The Hobbit", "J.R.R. Tolkien", "9780547928227"},
            {"Fahrenheit 451", "Ray Bradbury", "9781451673319"},
            {"Jane Eyre", "Charlotte Bronte", "9780141441146"},
            {"红楼梦", "曹雪芹", "9787020002209"},
            {"三国演义", "罗贯中", "9787020002216"},
            {"西游记", "吴承恩", "9787020002223"},
            {"水浒传", "施耐庵", "9787020002230"},
            {"活着", "余华", "9787506365437"}
    };

    @Override
    public void connect(Z3950Config.ServerConfig config) throws Exception {
        this.config = config;
        this.serverName = config.getName();
        Thread.sleep(ThreadLocalRandom.current().nextInt(50, 200));
        connected = true;
        log.info("Connected to Z39.50 server: {} ({}:{})", serverName, config.getHost(), config.getPort());
    }

    @Override
    public void disconnect() {
        connected = false;
        log.info("Disconnected from Z39.50 server: {}", serverName);
    }

    @Override
    public boolean isConnected() {
        return connected;
    }

    @Override
    public List<byte[]> search(String query, int maxRecords) throws Exception {
        if (!connected) {
            throw new IllegalStateException("Not connected to Z39.50 server");
        }

        log.info("Searching on {} for query: {}", serverName, query);

        if ("oclc-worldcat".equals(serverName)) {
            Thread.sleep(5000);
        } else {
            Thread.sleep(ThreadLocalRandom.current().nextInt(100, 500));
        }

        List<byte[]> results = new ArrayList<>();
        String lowerQuery = query.toLowerCase();

        for (String[] book : MOCK_DATA) {
            if (results.size() >= maxRecords) break;
            if (book[0].toLowerCase().contains(lowerQuery) ||
                book[1].toLowerCase().contains(lowerQuery) ||
                book[2].contains(query)) {
                Charset charset = "oclc-worldcat".equals(serverName) ?
                    Charset.forName("GBK") : StandardCharsets.UTF_8;
                results.add(createMarcRecord(book[0], book[1], book[2], charset));
            }
        }

        if (results.isEmpty() && MOCK_DATA.length > 0) {
            int count = Math.min(maxRecords, ThreadLocalRandom.current().nextInt(1, 4));
            for (int i = 0; i < count; i++) {
                String[] book = MOCK_DATA[(i + lowerQuery.length()) % MOCK_DATA.length];
                Charset charset = "oclc-worldcat".equals(serverName) ?
                    Charset.forName("GBK") : StandardCharsets.UTF_8;
                results.add(createMarcRecord(book[0], book[1], book[2], charset));
            }
        }

        log.info("Found {} records on {}", results.size(), serverName);
        return results;
    }

    private byte[] createMarcRecord(String title, String author, String isbn) {
        return createMarcRecord(title, author, isbn, StandardCharsets.UTF_8);
    }

    private byte[] createMarcRecord(String title, String author, String isbn, Charset charset) {
        String encodingName = charset.name();
        String marcXml = String.format(
            "<?xml version=\"1.0\" encoding=\"" + encodingName + "\"?>\n" +
            "<record xmlns=\"http://www.loc.gov/MARC21/slim\">\n" +
            "  <leader>01234nam a2200313 a 4500</leader>\n" +
            "  <datafield tag=\"245\" ind1=\"0\" ind2=\"0\">\n" +
            "    <subfield code=\"a\">%s</subfield>\n" +
            "  </datafield>\n" +
            "  <datafield tag=\"100\" ind1=\"1\" ind2=\" \">\n" +
            "    <subfield code=\"a\">%s</subfield>\n" +
            "  </datafield>\n" +
            "  <datafield tag=\"020\" ind1=\" \" ind2=\" \">\n" +
            "    <subfield code=\"a\">%s</subfield>\n" +
            "  </datafield>\n" +
            "</record>",
            escapeXml(title), escapeXml(author), escapeXml(isbn)
        );
        return marcXml.getBytes(charset);
    }

    private String escapeXml(String s) {
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }

    @Override
    public String getServerName() {
        return serverName;
    }
}
