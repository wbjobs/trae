package com.anomaly.websocket.model;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class RootCauseAnalysisResult {
    private String type = "root_cause";
    private AnomalyResult alert;
    private List<ScoredCause> possibleCauses;
    private List<String> suggestions;
    private double confidence;
    private String severityLevel;
    private long analysisTimeMs;

    @Data
    public static class ScoredCause {
        private String patternCode;
        private String patternName;
        private List<String> possibleCauses;
        private List<String> suggestions;
        private Map<String, Double> scoreComponents;
        private double totalScore;
    }
}
