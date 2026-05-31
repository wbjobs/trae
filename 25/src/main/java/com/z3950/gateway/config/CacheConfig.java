package com.z3950.gateway.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "cache")
public class CacheConfig {
    private Redis redis = new Redis();
    private Prefetch prefetch = new Prefetch();
    private Local local = new Local();

    @Data
    public static class Redis {
        private boolean enabled = true;
        private int ttlSeconds = 3600;
        private String keyPrefix = "z3950:search:";
    }

    @Data
    public static class Prefetch {
        private boolean enabled = true;
        private String cron = "0 0 2 * * ?";
        private int topNQueries = 50;
        private int minQueryFrequency = 3;
        private int analysisDays = 7;
    }

    @Data
    public static class Local {
        private int maximumSize = 1000;
        private int expireAfterWriteMinutes = 60;
    }
}
