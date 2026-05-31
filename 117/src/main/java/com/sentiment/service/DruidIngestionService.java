package com.sentiment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.sentiment.dto.*;
import com.sentiment.model.SocialMediaPost;
import com.sentiment.model.SocialMediaPost.SentimentType;
import lombok.extern.slf4j.Slf4j;
import okhttp3.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

@Slf4j
@Service
public class DruidIngestionService {

    @Value("${app.druid.broker-url}")
    private String druidBrokerUrl;

    @Value("${app.druid.datasource}")
    private String datasource;

    @Value("${app.druid.ingestion.batch-size:5000}")
    private int batchSize;

    @Value("${app.druid.ingestion.flush-interval-ms:5000}")
    private long flushIntervalMs;

    @Value("${app.druid.segment.target-partition-size:50000000}")
    private long targetPartitionSize;

    @Value("${app.druid.segment.max-total-rows:5000000}")
    private long maxTotalRows;

    private final OkHttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final DruidQueryService queryService;
    private final BurstDetectionService burstDetectionService;

    private final ConcurrentLinkedDeque<SocialMediaPost> recentPosts = new ConcurrentLinkedDeque<>();
    private final Map<Instant, Map<SentimentType, Long>> sentimentBuckets = new ConcurrentHashMap<>();
    private final Map<String, Long> entityCounts = new ConcurrentHashMap<>();
    private final Map<String, GeoCount> geoCounts = new ConcurrentHashMap<>();
    private final Map<String, Long> sentimentCounts = new ConcurrentHashMap<>();
    private final Map<String, long[]> entitySentimentWindow = new ConcurrentHashMap<>();

    private final List<SocialMediaPost> ingestionBuffer = Collections.synchronizedList(new ArrayList<>());
    private final AtomicLong lastFlushTime = new AtomicLong(System.currentTimeMillis());
    private final AtomicLong lastBurstReportTime = new AtomicLong(System.currentTimeMillis());
    private volatile SegmentStatus segmentStatus = SegmentStatus.UNKNOWN;

    private static final int MAX_RECENT_POSTS = 100000;
    private static final int BURST_REPORT_INTERVAL_MS = 10000;
    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");

    public enum SegmentStatus {
        AVAILABLE, COMPACTING, UNAVAILABLE, UNKNOWN
    }

    public DruidIngestionService(DruidQueryService queryService, BurstDetectionService burstDetectionService) {
        this.queryService = queryService;
        this.burstDetectionService = burstDetectionService;
        this.httpClient = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build();
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());
    }

    public void ingestBatch(List<SocialMediaPost> posts) {
        for (SocialMediaPost post : posts) {
            recentPosts.add(post);
            while (recentPosts.size() > MAX_RECENT_POSTS) {
                recentPosts.pollFirst();
            }
            updateSentimentBuckets(post);
            updateEntityCounts(post);
            updateGeoCounts(post);
            updateSentimentCounts(post);
        }

        ingestionBuffer.addAll(posts);

        if (ingestionBuffer.size() >= batchSize ||
                System.currentTimeMillis() - lastFlushTime.get() >= flushIntervalMs) {
            flushToDruid();
        }
    }

    private synchronized void flushToDruid() {
        if (ingestionBuffer.isEmpty()) return;

        List<SocialMediaPost> batch = new ArrayList<>(ingestionBuffer);
        ingestionBuffer.clear();
        lastFlushTime.set(System.currentTimeMillis());

        try {
            sendToDruid(batch);
            log.debug("Flushed {} posts to Druid", batch.size());
        } catch (Exception e) {
            log.warn("Failed to flush to Druid: {}, keeping in buffer for retry", e.getMessage());
            ingestionBuffer.addAll(0, batch);

            if (e.getMessage() != null && e.getMessage().contains("segment")) {
                updateSegmentStatus(SegmentStatus.COMPACTING);
            }
        }
    }

    private void sendToDruid(List<SocialMediaPost> posts) throws Exception {
        if (segmentStatus == SegmentStatus.COMPACTING) {
            log.info("Skipping Druid ingestion during segment compaction, buffering {} posts", posts.size());
            ingestionBuffer.addAll(0, posts);
            return;
        }

        List<Map<String, Object>> events = posts.stream()
                .map(SocialMediaPost::toMap)
                .collect(Collectors.toList());

        Map<String, Object> payload = Map.of(
                "type", "index",
                "spec", Map.of(
                        "dataSchema", Map.of(
                                "dataSource", datasource,
                                "timestampSpec", Map.of(
                                        "column", "timestamp",
                                        "format", "iso"
                                ),
                                "dimensionsSpec", Map.of(
                                        "dimensions", List.of(
                                                "id", "platform", "author", "content",
                                                "location", "language", "sentiment_type"
                                        )
                                ),
                                "metricsSpec", List.of(
                                        Map.of("type", "count", "name", "count"),
                                        Map.of("type", "doubleSum", "name", "sentiment_positive_sum", "fieldName", "sentiment_positive"),
                                        Map.of("type", "doubleSum", "name", "sentiment_negative_sum", "fieldName", "sentiment_negative"),
                                        Map.of("type", "doubleSum", "name", "sentiment_neutral_sum", "fieldName", "sentiment_neutral"),
                                        Map.of("type", "longSum", "name", "likes_sum", "fieldName", "likes"),
                                        Map.of("type", "longSum", "name", "shares_sum", "fieldName", "shares"),
                                        Map.of("type", "longSum", "name", "comments_sum", "fieldName", "comments")
                                ),
                                "granularitySpec", Map.of(
                                        "type", "uniform",
                                        "segmentGranularity", "HOUR",
                                        "queryGranularity", "MINUTE",
                                        "rollup", true
                                )
                        ),
                        "ioConfig", Map.of(
                                "type", "index",
                                "firehose", Map.of(
                                        "type", "local",
                                        "baseDir", "/tmp/druid",
                                        "filter", "*.json"
                                )
                        ),
                        "tuningConfig", Map.of(
                                "type", "index",
                                "targetPartitionSize", targetPartitionSize,
                                "maxTotalRows", maxTotalRows,
                                "numShards", -1,
                                "indexSpec", Map.of(
                                        "bitmap", Map.of("type", "roaring"),
                                        "dimensionCompression", "lz4",
                                        "metricCompression", "lz4",
                                        "longEncoding", "longs"
                                ),
                                "forceExtendableShardSpecs", true,
                                "useCombinedIndex", true,
                                "maxColumnsToMerge", 3
                        )
                )
        );

        String json = objectMapper.writeValueAsString(payload);
        RequestBody body = RequestBody.create(json, JSON);
        Request request = new Request.Builder()
                .url(druidBrokerUrl + "/druid/indexer/v1/task")
                .post(body)
                .addHeader("Content-Type", "application/json")
                .build();

        log.debug("Sending {} posts to Druid at {}", posts.size(), druidBrokerUrl);

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                String errorBody = response.body() != null ? response.body().string() : "No response";
                log.warn("Druid ingestion response: {} - {}", response.code(), errorBody);

                if (response.code() == 500 && errorBody.contains("segment")) {
                    updateSegmentStatus(SegmentStatus.COMPACTING);
                    throw new RuntimeException("Segment compaction in progress");
                }

                throw new RuntimeException("Ingestion failed: " + response.code());
            }

            updateSegmentStatus(SegmentStatus.AVAILABLE);
        }
    }

    private void updateSegmentStatus(SegmentStatus status) {
        if (this.segmentStatus != status) {
            log.info("Segment status changed from {} to {}", this.segmentStatus, status);
            this.segmentStatus = status;
            if (status == SegmentStatus.AVAILABLE) {
                queryService.invalidateCache();
            }
        }
    }

    public SegmentStatus getSegmentStatus() {
        return segmentStatus;
    }

    private void updateSentimentBuckets(SocialMediaPost post) {
        if (post.getTimestamp() == null || post.getSentiment() == null) return;
        Instant bucket = post.getTimestamp().truncatedTo(ChronoUnit.MINUTES);
        sentimentBuckets.computeIfAbsent(bucket, k -> new ConcurrentHashMap<>())
                .merge(post.getSentiment().getType(), 1L, Long::sum);
    }

    private void updateEntityCounts(SocialMediaPost post) {
        if (post.getEntities() == null) return;
        boolean isPositive = post.getSentiment() != null && post.getSentiment().getType() == SentimentType.POSITIVE;
        boolean isNegative = post.getSentiment() != null && post.getSentiment().getType() == SentimentType.NEGATIVE;

        for (SocialMediaPost.EntityResult entity : post.getEntities()) {
            String key = entity.getName() + "|" + entity.getType();
            entityCounts.merge(key, (long) entity.getCount(), Long::sum);

            long[] sentimentWindow = entitySentimentWindow.computeIfAbsent(key, k -> new long[3]);
            sentimentWindow[0]++;
            if (isPositive) sentimentWindow[1]++;
            if (isNegative) sentimentWindow[2]++;
        }

        if (System.currentTimeMillis() - lastBurstReportTime.get() > BURST_REPORT_INTERVAL_MS) {
            reportEntitySamplesToBurstDetection();
            lastBurstReportTime.set(System.currentTimeMillis());
        }
    }

    private void reportEntitySamplesToBurstDetection() {
        if (entitySentimentWindow.isEmpty()) return;

        for (Map.Entry<String, long[]> entry : entitySentimentWindow.entrySet()) {
            String[] parts = entry.getKey().split("\\|");
            if (parts.length < 2) continue;

            String entityName = parts[0];
            String entityType = parts[1];
            long[] counts = entry.getValue();

            burstDetectionService.recordEntitySample(
                    entityName, entityType, counts[0], counts[1], counts[2]);
        }

        entitySentimentWindow.clear();
    }

    private void updateGeoCounts(SocialMediaPost post) {
        if (post.getLocation() == null || post.getSentiment() == null) return;
        String key = post.getLocation();
        GeoCount geoCount = geoCounts.computeIfAbsent(key, k -> new GeoCount(
                post.getLatitude(), post.getLongitude()
        ));
        geoCount.count++;
        if (post.getSentiment().getType() == SentimentType.POSITIVE) {
            geoCount.positiveCount++;
        } else if (post.getSentiment().getType() == SentimentType.NEGATIVE) {
            geoCount.negativeCount++;
        }
    }

    private void updateSentimentCounts(SocialMediaPost post) {
        if (post.getSentiment() == null) return;
        sentimentCounts.merge(post.getSentiment().getType().name(), 1L, Long::sum);
    }

    public List<SentimentTrendDTO> getSentimentTrends(String timeWindow) {
        int minutes = switch (timeWindow.toLowerCase()) {
            case "1m" -> 1;
            case "5m" -> 5;
            case "1h" -> 60;
            default -> 5;
        };

        Instant now = Instant.now();
        Instant start = now.minus(minutes, ChronoUnit.MINUTES);

        List<SentimentTrendDTO> trends = new ArrayList<>();
        int bucketSizeMinutes = minutes <= 5 ? 1 : (minutes <= 60 ? 5 : 60);

        for (Instant bucket = start.truncatedTo(ChronoUnit.MINUTES);
             bucket.isBefore(now);
             bucket = bucket.plus(bucketSizeMinutes, ChronoUnit.MINUTES)) {

            long positive = 0, negative = 0, neutral = 0;

            for (Instant b = bucket;
                 b.isBefore(bucket.plus(bucketSizeMinutes, ChronoUnit.MINUTES));
                 b = b.plus(1, ChronoUnit.MINUTES)) {
                Map<SentimentType, Long> counts = sentimentBuckets.get(b);
                if (counts != null) {
                    positive += counts.getOrDefault(SentimentType.POSITIVE, 0L);
                    negative += counts.getOrDefault(SentimentType.NEGATIVE, 0L);
                    neutral += counts.getOrDefault(SentimentType.NEUTRAL, 0L);
                }
            }

            long total = positive + negative + neutral;
            if (total > 0) {
                trends.add(SentimentTrendDTO.builder()
                        .timestamp(bucket)
                        .totalCount(total)
                        .positiveCount(positive)
                        .negativeCount(negative)
                        .neutralCount(neutral)
                        .positiveRatio(Math.round(positive * 1000.0 / total) / 10.0)
                        .negativeRatio(Math.round(negative * 1000.0 / total) / 10.0)
                        .neutralRatio(Math.round(neutral * 1000.0 / total) / 10.0)
                        .build());
            }
        }

        if (trends.isEmpty()) {
            log.warn("Empty sentiment trends for window {}, attempting Druid query with retry", timeWindow);
            return querySentimentTrendsFromDruid(start, now);
        }

        return trends;
    }

    private List<SentimentTrendDTO> querySentimentTrendsFromDruid(Instant from, Instant to) {
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("from", from);
            params.put("to", to);
            params.put("granularity", "minute");
            params.put("aggregations", List.of(
                    Map.of("type", "count", "name", "count"),
                    Map.of("type", "filtered", "name", "positive_count",
                            "filter", Map.of("type", "selector", "dimension", "sentiment_type", "value", "POSITIVE"),
                            "aggregator", Map.of("type", "count", "name", "count")),
                    Map.of("type", "filtered", "name", "negative_count",
                            "filter", Map.of("type", "selector", "dimension", "sentiment_type", "value", "NEGATIVE"),
                            "aggregator", Map.of("type", "count", "name", "count"))
            ));

            DruidQueryService.QueryResult result = queryService.queryWithRetry("timeseries", params);

            if (result.isValid()) {
                return result.getRows().stream()
                        .map(row -> {
                            long total = ((Number) row.getOrDefault("count", 0)).longValue();
                            long positive = ((Number) row.getOrDefault("positive_count", 0)).longValue();
                            long negative = ((Number) row.getOrDefault("negative_count", 0)).longValue();
                            long neutral = total - positive - negative;
                            return SentimentTrendDTO.builder()
                                    .timestamp(Instant.parse((String) row.get("timestamp")))
                                    .totalCount(total)
                                    .positiveCount(positive)
                                    .negativeCount(negative)
                                    .neutralCount(neutral)
                                    .positiveRatio(total > 0 ? Math.round(positive * 1000.0 / total) / 10.0 : 0)
                                    .negativeRatio(total > 0 ? Math.round(negative * 1000.0 / total) / 10.0 : 0)
                                    .neutralRatio(total > 0 ? Math.round(neutral * 1000.0 / total) / 10.0 : 0)
                                    .build();
                        })
                        .collect(Collectors.toList());
            }
        } catch (Exception e) {
            log.warn("Failed to query sentiment trends from Druid: {}", e.getMessage());
        }

        return Collections.emptyList();
    }

    public List<EntityCountDTO> getTopEntities(int limit, String type) {
        List<EntityCountDTO> entities = entityCounts.entrySet().stream()
                .filter(entry -> type == null || type.isEmpty() || entry.getKey().endsWith("|" + type))
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(limit)
                .map(entry -> {
                    String[] parts = entry.getKey().split("\\|");
                    return EntityCountDTO.builder()
                            .name(parts[0])
                            .type(parts.length > 1 ? parts[1] : "UNKNOWN")
                            .count(entry.getValue())
                            .build();
                })
                .collect(Collectors.toList());

        if (entities.isEmpty()) {
            log.warn("Empty entity counts, attempting Druid query with retry");
            return queryTopEntitiesFromDruid(limit, type);
        }

        return entities;
    }

    private List<EntityCountDTO> queryTopEntitiesFromDruid(int limit, String type) {
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("from", Instant.now().minus(1, ChronoUnit.HOURS));
            params.put("to", Instant.now());
            params.put("granularity", "all");
            params.put("dimension", "author");
            params.put("threshold", limit);
            params.put("metric", "count");

            DruidQueryService.QueryResult result = queryService.queryWithRetry("topN", params);

            if (result.isValid()) {
                return result.getRows().stream()
                        .filter(row -> row.containsKey("author"))
                        .map(row -> EntityCountDTO.builder()
                                .name((String) row.get("author"))
                                .type(type != null ? type : "UNKNOWN")
                                .count(((Number) row.getOrDefault("count", 0)).longValue())
                                .build())
                        .collect(Collectors.toList());
            }
        } catch (Exception e) {
            log.warn("Failed to query top entities from Druid: {}", e.getMessage());
        }

        return Collections.emptyList();
    }

    public List<GeoDistributionDTO> getGeoDistribution(int limit) {
        List<GeoDistributionDTO> distribution = geoCounts.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue().count, a.getValue().count))
                .limit(limit)
                .map(entry -> GeoDistributionDTO.builder()
                        .location(entry.getKey())
                        .latitude(entry.getValue().latitude)
                        .longitude(entry.getValue().longitude)
                        .count(entry.getValue().count)
                        .positiveCount(entry.getValue().positiveCount)
                        .negativeCount(entry.getValue().negativeCount)
                        .build())
                .collect(Collectors.toList());

        if (distribution.isEmpty()) {
            log.warn("Empty geo distribution, attempting Druid query with retry");
            return queryGeoDistributionFromDruid(limit);
        }

        return distribution;
    }

    private List<GeoDistributionDTO> queryGeoDistributionFromDruid(int limit) {
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("from", Instant.now().minus(1, ChronoUnit.HOURS));
            params.put("to", Instant.now());
            params.put("granularity", "all");
            params.put("dimensions", List.of("location"));
            params.put("limit", limit);
            params.put("orderBy", "count");

            DruidQueryService.QueryResult result = queryService.queryWithRetry("groupBy", params);

            if (result.isValid()) {
                return result.getRows().stream()
                        .map(row -> GeoDistributionDTO.builder()
                                .location((String) row.get("location"))
                                .latitude(0.0)
                                .longitude(0.0)
                                .count(((Number) row.getOrDefault("count", 0)).longValue())
                                .positiveCount(0L)
                                .negativeCount(0L)
                                .build())
                        .collect(Collectors.toList());
            }
        } catch (Exception e) {
            log.warn("Failed to query geo distribution from Druid: {}", e.getMessage());
        }

        return Collections.emptyList();
    }

    public DashboardStatsDTO getDashboardStats(String timeWindow) {
        List<SentimentTrendDTO> trends = getSentimentTrends(timeWindow);

        long totalPositive = trends.stream().mapToLong(SentimentTrendDTO::getPositiveCount).sum();
        long totalNegative = trends.stream().mapToLong(SentimentTrendDTO::getNegativeCount).sum();
        long totalNeutral = trends.stream().mapToLong(SentimentTrendDTO::getNeutralCount).sum();
        long total = totalPositive + totalNegative + totalNeutral;

        return DashboardStatsDTO.builder()
                .totalPosts(total)
                .totalPositive(totalPositive)
                .totalNegative(totalNegative)
                .totalNeutral(totalNeutral)
                .positiveRatio(total > 0 ? Math.round(totalPositive * 1000.0 / total) / 10.0 : 0)
                .negativeRatio(total > 0 ? Math.round(totalNegative * 1000.0 / total) / 10.0 : 0)
                .neutralRatio(total > 0 ? Math.round(totalNeutral * 1000.0 / total) / 10.0 : 0)
                .topEntities(getTopEntities(20, null))
                .recentTrends(trends)
                .topLocations(getGeoDistribution(30))
                .build();
    }

    public Map<String, Object> getRealTimeStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("recentPostsCount", recentPosts.size());
        stats.put("totalPositive", sentimentCounts.getOrDefault("POSITIVE", 0L));
        stats.put("totalNegative", sentimentCounts.getOrDefault("NEGATIVE", 0L));
        stats.put("totalNeutral", sentimentCounts.getOrDefault("NEUTRAL", 0L));
        stats.put("totalEntities", entityCounts.size());
        stats.put("totalLocations", geoCounts.size());
        stats.put("timestamp", Instant.now().toString());
        stats.put("segmentStatus", segmentStatus.name());
        stats.put("druidAvailable", queryService.checkDruidAvailability());
        stats.put("bufferSize", ingestionBuffer.size());
        return stats;
    }

    public int getBufferSize() {
        return ingestionBuffer.size();
    }

    public void forceFlush() {
        flushToDruid();
    }

    private static class GeoCount {
        double latitude;
        double longitude;
        long count;
        long positiveCount;
        long negativeCount;

        GeoCount(double latitude, double longitude) {
            this.latitude = latitude;
            this.longitude = longitude;
        }
    }
}
