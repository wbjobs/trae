package com.z3950.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableAsync
@EnableScheduling
public class Z3950GatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(Z3950GatewayApplication.class, args);
    }
}
