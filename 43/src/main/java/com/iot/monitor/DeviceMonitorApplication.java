package com.iot.monitor;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableAsync
@MapperScan("com.iot.monitor.mapper")
public class DeviceMonitorApplication {

    public static void main(String[] args) {
        SpringApplication.run(DeviceMonitorApplication.class, args);
    }
}
