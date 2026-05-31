package com.iot.monitor.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Data
@Configuration
@EnableAsync
@ConfigurationProperties(prefix = "collect")
public class CollectConfig {

    private int threadPoolSize = 10;

    @Bean(name = "collectTaskExecutor")
    public Executor collectTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(threadPoolSize);
        executor.setMaxPoolSize(threadPoolSize * 2);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("collect-");
        executor.initialize();
        return executor;
    }
}
