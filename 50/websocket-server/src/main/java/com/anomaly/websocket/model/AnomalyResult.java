package com.anomaly.websocket.model;

import lombok.Data;
import java.util.Map;

@Data
public class AnomalyResult {
    private String metricId;
    private double value;
    private long timestamp;
    private String source;
    private boolean isAnomaly;
    private String algorithm;
    private double score;
    private double threshold;
    private String message;
    private Map<String, String> tags;
}
