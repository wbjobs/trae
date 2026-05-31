package com.sentiment;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SentimentMonitorApplication {

    public static void main(String[] args) {
        SpringApplication.run(SentimentMonitorApplication.class, args);
    }
}
