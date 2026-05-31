package com.config.drift.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.Map;

@Data
@Configuration
@ConfigurationProperties(prefix = "config-drift")
public class GitConfigProperties {

    private Map<String, ServiceConfig> services;

    private String baselineBranch = "main";

    private String localRepoDir = "./config-repos";

    @Data
    public static class ServiceConfig {
        private String gitUrl;
        private String branch = "main";
        private String configPath = "config/application.yml";
        private String username;
        private String password;
    }
}
