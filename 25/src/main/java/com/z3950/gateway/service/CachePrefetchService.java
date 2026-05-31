package com.z3950.gateway.service;

import com.z3950.gateway.config.CacheConfig;
import com.z3950.gateway.model.SearchResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
public class CachePrefetchService {
    private final TfIdfAnalysisService tfIdfAnalysisService;
    private final SearchCacheService searchCacheService;
    private final Z3950SearchService searchService;
    private final CacheConfig cacheConfig;
    private final ExecutorService prefetchExecutor;

    @Autowired
    public CachePrefetchService(TfIdfAnalysisService tfIdfAnalysisService,
                                SearchCacheService searchCacheService,
                                Z3950SearchService searchService,
                                CacheConfig cacheConfig) {
        this.tfIdfAnalysisService = tfIdfAnalysisService;
        this.searchCacheService = searchCacheService;
        this.searchService = searchService;
        this.cacheConfig = cacheConfig;
        this.prefetchExecutor = Executors.newFixedThreadPool(5);
    }

    @Scheduled(cron = "${cache.prefetch.cron:0 0 2 * * ?}")
    public void prefetchCache() {
        if (!cacheConfig.getPrefetch().isEnabled()) {
            log.info("Cache prefetch is disabled");
            return;
        }

        log.info("Starting cache prefetch task...");
        long startTime = System.currentTimeMillis();

        try {
            List<String> keywords = tfIdfAnalysisService.getPrefetchKeywords();
            if (keywords.isEmpty()) {
                log.info("No keywords to prefetch");
                return;
            }

            log.info("Found {} keywords to prefetch", keywords.size());

            AtomicInteger successCount = new AtomicInteger(0);
            AtomicInteger skipCount = new AtomicInteger(0);

            for (String keyword : keywords) {
                prefetchExecutor.submit(() -> {
                    try {
                        if (searchCacheService.isInLocalCache(keyword)) {
                            skipCount.incrementAndGet();
                            log.debug("Skipping prefetch for '{}' - already in cache", keyword);
                            return;
                        }

                        var books = searchService.searchAllServers(keyword, 10);
                        SearchResponse response = SearchResponse.builder()
                            .query(keyword)
                            .totalResults(books.size())
                            .uniqueResults(books.size())
                            .results(books)
                            .build();

                        searchCacheService.warmUpLocalCache(keyword, response);
                        successCount.incrementAndGet();
                        log.debug("Prefetched cache for '{}', {} results", keyword, books.size());

                    } catch (Exception e) {
                        log.warn("Failed to prefetch cache for '{}': {}", keyword, e.getMessage());
                    }
                });
            }

            prefetchExecutor.shutdown();
            try {
                if (!prefetchExecutor.awaitTermination(30, TimeUnit.MINUTES)) {
                    prefetchExecutor.shutdownNow();
                }
            } catch (InterruptedException e) {
                prefetchExecutor.shutdownNow();
                Thread.currentThread().interrupt();
            }

            long duration = System.currentTimeMillis() - startTime;
            log.info("Cache prefetch completed in {}ms - success: {}, skipped: {}",
                duration, successCount.get(), skipCount.get());

        } catch (Exception e) {
            log.error("Cache prefetch task failed", e);
        }
    }

    public void triggerPrefetchNow() {
        log.info("Manual cache prefetch triggered");
        new Thread(this::prefetchCache).start();
    }
}
