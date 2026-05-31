package com.config.drift.service;

import com.config.drift.model.ConfigSnapshot;
import com.config.drift.model.DriftItem;
import com.config.drift.model.DriftResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Service
public class ConfigComparisonService {

    public DriftResult compare(ConfigSnapshot baseline, ConfigSnapshot current) {
        List<DriftItem> drifts = new ArrayList<>();

        Map<String, Object> baselineFlattened = flatten(baseline.getConfigData(), "");
        Map<String, Object> currentFlattened = flatten(current.getConfigData(), "");

        Set<String> allKeys = new TreeSet<>();
        allKeys.addAll(baselineFlattened.keySet());
        allKeys.addAll(currentFlattened.keySet());

        for (String key : allKeys) {
            Object baselineValue = baselineFlattened.get(key);
            Object currentValue = currentFlattened.get(key);

            if (!baselineFlattened.containsKey(key)) {
                drifts.add(DriftItem.builder()
                        .key(key)
                        .baselineValue(null)
                        .currentValue(currentValue)
                        .driftType(DriftItem.DriftType.ADDED)
                        .build());
            } else if (!currentFlattened.containsKey(key)) {
                drifts.add(DriftItem.builder()
                        .key(key)
                        .baselineValue(baselineValue)
                        .currentValue(null)
                        .driftType(DriftItem.DriftType.REMOVED)
                        .build());
            } else if (!deepEquals(baselineValue, currentValue)) {
                drifts.add(DriftItem.builder()
                        .key(key)
                        .baselineValue(baselineValue)
                        .currentValue(currentValue)
                        .driftType(DriftItem.DriftType.MODIFIED)
                        .build());
            }
        }

        return DriftResult.builder()
                .serviceName(current.getServiceName())
                .baselineCommitId(baseline.getCommitId())
                .currentCommitId(current.getCommitId())
                .hasDrift(!drifts.isEmpty())
                .driftCount(drifts.size())
                .drifts(drifts)
                .detectTime(LocalDateTime.now())
                .build();
    }

    private Map<String, Object> flatten(Map<String, Object> map, String prefix) {
        Map<String, Object> result = new LinkedHashMap<>();

        for (Map.Entry<String, Object> entry : map.entrySet()) {
            String key = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
            Object value = entry.getValue();

            if (value instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> nestedMap = (Map<String, Object>) value;
                result.putAll(flatten(nestedMap, key));
            } else {
                result.put(key, value);
            }
        }

        return result;
    }

    private boolean deepEquals(Object a, Object b) {
        if (a == b) {
            return true;
        }
        if (a == null || b == null) {
            return false;
        }

        Object normalizedA = normalizeValue(a);
        Object normalizedB = normalizeValue(b);

        if (normalizedA instanceof CharSequence && normalizedB instanceof CharSequence) {
            return normalizedA.toString().equals(normalizedB.toString());
        }

        if (normalizedA instanceof Number && normalizedB instanceof Number) {
            return compareNumbers((Number) normalizedA, (Number) normalizedB);
        }

        if (normalizedA instanceof List && normalizedB instanceof List) {
            return deepEqualsList((List<?>) normalizedA, (List<?>) normalizedB);
        }

        if (normalizedA instanceof Map && normalizedB instanceof Map) {
            return deepEqualsMap((Map<?, ?>) normalizedA, (Map<?, ?>) normalizedB);
        }

        return Objects.equals(normalizedA, normalizedB);
    }

    private boolean deepEqualsList(List<?> listA, List<?> listB) {
        if (listA.size() != listB.size()) {
            return false;
        }
        for (int i = 0; i < listA.size(); i++) {
            if (!deepEquals(listA.get(i), listB.get(i))) {
                return false;
            }
        }
        return true;
    }

    private boolean deepEqualsMap(Map<?, ?> mapA, Map<?, ?> mapB) {
        if (mapA.size() != mapB.size()) {
            return false;
        }
        for (Map.Entry<?, ?> entry : mapA.entrySet()) {
            Object key = entry.getKey();
            if (!mapB.containsKey(key)) {
                return false;
            }
            if (!deepEquals(entry.getValue(), mapB.get(key))) {
                return false;
            }
        }
        return true;
    }

    private boolean compareNumbers(Number numA, Number numB) {
        if (numA instanceof Double || numA instanceof Float || numB instanceof Double || numB instanceof Float) {
            double doubleA = numA.doubleValue();
            double doubleB = numB.doubleValue();
            if (Double.isNaN(doubleA) && Double.isNaN(doubleB)) {
                return true;
            }
            return Math.abs(doubleA - doubleB) < 1e-9;
        }
        if (numA instanceof Long || numB instanceof Long) {
            return numA.longValue() == numB.longValue();
        }
        return numA.intValue() == numB.intValue();
    }

    private Object normalizeValue(Object value) {
        if (value == null) {
            return null;
        }

        if (value instanceof String) {
            return normalizeString((String) value);
        }

        if (value instanceof List) {
            List<?> originalList = (List<?>) value;
            List<Object> normalizedList = new ArrayList<>(originalList.size());
            for (Object item : originalList) {
                normalizedList.add(normalizeValue(item));
            }
            return normalizedList;
        }

        if (value instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> originalMap = (Map<String, Object>) value;
            Map<String, Object> normalizedMap = new LinkedHashMap<>();
            for (Map.Entry<String, Object> entry : originalMap.entrySet()) {
                normalizedMap.put(entry.getKey(), normalizeValue(entry.getValue()));
            }
            return normalizedMap;
        }

        return value;
    }

    private String normalizeString(String str) {
        if (str == null) {
            return null;
        }

        String normalized = str;

        normalized = normalized.replace("\r\n", "\n").replace("\r", "\n");

        boolean hasMultilineContent = normalized.contains("\n");

        if (hasMultilineContent) {
            String[] lines = normalized.split("\n", -1);
            if (lines.length > 0) {
                int minIndent = Integer.MAX_VALUE;
                for (int i = 1; i < lines.length; i++) {
                    String line = lines[i];
                    if (!line.isBlank()) {
                        int indent = line.length() - line.stripLeading().length();
                        minIndent = Math.min(minIndent, indent);
                    }
                }

                if (minIndent > 0 && minIndent != Integer.MAX_VALUE) {
                    StringBuilder sb = new StringBuilder();
                    for (int i = 0; i < lines.length; i++) {
                        String line = lines[i];
                        if (i > 0) {
                            sb.append("\n");
                            if (line.length() >= minIndent) {
                                sb.append(line.substring(minIndent));
                            } else {
                                sb.append(line);
                            }
                        } else {
                            sb.append(line);
                        }
                    }
                    normalized = sb.toString();
                }

                String stripped = normalized.strip();
                if (!stripped.equals(normalized) && !stripped.isEmpty()) {
                    normalized = stripped;
                }
            }
        }

        return normalized;
    }
}
