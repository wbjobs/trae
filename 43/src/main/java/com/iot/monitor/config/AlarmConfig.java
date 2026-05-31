package com.iot.monitor.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "alarm")
public class AlarmConfig {

    private long offlineThreshold = 60000;

    private long notifyInterval = 300000;
}
