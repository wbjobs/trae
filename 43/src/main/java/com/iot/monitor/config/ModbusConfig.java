package com.iot.monitor.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "modbus")
public class ModbusConfig {

    private int timeout = 5000;

    private int reconnectInterval = 30000;
}
