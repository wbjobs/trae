package com.anomaly.alert.model;

import com.anomaly.alert.rootcause.RootCauseAnalyzer;
import lombok.Data;

import java.util.Map;

@Data
public class AnomalyAlert {
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
    
    private RootCauseAnalyzer.RootCauseAnalysis rootCauseAnalysis;
}
