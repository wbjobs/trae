package com.sentiment.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import lombok.extern.slf4j.Slf4j;
import okhttp3.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Service
public class DruidQueryService {

    @Value("${app.druid.broker-url}")
    private String druidBrokerUrl;

    @Value("${app.druid.datasource}")
    private String datasource;

    @Value("${app.druid.query.retry.max-attempts:3}")
    private int maxRetryAttempts;

    @Value("${app.druid.query.retry.delay-ms:100}")
    private long retryDelayMs;

    @Value("${app.druid.query.cache.ttl-seconds:30}")
    private long cacheTtlSeconds;

    @Value("${app.druid.query.timeout-seconds:30}")
    private int queryTimeoutSeconds;

    private OkHttpClient httpClient;
    private ObjectMapper objectMapper;

    private Cache<String, QueryResult> queryCache;
    private final Map<String, AtomicLong> segmentAvailabilityCache = new ConcurrentHashMap<>();
    private final AtomicLong segmentCheckCounter = new AtomicLong(0);
    private volatile boolean druidAvailable = false;

    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");
    private static final long SEGMENT_CHECK_INTERVAL_MS = 5000;

    @PostConstruct
    public void init() {
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());

        this.httpClient = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(queryTimeoutSeconds, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .build();

        this.queryCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(cacheTtlSeconds))
                .maximumSize(1000)
                .recordStats()
                .build();

        log.info("DruidQueryService initialized with cache TTL {}s, max retries {}",
                cacheTtlSeconds, maxRetryAttempts);

        checkDruidAvailability();
    }

    public QueryResult queryWithRetry(String queryType, Map<String, Object> queryParams) {
        String cacheKey = generateCacheKey(queryType, queryParams);

        QueryResult cached = queryCache.getIfPresent(cacheKey);
        if (cached != null && cached.isValid()) {
            log.debug("Cache hit for query: {}", cacheKey);
            return cached;
        }

        Exception lastException = null;
        for (int attempt = 1; attempt <= maxRetryAttempts; attempt++) {
            try {
                if (!druidAvailable && attempt == 1) {
                    checkDruidAvailability();
                }

                QueryResult result = executeQuery(queryType, queryParams);

                if (result.isEmpty() && attempt < maxRetryAttempts) {
                    log.warn("Empty result for query {} on attempt {}, retrying...",
                            queryType, attempt);
                    waitForRetry(attempt);
                    continue;
                }

                if (result.isValid()) {
                    queryCache.put(cacheKey, result);
                }

                return result;

            } catch (Exception e) {
                lastException = e;
                log.warn("Query failed on attempt {}: {}", attempt, e.getMessage());

                if (attempt < maxRetryAttempts) {
                    waitForRetry(attempt);
                }
            }
        }

        log.error("Query failed after {} attempts, returning empty result", maxRetryAttempts);
        if (lastException != null) {
            return QueryResult.emptyWithError(lastException.getMessage());
        }
        return QueryResult.empty();
    }

    private QueryResult executeQuery(String queryType, Map<String, Object> queryParams) throws Exception {
        Map<String, Object> query = buildQuery(queryType, queryParams);
        String jsonQuery = objectMapper.writeValueAsString(query);

        RequestBody body = RequestBody.create(jsonQuery, JSON);
        Request request = new Request.Builder()
                .url(druidBrokerUrl + "/druid/v2")
                .post(body)
                .addHeader("Content-Type", "application/json")
                .build();

        long startTime = System.currentTimeMillis();

        try (Response response = httpClient.newCall(request).execute()) {
            long elapsed = System.currentTimeMillis() - startTime;

            if (!response.isSuccessful()) {
                String errorBody = response.body() != null ? response.body().string() : "No response body";
                log.warn("Druid query failed with status {}: {}", response.code(), errorBody);

                if (response.code() == 500 && errorBody.contains("segment") && errorBody.contains("not available")) {
                    invalidateSegmentCache();
                    throw new RuntimeException("Segment not available, will retry");
                }

                throw new RuntimeException("Query failed: " + response.code());
            }

            String responseBody = response.body() != null ? response.body().string() : "";
            JsonNode root = objectMapper.readTree(responseBody);

            QueryResult result = parseResult(queryType, root);
            result.setQueryTimeMs(elapsed);

            log.debug("Druid query {} completed in {}ms, result size: {}",
                    queryType, elapsed, result.size());

            return result;

        } catch (java.net.SocketTimeoutException e) {
            log.warn("Query timed out after {}ms", queryTimeoutSeconds * 1000);
            throw new RuntimeException("Query timeout", e);
        }
    }

    private Map<String, Object> buildQuery(String queryType, Map<String, Object> params) {
        Instant from = (Instant) params.getOrDefault("from", Instant.now().minus(1, java.time.temporal.ChronoUnit.HOURS));
        Instant to = (Instant) params.getOrDefault("to", Instant.now());
        String granularity = (String) params.getOrDefault("granularity", "minute");
        List<Map<String, Object>> aggregations = (List<Map<String, Object>>) params.get("aggregations");
        List<Map<String, Object>> filters = (List<Map<String, Object>>) params.get("filters");
        List<Map<String, Object>> postAggregations = (List<Map<String, Object>>) params.get("postAggregations");

        Map<String, Object> query = new LinkedHashMap<>();
        query.put("queryType", queryType);
        query.put("dataSource", datasource);
        query.put("intervals", List.of(from.toString() + "/" + to.toString()));
        query.put("granularity", granularity);

        if (aggregations != null && !aggregations.isEmpty()) {
            query.put("aggregations", aggregations);
        }

        if (filters != null && !filters.isEmpty()) {
            if (filters.size() == 1) {
                query.put("filter", filters.get(0));
            } else {
                query.put("filter", Map.of(
                        "type", "and",
                        "fields", filters
                ));
            }
        }

        if (postAggregations != null && !postAggregations.isEmpty()) {
            query.put("postAggregations", postAggregations);
        }

        if ("topN".equals(queryType)) {
            query.put("dimension", params.get("dimension"));
            query.put("threshold", params.getOrDefault("threshold", 10));
            query.put("metric", params.getOrDefault("metric", "count"));
        }

        if ("groupBy".equals(queryType)) {
            query.put("dimensions", params.get("dimensions"));
            query.put("limitSpec", Map.of(
                    "type", "default",
                    "limit", params.getOrDefault("limit", 100),
                    "columns", List.of(Map.of(
                            "dimension", params.getOrDefault("orderBy", "count"),
                            "direction", "descending"
                    ))
            ));
        }

        Map<String, Object> context = new HashMap<>();
        context.put("timeout", queryTimeoutSeconds * 1000);
        context.put("priority", 100);
        query.put("context", context);

        return query;
    }

    private QueryResult parseResult(String queryType, JsonNode root) {
        QueryResult result = new QueryResult();
        result.setTimestamp(Instant.now());

        if (root.isArray()) {
            List<Map<String, Object>> rows = new ArrayList<>();
            for (JsonNode node : root) {
                Map<String, Object> row = objectMapper.convertValue(node, Map.class);
                rows.add(row);
            }
            result.setRows(rows);
        } else if (root.isObject()) {
            Map<String, Object> row = objectMapper.convertValue(root, Map.class);
            result.setRows(List.of(row));
        }

        return result;
    }

    private void waitForRetry(int attempt) {
        try {
            long delay = retryDelayMs * (long) Math.pow(2, attempt - 1);
            log.debug("Waiting {}ms before retry", delay);
            Thread.sleep(Math.min(delay, 2000));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private String generateCacheKey(String queryType, Map<String, Object> params) {
        StringBuilder key = new StringBuilder(queryType);
        key.append(":").append(params.getOrDefault("from", ""));
        key.append(":").append(params.getOrDefault("to", ""));
        key.append(":").append(params.getOrDefault("granularity", "minute"));
        if (params.containsKey("dimension")) {
            key.append(":").append(params.get("dimension"));
        }
        if (params.containsKey("dimensions")) {
            key.append(":").append(params.get("dimensions"));
        }
        return key.toString();
    }

    public boolean checkDruidAvailability() {
        long now = System.currentTimeMillis();
        long lastCheck = segmentAvailabilityCache.getOrDefault("last_check", 0L);

        if (now - lastCheck < SEGMENT_CHECK_INTERVAL_MS && druidAvailable) {
            return druidAvailable;
        }

        try {
            Request request = new Request.Builder()
                    .url(druidBrokerUrl + "/status")
                    .get()
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                druidAvailable = response.isSuccessful();
                if (druidAvailable) {
                    segmentAvailabilityCache.put("last_check", now);
                    log.info("Druid is available");
                }
            }
        } catch (Exception e) {
            log.warn("Druid availability check failed: {}", e.getMessage());
            druidAvailable = false;
        }

        return druidAvailable;
    }

    public List<String> getAvailableSegments() {
        try {
            Request request = new Request.Builder()
                    .url(druidBrokerUrl + "/druid/coordinator/v1/metadata/segments?full")
                    .get()
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                if (response.isSuccessful() && response.body() != null) {
                    JsonNode root = objectMapper.readTree(response.body().string());
                    List<String> segments = new ArrayList<>();
                    if (root.isArray()) {
                        for (JsonNode node : root) {
                            if (node.has("loadStatus") && "loaded".equals(node.get("loadStatus").asText())) {
                                segments.add(node.get("segmentId").asText());
                            }
                        }
                    }
                    return segments;
                }
            }
        } catch (Exception e) {
            log.warn("Failed to get segment list: {}", e.getMessage());
        }
        return Collections.emptyList();
    }

    private void invalidateSegmentCache() {
        segmentAvailabilityCache.clear();
        queryCache.invalidateAll();
        log.info("Cleared all caches due to segment availability change");
    }

    public void invalidateCache() {
        queryCache.invalidateAll();
        segmentAvailabilityCache.clear();
        log.info("Cache invalidated manually");
    }

    public DruidStatus getStatus() {
        DruidStatus status = new DruidStatus();
        status.setAvailable(druidAvailable);
        status.setCacheSize(queryCache.estimatedSize());
        status.setCacheStats(queryCache.stats().toString());
        status.setLastCheckTime(Instant.ofEpochMilli(
                segmentAvailabilityCache.getOrDefault("last_check", 0L)
        ));
        return status;
    }

    public static class QueryResult {
        private List<Map<String, Object>> rows = new ArrayList<>();
        private Instant timestamp;
        private long queryTimeMs;
        private String error;
        private boolean valid = true;

        public static QueryResult empty() {
            QueryResult result = new QueryResult();
            result.setValid(false);
            return result;
        }

        public static QueryResult emptyWithError(String error) {
            QueryResult result = new QueryResult();
            result.setValid(false);
            result.setError(error);
            return result;
        }

        public boolean isEmpty() {
            return rows == null || rows.isEmpty();
        }

        public int size() {
            return rows != null ? rows.size() : 0;
        }

        public boolean isValid() {
            return valid && !isEmpty();
        }

        public List<Map<String, Object>> getRows() { return rows; }
        public void setRows(List<Map<String, Object>> rows) { this.rows = rows; }
        public Instant getTimestamp() { return timestamp; }
        public void setTimestamp(Instant timestamp) { this.timestamp = timestamp; }
        public long getQueryTimeMs() { return queryTimeMs; }
        public void setQueryTimeMs(long queryTimeMs) { this.queryTimeMs = queryTimeMs; }
        public String getError() { return error; }
        public void setError(String error) { this.error = error; }
        public void setValid(boolean valid) { this.valid = valid; }
    }

    public static class DruidStatus {
        private boolean available;
        private long cacheSize;
        private String cacheStats;
        private Instant lastCheckTime;

        public boolean isAvailable() { return available; }
        public void setAvailable(boolean available) { this.available = available; }
        public long getCacheSize() { return cacheSize; }
        public void setCacheSize(long cacheSize) { this.cacheSize = cacheSize; }
        public String getCacheStats() { return cacheStats; }
        public void setCacheStats(String cacheStats) { this.cacheStats = cacheStats; }
        public Instant getLastCheckTime() { return lastCheckTime; }
        public void setLastCheckTime(Instant lastCheckTime) { this.lastCheckTime = lastCheckTime; }
    }
}
