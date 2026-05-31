package com.distributed.idgenerator.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "id-generator")
public class IdGeneratorProperties {

    private int workerIdBits = 10;
    private int sequenceBits = 12;
    private long maxClockBackwardMs = 5000;
    private long selfHealingCheckIntervalMs = 10;
}
