package com.distributed.idgenerator.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.List;

@Data
@Configuration
@ConfigurationProperties(prefix = "ntp")
public class NtpProperties {

    private List<String> servers = new ArrayList<>();
    private int port = 123;
    private int timeoutMs = 3000;
    private int maxOffsetMs = 5;
    private int checkIntervalMs = 60000;
    private int maxFailures = 3;
}
