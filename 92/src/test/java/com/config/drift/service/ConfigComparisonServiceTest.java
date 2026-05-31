package com.config.drift.service;

import com.config.drift.model.ConfigSnapshot;
import com.config.drift.model.DriftItem;
import com.config.drift.model.DriftResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class ConfigComparisonServiceTest {

    private ConfigComparisonService comparisonService;

    @BeforeEach
    void setUp() {
        comparisonService = new ConfigComparisonService();
    }

    @Test
    void testMultilineTextWithDifferentLineEndings() {
        String textLF = "line1\nline2\nline3";
        String textCRLF = "line1\r\nline2\r\nline3";
        String textCR = "line1\rline2\rline3";

        Map<String, Object> baselineConfig = Map.of("description", textLF);
        Map<String, Object> currentConfig = Map.of("description", textCRLF);

        DriftResult result = compare(baselineConfig, currentConfig);
        assertFalse(result.isHasDrift(), "LF vs CRLF should not be detected as drift");

        currentConfig = Map.of("description", textCR);
        result = compare(baselineConfig, currentConfig);
        assertFalse(result.isHasDrift(), "LF vs CR should not be detected as drift");
    }

    @Test
    void testMultilineTextWithLeadingTrailingWhitespace() {
        String baseline = "  Hello World  \n  Second Line  ";
        String current = "Hello World\nSecond Line";

        Map<String, Object> baselineConfig = Map.of("message", baseline);
        Map<String, Object> currentConfig = Map.of("message", current);

        DriftResult result = compare(baselineConfig, currentConfig);
        assertFalse(result.isHasDrift(),
                "Multiline text with different leading/trailing whitespace should not be drift");
    }

    @Test
    void testSpecialCharacters() {
        String specialChars = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~";
        String sameSpecialChars = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~";

        Map<String, Object> baselineConfig = Map.of("password", specialChars);
        Map<String, Object> currentConfig = Map.of("password", sameSpecialChars);

        DriftResult result = compare(baselineConfig, currentConfig);
        assertFalse(result.isHasDrift(), "Same special characters should not be drift");
    }

    @Test
    void testNumericTypeDifferences() {
        Map<String, Object> baselineConfig = new LinkedHashMap<>();
        baselineConfig.put("intValue", 42);
        baselineConfig.put("longValue", 100L);
        baselineConfig.put("doubleValue", 3.14);

        Map<String, Object> currentConfig = new LinkedHashMap<>();
        currentConfig.put("intValue", 42L);
        currentConfig.put("longValue", 100);
        currentConfig.put("doubleValue", 3.14f);

        DriftResult result = compare(baselineConfig, currentConfig);
        assertFalse(result.isHasDrift(), "Numeric type differences should not be drift");
    }

    @Test
    void testFloatingPointPrecision() {
        Map<String, Object> baselineConfig = Map.of("value", 0.1 + 0.2);
        Map<String, Object> currentConfig = Map.of("value", 0.3);

        DriftResult result = compare(baselineConfig, currentConfig);
        assertFalse(result.isHasDrift(), "Floating point precision differences should be handled");
    }

    @Test
    void testListDeepComparison() {
        Map<String, Object> baselineConfig = Map.of(
                "items", List.of(
                        Map.of("id", 1, "name", "item1"),
                        Map.of("id", 2, "name", "item2")
                )
        );

        Map<String, Object> currentConfig = Map.of(
                "items", List.of(
                        Map.of("id", 1L, "name", "item1"),
                        Map.of("id", 2L, "name", "item2")
                )
        );

        DriftResult result = compare(baselineConfig, currentConfig);
        assertFalse(result.isHasDrift(), "List with numeric type differences should not be drift");
    }

    @Test
    void testListWithDifferentOrderIsDrift() {
        Map<String, Object> baselineConfig = Map.of("items", List.of("a", "b", "c"));
        Map<String, Object> currentConfig = Map.of("items", List.of("a", "c", "b"));

        DriftResult result = compare(baselineConfig, currentConfig);
        assertTrue(result.isHasDrift(), "List with different order should be drift");
    }

    @Test
    void testNestedMapDeepComparison() {
        Map<String, Object> baselineConfig = Map.of(
                "server", Map.of(
                        "port", 8080,
                        "host", "localhost",
                        "ssl", Map.of("enabled", true)
                )
        );

        Map<String, Object> currentConfig = Map.of(
                "server", Map.of(
                        "port", 8080L,
                        "host", "localhost",
                        "ssl", Map.of("enabled", Boolean.TRUE)
                )
        );

        DriftResult result = compare(baselineConfig, currentConfig);
        assertFalse(result.isHasDrift(), "Nested map with type differences should not be drift");
    }

    @Test
    void testActualValueDifferenceIsDetected() {
        Map<String, Object> baselineConfig = Map.of("key", "value1");
        Map<String, Object> currentConfig = Map.of("key", "value2");

        DriftResult result = compare(baselineConfig, currentConfig);
        assertTrue(result.isHasDrift(), "Actual value difference should be detected");
        assertEquals(1, result.getDriftCount());
        DriftItem drift = result.getDrifts().get(0);
        assertEquals("key", drift.getKey());
        assertEquals(DriftItem.DriftType.MODIFIED, drift.getDriftType());
        assertEquals("value1", drift.getBaselineValue());
        assertEquals("value2", drift.getCurrentValue());
    }

    @Test
    void testAddedAndRemovedKeys() {
        Map<String, Object> baselineConfig = Map.of("key1", "value1", "key2", "value2");
        Map<String, Object> currentConfig = Map.of("key1", "value1", "key3", "value3");

        DriftResult result = compare(baselineConfig, currentConfig);
        assertTrue(result.isHasDrift());
        assertEquals(2, result.getDriftCount());

        Map<String, DriftItem> driftMap = new HashMap<>();
        for (DriftItem item : result.getDrifts()) {
            driftMap.put(item.getKey(), item);
        }

        assertEquals(DriftItem.DriftType.REMOVED, driftMap.get("key2").getDriftType());
        assertEquals(DriftItem.DriftType.ADDED, driftMap.get("key3").getDriftType());
    }

    @Test
    void testEmptyStringVsWhitespace() {
        Map<String, Object> baselineConfig = Map.of("key", "");
        Map<String, Object> currentConfig = Map.of("key", "   ");

        DriftResult result = compare(baselineConfig, currentConfig);
        assertTrue(result.isHasDrift(), "Empty string vs whitespace should be detected as drift");
    }

    @Test
    void testNullVsNonNullIsDrift() {
        Map<String, Object> baselineConfig = new HashMap<>();
        baselineConfig.put("key", null);

        Map<String, Object> currentConfig = Map.of("key", "value");

        DriftResult result = compare(baselineConfig, currentConfig);
        assertTrue(result.isHasDrift(), "Null vs non-null should be drift");
    }

    @Test
    void testBooleanTypeDifferences() {
        Map<String, Object> baselineConfig = Map.of("enabled", true);
        Map<String, Object> currentConfig = Map.of("enabled", Boolean.TRUE);

        DriftResult result = compare(baselineConfig, currentConfig);
        assertFalse(result.isHasDrift(), "Boolean type differences should not be drift");
    }

    @Test
    void testComplexMultilineYamlContent() {
        String yamlContent1 = "spring:\n  datasource:\n    url: jdbc:mysql://localhost:3306/db\n    username: admin\n    password: P@ssw0rd!@#$";
        String yamlContent2 = "spring:\r\n  datasource:\r\n    url: jdbc:mysql://localhost:3306/db\r\n    username: admin\r\n    password: P@ssw0rd!@#$";

        Map<String, Object> baselineConfig = Map.of("config", yamlContent1);
        Map<String, Object> currentConfig = Map.of("config", yamlContent2);

        DriftResult result = compare(baselineConfig, currentConfig);
        assertFalse(result.isHasDrift(),
                "Complex multiline YAML content with different line endings should not be drift");
    }

    @Test
    void testUnicodeAndEmojiCharacters() {
        String unicodeText = "Hello 世界 🌍 🎉";
        Map<String, Object> baselineConfig = Map.of("message", unicodeText);
        Map<String, Object> currentConfig = Map.of("message", "Hello 世界 🌍 🎉");

        DriftResult result = compare(baselineConfig, currentConfig);
        assertFalse(result.isHasDrift(), "Unicode and emoji characters should be compared correctly");
    }

    private DriftResult compare(Map<String, Object> baselineConfig, Map<String, Object> currentConfig) {
        ConfigSnapshot baseline = createSnapshot(baselineConfig);
        ConfigSnapshot current = createSnapshot(currentConfig);
        return comparisonService.compare(baseline, current);
    }

    private ConfigSnapshot createSnapshot(Map<String, Object> configData) {
        ConfigSnapshot snapshot = new ConfigSnapshot();
        snapshot.setServiceName("test-service");
        snapshot.setCommitId(UUID.randomUUID().toString());
        snapshot.setConfigData(configData);
        snapshot.setSnapshotTime(LocalDateTime.now());
        return snapshot;
    }
}
