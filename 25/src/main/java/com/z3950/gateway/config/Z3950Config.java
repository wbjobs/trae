package com.z3950.gateway.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Data
@Configuration
@ConfigurationProperties(prefix = "z3950")
public class Z3950Config {
    private int timeoutSeconds = 3;
    private PoolConfig pool = new PoolConfig();
    private List<ServerConfig> servers;

    @Data
    public static class PoolConfig {
        private int maxIdle = 5;
        private int maxActive = 10;
        private long maxWait = 5000;
    }

    @Data
    public static class ServerConfig {
        private String name;
        private String host;
        private int port;
        private String database;
        private String preferredRecordSyntax = "USMARC";
        private String username;
        private String password;
    }
}
