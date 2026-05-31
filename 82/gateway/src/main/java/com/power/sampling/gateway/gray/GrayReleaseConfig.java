package com.power.sampling.gateway.gray;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Data
@Component
@RefreshScope
@ConfigurationProperties(prefix = "gray.release")
public class GrayReleaseConfig {

    private boolean enabled = true;

    private List<ServiceGrayConfig> services = new ArrayList<>();

    @Data
    public static class ServiceGrayConfig {
        private String serviceName;
        private boolean enabled = false;
        private Integer grayType = 1;
        private Integer weightPercent = 10;
        private List<String> grayUsers = new ArrayList<>();
        private List<String> grayIps = new ArrayList<>();
        private String targetVersion;
    }
}
