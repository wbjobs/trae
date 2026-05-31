package com.sentiment.service;

import com.sentiment.algorithm.KleinbergBurstDetector;
import com.sentiment.algorithm.KleinbergBurstDetector.BurstEvent;
import com.sentiment.algorithm.KleinbergBurstDetector.EntityTimeSeries;
import com.sentiment.algorithm.KleinbergBurstDetector.TimeBucket;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.stream.Collectors;

@Slf4j
@Service
public class BurstDetectionService {

    private final KleinbergBurstDetector burstDetector;

    private final Map<String, Map<String, ConcurrentLinkedDeque<EntitySample>>> entityTimeSeries = new ConcurrentHashMap<>();

    private final Map<String, BurstEvent> activeBursts = new ConcurrentHashMap<>();

    private final ConcurrentLinkedDeque<BurstAlert> alertHistory = new ConcurrentLinkedDeque<>();

    private static final int MAX_SAMPLES_PER_ENTITY = 600;
    private static final int MAX_ALERT_HISTORY = 1000;
    private static final int DEFAULT_DETECTION_WINDOW_SECONDS = 300;

    @Value("${app.burst.detection.enabled:true}")
    private boolean detectionEnabled;

    @Value("${app.burst.detection.granularity:10s}")
    private String granularity;

    @Value("${app.burst.detection.min-significance:5.0}")
    private double minSignificance;

    @Value("${app.burst.detection.min-burst-level:2}")
    private int minBurstLevel;

    @Value("${app.burst.detection.cooldown-seconds:60}")
    private int cooldownSeconds;

    private final Map<String, Long> lastAlertTimestamps = new ConcurrentHashMap<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class EntitySample {
        private Instant timestamp;
        private long count;
        private long sentimentPositive;
        private long sentimentNegative;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BurstAlert {
        private String id;
        private BurstEvent burstEvent;
        private Instant alertTime;
        private String severity;
        private String message;
        private boolean acknowledged;
        private Map<String, Object> context;
    }

    public BurstDetectionService(KleinbergBurstDetector burstDetector) {
        this.burstDetector = burstDetector;
    }

    public void recordEntitySample(String entity, String entityType, long count,
                                   long positive, long negative) {
        if (!detectionEnabled) return;

        String key = entityType + "|" + entity;

        entityTimeSeries
                .computeIfAbsent(entityType, k -> new ConcurrentHashMap<>())
                .computeIfAbsent(entity, k -> new ConcurrentLinkedDeque<>())
                .add(EntitySample.builder()
                        .timestamp(Instant.now())
                        .count(count)
                        .sentimentPositive(positive)
                        .sentimentNegative(negative)
                        .build());

        ConcurrentLinkedDeque<EntitySample> samples = entityTimeSeries.get(entityType).get(entity);
        while (samples.size() > MAX_SAMPLES_PER_ENTITY) {
            samples.pollFirst();
        }
    }

    public void recordEntitySample(String entity, String entityType, long count) {
        recordEntitySample(entity, entityType, count, 0, 0);
    }

    @Scheduled(fixedDelayString = "${app.burst.detection.interval-ms:10000}")
    public void detectBurstsPeriodically() {
        if (!detectionEnabled) return;

        log.debug("Running burst detection for {} entity types", entityTimeSeries.size());

        Instant detectionWindow = Instant.now().minus(DEFAULT_DETECTION_WINDOW_SECONDS, ChronoUnit.SECONDS);

        for (Map.Entry<String, Map<String, ConcurrentLinkedDeque<EntitySample>>> typeEntry
                : entityTimeSeries.entrySet()) {
            String entityType = typeEntry.getKey();
            Map<String, ConcurrentLinkedDeque<EntitySample>> entities = typeEntry.getValue();

            for (Map.Entry<String, ConcurrentLinkedDeque<EntitySample>> entityEntry
                    : entities.entrySet()) {
                String entity = entityEntry.getKey();
                ConcurrentLinkedDeque<EntitySample> samples = entityEntry.getValue();

                if (samples.size() < 10) continue;

                try {
                    List<Instant> timestamps = new ArrayList<>();
                    List<Long> counts = new ArrayList<>();

                    for (EntitySample sample : samples) {
                        if (sample.getTimestamp().isAfter(detectionWindow)) {
                            timestamps.add(sample.getTimestamp());
                            counts.add(sample.getCount());
                        }
                    }

                    if (timestamps.size() < 10) continue;

                    List<BurstEvent> bursts = burstDetector.detectBurstsFromCounts(
                            entity, entityType, timestamps, counts, granularity);

                    for (BurstEvent burst : bursts) {
                        processBurst(entity, entityType, burst, samples);
                    }

                } catch (Exception e) {
                    log.warn("Error detecting bursts for entity {}: {}", entity, e.getMessage());
                }
            }
        }

        cleanupExpiredBursts();
    }

    private void processBurst(String entity, String entityType, BurstEvent burst,
                              ConcurrentLinkedDeque<EntitySample> samples) {

        if (burst.getBurstLevel() < minBurstLevel) return;
        if (burst.getSignificance() < minSignificance) return;

        String key = entityType + "|" + entity;

        Long lastAlertTime = lastAlertTimestamps.get(key);
        if (lastAlertTime != null
                && Instant.now().getEpochSecond() - lastAlertTime < cooldownSeconds) {
            return;
        }

        long recentPositive = 0, recentNegative = 0, recentTotal = 0;
        Instant recentWindow = Instant.now().minus(60, ChronoUnit.SECONDS);
        for (EntitySample sample : samples) {
            if (sample.getTimestamp().isAfter(recentWindow)) {
                recentPositive += sample.getSentimentPositive();
                recentNegative += sample.getSentimentNegative();
                recentTotal += sample.getCount();
            }
        }

        String sentiment;
        if (recentTotal > 0) {
            double positiveRatio = (double) recentPositive / recentTotal;
            double negativeRatio = (double) recentNegative / recentTotal;
            if (positiveRatio > negativeRatio && positiveRatio > 0.4) {
                sentiment = "POSITIVE";
            } else if (negativeRatio > positiveRatio && negativeRatio > 0.4) {
                sentiment = "NEGATIVE";
            } else {
                sentiment = "NEUTRAL";
            }
        } else {
            sentiment = "NEUTRAL";
        }

        String severity = calculateSeverity(burst.getSignificance(), burst.getBurstLevel());

        Map<String, Object> context = new HashMap<>();
        context.put("sentiment", sentiment);
        context.put("recentPositive", recentPositive);
        context.put("recentNegative", recentNegative);
        context.put("recentTotal", recentTotal);
        context.put("burstLevel", burst.getBurstLevel());
        context.put("growthRate", burst.getGrowthRate());
        context.put("sampleCount", samples.size());

        BurstAlert alert = BurstAlert.builder()
                .id(UUID.randomUUID().toString())
                .burstEvent(burst)
                .alertTime(Instant.now())
                .severity(severity)
                .message(generateAlertMessage(entity, entityType, burst, sentiment, severity))
                .acknowledged(false)
                .context(context)
                .build();

        alertHistory.addFirst(alert);
        while (alertHistory.size() > MAX_ALERT_HISTORY) {
            alertHistory.pollLast();
        }

        activeBursts.put(key, burst);
        lastAlertTimestamps.put(key, Instant.now().getEpochSecond());

        log.info("BURST ALERT [{}] {}: {} (level={}, significance={})",
                severity, entityType, entity, burst.getBurstLevel(), burst.getSignificance());
    }

    private String calculateSeverity(double significance, int burstLevel) {
        double score = significance * burstLevel;
        if (score > 100) return "CRITICAL";
        if (score > 50) return "HIGH";
        if (score > 20) return "MEDIUM";
        return "LOW";
    }

    private String generateAlertMessage(String entity, String entityType, BurstEvent burst,
                                         String sentiment, String severity) {
        StringBuilder sb = new StringBuilder();
        sb.append("[").append(severity).append("] ");
        sb.append(entityType).append("「").append(entity).append("」");

        if ("NEGATIVE".equals(sentiment)) {
            sb.append(" 出现负面舆情爆发");
        } else if ("POSITIVE".equals(sentiment)) {
            sb.append(" 出现正面热度飙升");
        } else {
            sb.append(" 热度突然飙升");
        }

        sb.append("，增长 ").append(String.format("%.1f", burst.getGrowthRate())).append("倍");
        sb.append("，累计讨论 ").append(burst.getCount()).append("条");

        return sb.toString();
    }

    private void cleanupExpiredBursts() {
        Instant expirationThreshold = Instant.now().minus(10, ChronoUnit.MINUTES);
        List<String> expiredKeys = new ArrayList<>();

        for (Map.Entry<String, BurstEvent> entry : activeBursts.entrySet()) {
            if (entry.getValue().getEndTime().isBefore(expirationThreshold)) {
                expiredKeys.add(entry.getKey());
            }
        }

        for (String key : expiredKeys) {
            activeBursts.remove(key);
            log.debug("Burst expired for key: {}", key);
        }
    }

    public List<BurstAlert> getActiveBurstAlerts(int limit) {
        return alertHistory.stream()
                .filter(alert -> !alert.isAcknowledged())
                .limit(limit)
                .collect(Collectors.toList());
    }

    public List<BurstAlert> getAllBurstAlerts(int limit) {
        return alertHistory.stream()
                .limit(limit)
                .collect(Collectors.toList());
    }

    public List<BurstAlert> getBurstAlertsBySeverity(String severity, int limit) {
        return alertHistory.stream()
                .filter(alert -> severity.equalsIgnoreCase(alert.getSeverity()))
                .limit(limit)
                .collect(Collectors.toList());
    }

    public Map<String, Object> getBurstStatistics() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("activeBursts", activeBursts.size());
        stats.put("totalAlerts", alertHistory.size());
        stats.put("unacknowledgedAlerts", alertHistory.stream()
                .filter(a -> !a.isAcknowledged()).count());
        stats.put("monitoredEntities", entityTimeSeries.values().stream()
                .mapToInt(Map::size).sum());

        Map<String, Long> severityCounts = alertHistory.stream()
                .collect(Collectors.groupingBy(BurstAlert::getSeverity, Collectors.counting()));
        stats.put("severityDistribution", severityCounts);

        Map<String, Long> typeCounts = alertHistory.stream()
                .map(a -> a.getBurstEvent().getEntityType())
                .collect(Collectors.groupingBy(t -> t, Collectors.counting()));
        stats.put("entityTypeDistribution", typeCounts);

        return stats;
    }

    public boolean acknowledgeAlert(String alertId) {
        for (BurstAlert alert : alertHistory) {
            if (alert.getId().equals(alertId)) {
                alert.setAcknowledged(true);
                log.info("Alert acknowledged: {}", alertId);
                return true;
            }
        }
        return false;
    }

    public boolean acknowledgeAllAlerts() {
        for (BurstAlert alert : alertHistory) {
            alert.setAcknowledged(true);
        }
        log.info("All alerts acknowledged");
        return true;
    }

    public List<BurstEvent> getActiveBursts() {
        return new ArrayList<>(activeBursts.values());
    }

    public void setDetectionEnabled(boolean enabled) {
        this.detectionEnabled = enabled;
        log.info("Burst detection {}", enabled ? "enabled" : "disabled");
    }

    public boolean isDetectionEnabled() {
        return detectionEnabled;
    }

    public void clearAllData() {
        entityTimeSeries.clear();
        activeBursts.clear();
        alertHistory.clear();
        lastAlertTimestamps.clear();
        log.info("Burst detection data cleared");
    }
}
