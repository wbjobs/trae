package com.z3950.gateway.service;

import com.z3950.gateway.model.QueryLog;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
public class QueryLogService {
    private static final String LOG_KEY_PREFIX = "z3950:querylog:";
    private static final String STATS_KEY_PREFIX = "z3950:stats:";
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final RedisTemplate<String, Object> redisTemplate;

    @Autowired
    public QueryLogService(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void logQuery(QueryLog queryLog) {
        try {
            String dateKey = LocalDate.now().format(DATE_FORMATTER);
            String logKey = LOG_KEY_PREFIX + dateKey;

            String normalizedQuery = normalizeQuery(queryLog.getQuery());
            queryLog.setNormalizedQuery(normalizedQuery);

            redisTemplate.opsForList().rightPush(logKey, queryLog);
            redisTemplate.expire(logKey, 14, TimeUnit.DAYS);

            String statsKey = STATS_KEY_PREFIX + dateKey;
            redisTemplate.opsForHash().increment(statsKey, normalizedQuery, 1);
            redisTemplate.expire(statsKey, 14, TimeUnit.DAYS);
        } catch (Exception e) {
            log.warn("Failed to log query: {}", e.getMessage());
        }
    }

    public Map<String, Integer> getQueryFrequency(int days) {
        Map<String, Integer> frequencyMap = new HashMap<>();
        LocalDate today = LocalDate.now();

        for (int i = 0; i < days; i++) {
            String dateKey = today.minusDays(i).format(DATE_FORMATTER);
            String statsKey = STATS_KEY_PREFIX + dateKey;

            try {
                Map<Object, Object> entries = redisTemplate.opsForHash().entries(statsKey);
                for (Map.Entry<Object, Object> entry : entries.entrySet()) {
                    String query = (String) entry.getKey();
                    Integer count = ((Number) entry.getValue()).intValue();
                    frequencyMap.merge(query, count, Integer::sum);
                }
            } catch (Exception e) {
                log.debug("No stats for date: {}", dateKey);
            }
        }

        return frequencyMap;
    }

    public List<QueryLog> getRecentQueries(int days) {
        List<QueryLog> logs = new ArrayList<>();
        LocalDate today = LocalDate.now();

        for (int i = 0; i < days; i++) {
            String dateKey = today.minusDays(i).format(DATE_FORMATTER);
            String logKey = LOG_KEY_PREFIX + dateKey;

            try {
                List<Object> entries = redisTemplate.opsForList().range(logKey, 0, -1);
                if (entries != null) {
                    for (Object entry : entries) {
                        if (entry instanceof QueryLog) {
                            logs.add((QueryLog) entry);
                        }
                    }
                }
            } catch (Exception e) {
                log.debug("No logs for date: {}", dateKey);
            }
        }

        return logs;
    }

    public String normalizeQuery(String query) {
        if (query == null) return "";
        return query.trim().toLowerCase()
            .replaceAll("\\s+", " ")
            .replaceAll("[^\\p{L}\\p{N}\\s]", "")
            .trim();
    }
}
