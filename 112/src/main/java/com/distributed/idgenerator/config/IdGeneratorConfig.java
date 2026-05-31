package com.distributed.idgenerator.config;

import com.distributed.idgenerator.core.SelfHealingManager;
import com.distributed.idgenerator.core.SnowflakeIdGenerator;
import com.distributed.idgenerator.ntp.NtpTimeManager;
import com.distributed.idgenerator.zk.ZkManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class IdGeneratorConfig {

    @Bean
    public ZkManager zkManager(ZookeeperProperties properties) {
        return new ZkManager(properties);
    }

    @Bean
    public NtpTimeManager ntpTimeManager(NtpProperties properties) {
        return new NtpTimeManager(properties);
    }

    @Bean
    public SnowflakeIdGenerator snowflakeIdGenerator(IdGeneratorProperties properties,
                                                      ZkManager zkManager,
                                                      NtpTimeManager ntpTimeManager) {
        return new SnowflakeIdGenerator(properties, zkManager, ntpTimeManager);
    }

    @Bean
    public SelfHealingManager selfHealingManager(SnowflakeIdGenerator idGenerator,
                                                  ZkManager zkManager,
                                                  IdGeneratorProperties properties) {
        return new SelfHealingManager(idGenerator, zkManager, properties);
    }
}
