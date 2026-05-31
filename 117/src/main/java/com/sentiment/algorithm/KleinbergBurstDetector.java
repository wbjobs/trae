package com.sentiment.algorithm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.*;

@Slf4j
@Component
public class KleinbergBurstDetector {

    private static final int MAX_STATES = 10;
    private static final double DEFAULT_GAMMA = 1.0;
    private static final double DEFAULT_S = 2.0;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BurstEvent {
        private String entity;
        private String entityType;
        private int burstLevel;
        private double intensity;
        private Instant startTime;
        private Instant endTime;
        private long count;
        private double growthRate;
        private double significance;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class EntityTimeSeries {
        private String entity;
        private String entityType;
        private List<TimeBucket> buckets;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TimeBucket {
        private Instant timestamp;
        private long count;
    }

    private static class BurstState {
        int state;
        double cost;
        int prevState;
    }

    public List<BurstEvent> detectBursts(EntityTimeSeries timeSeries) {
        return detectBursts(timeSeries, DEFAULT_S, DEFAULT_GAMMA);
    }

    public List<BurstEvent> detectBursts(EntityTimeSeries timeSeries, double s, double gamma) {
        if (timeSeries == null || timeSeries.getBuckets() == null
                || timeSeries.getBuckets().size() < 2) {
            return Collections.emptyList();
        }

        List<TimeBucket> buckets = timeSeries.getBuckets();
        int n = buckets.size();

        double[] rates = computeRates(buckets);

        double globalMean = computeMean(rates);
        double globalStd = computeStd(rates, globalMean);

        if (globalStd == 0) return Collections.emptyList();

        double[] thresholds = new double[MAX_STATES];
        for (int i = 0; i < MAX_STATES; i++) {
            thresholds[i] = globalMean + i * s * globalStd;
        }

        BurstState[][] dp = new BurstState[n][MAX_STATES];
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < MAX_STATES; j++) {
                dp[i][j] = new BurstState();
            }
        }

        for (int j = 0; j < MAX_STATES; j++) {
            dp[0][j].state = j;
            dp[0][j].cost = emissionCost(rates[0], thresholds[j]);
            dp[0][j].prevState = -1;
        }

        for (int i = 1; i < n; i++) {
            for (int j = 0; j < MAX_STATES; j++) {
                double minCost = Double.MAX_VALUE;
                int bestPrev = 0;

                for (int k = 0; k < MAX_STATES; k++) {
                    double transitionCost = transitionCost(k, j, gamma);
                    double totalCost = dp[i - 1][k].cost + transitionCost;

                    if (totalCost < minCost) {
                        minCost = totalCost;
                        bestPrev = k;
                    }
                }

                dp[i][j].state = j;
                dp[i][j].cost = minCost + emissionCost(rates[i], thresholds[j]);
                dp[i][j].prevState = bestPrev;
            }
        }

        int bestFinalState = 0;
        double minFinalCost = dp[n - 1][0].cost;
        for (int j = 1; j < MAX_STATES; j++) {
            if (dp[n - 1][j].cost < minFinalCost) {
                minFinalCost = dp[n - 1][j].cost;
                bestFinalState = j;
            }
        }

        int[] stateSequence = new int[n];
        int currentState = bestFinalState;
        for (int i = n - 1; i >= 0; i--) {
            stateSequence[i] = currentState;
            currentState = dp[i][currentState].prevState;
        }

        return extractBurstEvents(timeSeries, buckets, rates, stateSequence, thresholds);
    }

    private double[] computeRates(List<TimeBucket> buckets) {
        double[] rates = new double[buckets.size()];
        for (int i = 0; i < buckets.size(); i++) {
            rates[i] = buckets.get(i).getCount();
        }
        return rates;
    }

    private double computeMean(double[] values) {
        double sum = 0;
        for (double v : values) sum += v;
        return sum / values.length;
    }

    private double computeStd(double[] values, double mean) {
        double sumSq = 0;
        for (double v : values) {
            sumSq += (v - mean) * (v - mean);
        }
        return Math.sqrt(sumSq / values.length);
    }

    private double emissionCost(double observed, double threshold) {
        if (observed <= threshold) {
            return 0.1 * (threshold - observed) / (threshold + 1);
        }
        return -Math.log((observed - threshold + 1) / (threshold + 1));
    }

    private double transitionCost(int from, int to, double gamma) {
        if (to <= from) return 0;
        return gamma * (to - from);
    }

    private List<BurstEvent> extractBurstEvents(
            EntityTimeSeries timeSeries,
            List<TimeBucket> buckets,
            double[] rates,
            int[] stateSequence,
            double[] thresholds) {

        List<BurstEvent> events = new ArrayList<>();

        int i = 0;
        while (i < stateSequence.length) {
            if (stateSequence[i] > 0) {
                int burstLevel = stateSequence[i];
                int startIdx = i;

                while (i < stateSequence.length && stateSequence[i] > 0) {
                    burstLevel = Math.max(burstLevel, stateSequence[i]);
                    i++;
                }
                int endIdx = i - 1;

                if (endIdx > startIdx) {
                    Instant startTime = buckets.get(startIdx).getTimestamp();
                    Instant endTime = buckets.get(endIdx).getTimestamp();

                    long count = 0;
                    double maxRate = 0;
                    double sumRate = 0;
                    for (int j = startIdx; j <= endIdx; j++) {
                        count += buckets.get(j).getCount();
                        maxRate = Math.max(maxRate, rates[j]);
                        sumRate += rates[j];
                    }

                    double baselineRate = 0;
                    int baselineCount = 0;
                    for (int j = 0; j < startIdx; j++) {
                        baselineRate += rates[j];
                        baselineCount++;
                    }
                    for (int j = endIdx + 1; j < rates.length; j++) {
                        baselineRate += rates[j];
                        baselineCount++;
                    }
                    baselineRate = baselineCount > 0 ? baselineRate / baselineCount : 1;

                    double avgBurstRate = sumRate / (endIdx - startIdx + 1);
                    double growthRate = baselineRate > 0 ? avgBurstRate / baselineRate : avgBurstRate;
                    double significance = burstLevel * growthRate * (maxRate / (baselineRate + 1));

                    BurstEvent event = BurstEvent.builder()
                            .entity(timeSeries.getEntity())
                            .entityType(timeSeries.getEntityType())
                            .burstLevel(burstLevel)
                            .intensity(maxRate)
                            .startTime(startTime)
                            .endTime(endTime)
                            .count(count)
                            .growthRate(Math.round(growthRate * 100.0) / 100.0)
                            .significance(Math.round(significance * 100.0) / 100.0)
                            .build();

                    events.add(event);
                }
            } else {
                i++;
            }
        }

        events.sort((a, b) -> Double.compare(b.getSignificance(), a.getSignificance()));
        return events;
    }

    public List<BurstEvent> detectBurstsFromCounts(
            String entity,
            String entityType,
            List<Instant> timestamps,
            List<Long> counts,
            String granularity) {

        if (timestamps == null || counts == null || timestamps.size() != counts.size()) {
            return Collections.emptyList();
        }

        int bucketSeconds = switch (granularity.toLowerCase()) {
            case "10s" -> 10;
            case "30s" -> 30;
            case "1m" -> 60;
            case "5m" -> 300;
            default -> 60;
        };

        Map<Long, Long> bucketCounts = new TreeMap<>();
        for (int i = 0; i < timestamps.size(); i++) {
            long bucket = timestamps.get(i).getEpochSecond() / bucketSeconds * bucketSeconds;
            bucketCounts.merge(bucket, counts.get(i), Long::sum);
        }

        List<TimeBucket> buckets = new ArrayList<>();
        if (!bucketCounts.isEmpty()) {
            long startBucket = bucketCounts.keySet().iterator().next();
            long endBucket = ((TreeMap<Long, Long>) bucketCounts).lastKey();

            for (long bucket = startBucket; bucket <= endBucket; bucket += bucketSeconds) {
                buckets.add(TimeBucket.builder()
                        .timestamp(Instant.ofEpochSecond(bucket))
                        .count(bucketCounts.getOrDefault(bucket, 0L))
                        .build());
            }
        }

        EntityTimeSeries timeSeries = EntityTimeSeries.builder()
                .entity(entity)
                .entityType(entityType)
                .buckets(buckets)
                .build();

        return detectBursts(timeSeries);
    }

    public List<BurstEvent> detectBurstsForMultipleEntities(
            Map<String, Map<String, List<Instant>>> entityTimestamps,
            Map<String, Map<String, List<Long>>> entityCounts,
            String granularity) {

        List<BurstEvent> allBursts = new ArrayList<>();

        for (Map.Entry<String, Map<String, List<Instant>>> typeEntry : entityTimestamps.entrySet()) {
            String entityType = typeEntry.getKey();
            Map<String, List<Instant>> timestampsMap = typeEntry.getValue();
            Map<String, List<Long>> countsMap = entityCounts.getOrDefault(entityType, new HashMap<>());

            for (Map.Entry<String, List<Instant>> entityEntry : timestampsMap.entrySet()) {
                String entity = entityEntry.getKey();
                List<Instant> timestamps = entityEntry.getValue();
                List<Long> counts = countsMap.getOrDefault(entity, new ArrayList<>());

                List<BurstEvent> bursts = detectBurstsFromCounts(
                        entity, entityType, timestamps, counts, granularity);
                allBursts.addAll(bursts);
            }
        }

        allBursts.sort((a, b) -> Double.compare(b.getSignificance(), a.getSignificance()));
        return allBursts;
    }
}
