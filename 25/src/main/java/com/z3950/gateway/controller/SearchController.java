package com.z3950.gateway.controller;

import com.z3950.gateway.model.Book;
import com.z3950.gateway.model.QueryLog;
import com.z3950.gateway.model.SearchResponse;
import com.z3950.gateway.service.CachePrefetchService;
import com.z3950.gateway.service.QueryLogService;
import com.z3950.gateway.service.ResultMergeService;
import com.z3950.gateway.service.SearchCacheService;
import com.z3950.gateway.service.Z3950SearchService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api")
public class SearchController {
    private final Z3950SearchService searchService;
    private final ResultMergeService mergeService;
    private final SearchCacheService cacheService;
    private final QueryLogService queryLogService;
    private final CachePrefetchService prefetchService;

    @Autowired
    public SearchController(Z3950SearchService searchService,
                           ResultMergeService mergeService,
                           SearchCacheService cacheService,
                           QueryLogService queryLogService,
                           CachePrefetchService prefetchService) {
        this.searchService = searchService;
        this.mergeService = mergeService;
        this.cacheService = cacheService;
        this.queryLogService = queryLogService;
        this.prefetchService = prefetchService;
    }

    @GetMapping("/search")
    public ResponseEntity<SearchResponse> search(
            @RequestParam String query,
            @RequestParam(defaultValue = "10") int maxPerServer,
            @RequestParam(defaultValue = "true") boolean useCache,
            HttpServletRequest request) {

        long startTime = System.currentTimeMillis();
        log.info("Received search request for query: {}, useCache: {}", query, useCache);

        if (query == null || query.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(
                SearchResponse.builder()
                    .query(query)
                    .totalResults(0)
                    .uniqueResults(0)
                    .results(new ArrayList<>())
                    .build()
            );
        }

        String normalizedQuery = query.trim();

        if (useCache) {
            SearchResponse cachedResponse = cacheService.getFromCache(normalizedQuery);
            if (cachedResponse != null) {
                long responseTime = System.currentTimeMillis() - startTime;
                cachedResponse.setResponseTimeMs(responseTime);
                log.info("Cache hit for query: '{}', returned in {}ms", normalizedQuery, responseTime);
                logQuery(normalizedQuery, cachedResponse.getUniqueResults(), responseTime, request);
                return ResponseEntity.ok(cachedResponse);
            }
        }

        List<String> queriedServers = searchService.getConfiguredServerNames();
        List<Book> allBooks = new ArrayList<>();
        List<String> successfulServers = new ArrayList<>();
        List<String> failedServers = new ArrayList<>();

        try {
            allBooks = searchService.searchAllServers(normalizedQuery, maxPerServer);

            for (String server : queriedServers) {
                boolean hasResults = allBooks.stream()
                    .anyMatch(b -> b.getSourceServers() != null && b.getSourceServers().contains(server));
                if (hasResults) {
                    successfulServers.add(server);
                }
            }

            failedServers = new ArrayList<>(queriedServers);
            failedServers.removeAll(successfulServers);

        } catch (Exception e) {
            log.error("Search failed", e);
            failedServers = new ArrayList<>(queriedServers);
        }

        List<Book> uniqueBooks = mergeService.mergeAndDeduplicate(allBooks);
        long responseTime = System.currentTimeMillis() - startTime;

        SearchResponse response = SearchResponse.builder()
            .query(query)
            .totalResults(allBooks.size())
            .uniqueResults(uniqueBooks.size())
            .queriedServers(queriedServers)
            .successfulServers(successfulServers)
            .failedServers(failedServers)
            .responseTimeMs(responseTime)
            .results(uniqueBooks)
            .build();

        if (useCache && uniqueBooks.size() > 0) {
            cacheService.putInCache(normalizedQuery, response);
        }

        logQuery(normalizedQuery, uniqueBooks.size(), responseTime, request);

        log.info("Search completed: {} total results, {} unique results in {}ms",
            allBooks.size(), uniqueBooks.size(), responseTime);

        return ResponseEntity.ok(response);
    }

    private void logQuery(String query, int resultCount, long responseTimeMs, HttpServletRequest request) {
        try {
            String clientIp = request.getRemoteAddr();
            if (request.getHeader("X-Forwarded-For") != null) {
                clientIp = request.getHeader("X-Forwarded-For").split(",")[0].trim();
            }

            QueryLog queryLog = QueryLog.builder()
                .query(query)
                .queryTime(LocalDateTime.now())
                .resultCount(resultCount)
                .responseTimeMs(responseTimeMs)
                .clientIp(clientIp)
                .build();

            queryLogService.logQuery(queryLog);
        } catch (Exception e) {
            log.warn("Failed to log query: {}", e.getMessage());
        }
    }

    @GetMapping("/cache/stats")
    public ResponseEntity<Map<String, Object>> getCacheStats() {
        SearchCacheService.CacheStats stats = cacheService.getStats();
        Map<String, Object> result = new HashMap<>();
        result.put("hitCount", stats.hitCount());
        result.put("missCount", stats.missCount());
        result.put("hitRate", String.format("%.2f%%", stats.hitRate() * 100));
        result.put("cacheSize", stats.estimatedSize());
        return ResponseEntity.ok(result);
    }

    @PostMapping("/cache/clear")
    public ResponseEntity<String> clearCache() {
        cacheService.clearAllCaches();
        return ResponseEntity.ok("Cache cleared successfully");
    }

    @PostMapping("/cache/evict")
    public ResponseEntity<String> evictCache(@RequestParam String query) {
        cacheService.evictFromCache(query);
        return ResponseEntity.ok("Cache evicted for query: " + query);
    }

    @PostMapping("/cache/prefetch")
    public ResponseEntity<String> triggerPrefetch() {
        prefetchService.triggerPrefetchNow();
        return ResponseEntity.ok("Cache prefetch triggered");
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("OK");
    }
}
