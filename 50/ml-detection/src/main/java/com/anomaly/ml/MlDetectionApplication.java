package com.anomaly.ml;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class MlDetectionApplication {
    public static void main(String[] args) {
        SpringApplication.run(MlDetectionApplication.class, args);
    }
}
