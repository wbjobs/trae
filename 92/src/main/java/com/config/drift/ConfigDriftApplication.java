package com.config.drift;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class ConfigDriftApplication {

    public static void main(String[] args) {
        SpringApplication.run(ConfigDriftApplication.class, args);
    }
}
