package com.anomaly.websocket.model;

import lombok.Data;
import java.util.Map;

@Data
public class StatisticsData {
    private String type = "statistics";
    private int activeConnections;
    private long totalMessages;
    private long totalAnomalies;
    private Map<String, Long> anomaliesByMetric;
    private Map<String, Long> anomaliesByAlgorithm;
    private long timestamp;
}
