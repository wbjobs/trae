package com.distributed.idgenerator.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "zookeeper")
public class ZookeeperProperties {

    private String connectString = "127.0.0.1:2181";
    private String namespace = "id-generator";
    private int connectionTimeout = 15000;
    private int sessionTimeout = 60000;
    private int maxRetries = 3;
    private int retryInterval = 1000;
}
