package com.power.sampling.sampling;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@EnableDiscoveryClient
@EnableFeignClients(basePackages = "com.power.sampling.common.feign")
@MapperScan("com.power.sampling.sampling.mapper")
@SpringBootApplication(scanBasePackages = {"com.power.sampling.sampling", "com.power.sampling.common.config"})
public class SamplingServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(SamplingServiceApplication.class, args);
    }
}
