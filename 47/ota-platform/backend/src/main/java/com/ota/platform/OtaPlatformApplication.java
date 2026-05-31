package com.ota.platform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class OtaPlatformApplication {

    public static void main(String[] args) {
        SpringApplication.run(OtaPlatformApplication.class, args);
    }
}
