package com.z3950.gateway.service;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import com.z3950.gateway.config.CacheConfig;
import com.z3950.gateway.model.SearchResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class SearchCacheService {
    private final RedisTemplate<String, Object> redisTemplate;
    private final CacheConfig cacheConfig;
    private final Cache<String, SearchResponse> localCache;

    @Autowired
    public SearchCacheService(RedisTemplate<String, Object> redisTemplate, CacheConfig cacheConfig) {
        this.redisTemplate = redisTemplate;
        this.cacheConfig = cacheConfig;
        this.localCache = Caffeine.newBuilder()
            .maximumSize(cacheConfig.getLocal().getMaximumSize())
            .expireAfterWrite(cacheConfig.getLocal().getExpireAfterWriteMinutes(), TimeUnit.MINUTES)
            .recordStats()
            .build();
    }

    public SearchResponse getFromCache(String query) {
        String normalizedQuery = normalizeKey(query);

        SearchResponse localResult = localCache.getIfPresent(normalizedQuery);
        if (localResult != null) {
            log.debug("Cache hit (local) for query: {}", query);
            return localResult;
        }

        if (cacheConfig.getRedis().isEnabled()) {
            try {
                String redisKey = cacheConfig.getRedis().getKeyPrefix() + normalizedQuery;
                Object redisResult = redisTemplate.opsForValue().get(redisKey);
                if (redisResult instanceof SearchResponse) {
                    log.debug("Cache hit (redis) for query: {}", query);
                    localCache.put(normalizedQuery, (SearchResponse) redisResult);
                    return (SearchResponse) redisResult;
                }
            } catch (Exception e) {
                log.warn("Failed to get from Redis cache: {}", e.getMessage());
            }
        }

        log.debug("Cache miss for query: {}", query);
        return null;
    }

    public void putInCache(String query, SearchResponse response) {
        String normalizedQuery = normalizeKey(query);

        localCache.put(normalizedQuery, response);

        if (cacheConfig.getRedis().isEnabled()) {
            try {
                String redisKey = cacheConfig.getRedis().getKeyPrefix() + normalizedQuery;
                redisTemplate.opsForValue().set(
                    redisKey,
                    response,
                    cacheConfig.getRedis().getTtlSeconds(),
                    TimeUnit.SECONDS
                );
                log.debug("Cached result for query: {} (TTL: {}s)",
                    query, cacheConfig.getRedis().getTtlSeconds());
            } catch (Exception e) {
                log.warn("Failed to put in Redis cache: {}", e.getMessage());
            }
        }
    }

    public void warmUpLocalCache(String query, SearchResponse response) {
        String normalizedQuery = normalizeKey(query);
        localCache.put(normalizedQuery, response);
        log.debug("Warmed up local cache for query: {}", query);
    }

    public boolean isInLocalCache(String query) {
        return localCache.getIfPresent(normalizeKey(query)) != null;
    }

    public void evictFromCache(String query) {
        String normalizedQuery = normalizeKey(query);
        localCache.invalidate(normalizedQuery);

        if (cacheConfig.getRedis().isEnabled()) {
            try {
                String redisKey = cacheConfig.getRedis().getKeyPrefix() + normalizedQuery;
                redisTemplate.delete(redisKey);
            } catch (Exception e) {
                log.warn("Failed to evict from Redis cache: {}", e.getMessage());
            }
        }

        log.debug("Evicted cache for query: {}", query);
    }

    public void clearAllCaches() {
        localCache.invalidateAll();
        log.info("Cleared all local caches");

        if (cacheConfig.getRedis().isEnabled()) {
            try {
                String pattern = cacheConfig.getRedis().getKeyPrefix() + "*";
                var keys = redisTemplate.keys(pattern);
                if (keys != null && !keys.isEmpty()) {
                    redisTemplate.delete(keys);
                    log.info("Cleared {} Redis cache keys", keys.size());
                }
            } catch (Exception e) {
                log.warn("Failed to clear Redis cache: {}", e.getMessage());
            }
        }
    }

    public CacheStats getStats() {
        var stats = localCache.stats();
        return new CacheStats(
            stats.hitCount(),
            stats.missCount(),
            stats.hitRate(),
            localCache.size()
        );
    }

    private String normalizeKey(String query) {
        if (query == null) return "";
        return query.trim().toLowerCase().replaceAll("\\s+", " ");
    }

    public record CacheStats(
        long hitCount,
        long missCount,
        double hitRate,
        long estimatedSize
    ) {}
}
