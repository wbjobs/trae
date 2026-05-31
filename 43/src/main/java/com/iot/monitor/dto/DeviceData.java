package com.iot.monitor.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;

@Data
public class DeviceData {

    private Long deviceId;

    private String deviceCode;

    private Map<String, Double> values;

    private LocalDateTime collectTime;

    private boolean success;

    private String errorMsg;
}
