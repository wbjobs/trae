package com.anomaly.ml.service;

import com.alibaba.fastjson.JSON;
import com.anomaly.ml.isolationforest.IsolationForest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class IsolationForestService {

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    private final Map<String, IsolationForest> forestMap = new ConcurrentHashMap<>();
    private final Map<String, List<double[]>> trainingDataMap = new ConcurrentHashMap<>();
    private final Map<String, List<double[]>> recentDataMap = new ConcurrentHashMap<>();
    
    private static final int WINDOW_SIZE = 1000;
    private static final int MIN_TRAIN_SAMPLES = 200;
    private static final double ANOMALY_THRESHOLD = 0.7;

    @PostConstruct
    public void init() {
        log.info("Isolation Forest Service initialized");
    }

    @KafkaListener(topics = "metrics-input", groupId = "ml-detection-group")
    public void handleMetricData(String message) {
        try {
            MetricData metric = JSON.parseObject(message, MetricData.class);
            String key = metric.getMetricId();
            
            double[] features = extractFeatures(metric);
            
            recentDataMap.computeIfAbsent(key, k -> new ArrayList<>());
            List<double[]> recentData = recentDataMap.get(key);
            recentData.add(features);
            if (recentData.size() > WINDOW_SIZE) {
                recentData.remove(0);
            }
            
            trainingDataMap.computeIfAbsent(key, k -> new ArrayList<>());
            List<double[]> trainingData = trainingDataMap.get(key);
            trainingData.add(features);
            if (trainingData.size() > WINDOW_SIZE * 2) {
                trainingData.remove(0);
            }
            
            IsolationForest forest = forestMap.get(key);
            if (forest != null && trainingData.size() >= MIN_TRAIN_SAMPLES) {
                double score = forest.anomalyScore(features);
                boolean isAnomaly = score > ANOMALY_THRESHOLD;
                
                if (isAnomaly) {
                    sendAnomalyAlert(metric, score);
                }
                
                sendDetectionResult(metric, score, isAnomaly);
            }
        } catch (Exception e) {
            log.error("Error processing metric data", e);
        }
    }

    @Scheduled(fixedRate = 60000)
    public void retrainModels() {
        for (Map.Entry<String, List<double[]>> entry : trainingDataMap.entrySet()) {
            String key = entry.getKey();
            List<double[]> data = entry.getValue();
            
            if (data.size() >= MIN_TRAIN_SAMPLES) {
                double[][] dataArray = data.toArray(new double[0][]);
                IsolationForest forest = new IsolationForest(100, Math.min(256, data.size()));
                forest.fit(dataArray);
                forestMap.put(key, forest);
                log.info("Model retrained for metric: {}, samples: {}", key, data.size());
            }
        }
    }

    private double[] extractFeatures(MetricData metric) {
        long hourOfDay = (metric.getTimestamp() / 3600000) % 24;
        long dayOfWeek = (metric.getTimestamp() / 86400000) % 7;
        return new double[]{
            metric.getValue(),
            hourOfDay,
            dayOfWeek
        };
    }

    private void sendAnomalyAlert(MetricData metric, double score) {
        AnomalyResult result = new AnomalyResult();
        result.setMetricId(metric.getMetricId());
        result.setValue(metric.getValue());
        result.setTimestamp(metric.getTimestamp());
        result.setSource(metric.getSource());
        result.setAnomaly(true);
        result.setAlgorithm("isolation-forest");
        result.setScore(score);
        result.setThreshold(ANOMALY_THRESHOLD);
        result.setMessage("Isolation Forest detected anomaly with score: " + String.format("%.4f", score));
        
        kafkaTemplate.send("anomaly-alerts", JSON.toJSONString(result));
        log.warn("Anomaly detected: metric={}, value={}, score={}", metric.getMetricId(), metric.getValue(), score);
    }

    private void sendDetectionResult(MetricData metric, double score, boolean isAnomaly) {
        AnomalyResult result = new AnomalyResult();
        result.setMetricId(metric.getMetricId());
        result.setValue(metric.getValue());
        result.setTimestamp(metric.getTimestamp());
        result.setSource(metric.getSource());
        result.setAnomaly(isAnomaly);
        result.setAlgorithm("isolation-forest");
        result.setScore(score);
        result.setThreshold(ANOMALY_THRESHOLD);
        result.setMessage(isAnomaly ? "Anomaly detected" : "Normal");
        
        kafkaTemplate.send("anomaly-output", JSON.toJSONString(result));
    }

    public static class MetricData {
        private String metricId;
        private double value;
        private long timestamp;
        private String source;
        private Map<String, String> tags;

        public String getMetricId() { return metricId; }
        public void setMetricId(String metricId) { this.metricId = metricId; }
        public double getValue() { return value; }
        public void setValue(double value) { this.value = value; }
        public long getTimestamp() { return timestamp; }
        public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
        public String getSource() { return source; }
        public void setSource(String source) { this.source = source; }
        public Map<String, String> getTags() { return tags; }
        public void setTags(Map<String, String> tags) { this.tags = tags; }
    }

    public static class AnomalyResult {
        private String metricId;
        private double value;
        private long timestamp;
        private String source;
        private boolean isAnomaly;
        private String algorithm;
        private double score;
        private double threshold;
        private String message;

        public String getMetricId() { return metricId; }
        public void setMetricId(String metricId) { this.metricId = metricId; }
        public double getValue() { return value; }
        public void setValue(double value) { this.value = value; }
        public long getTimestamp() { return timestamp; }
        public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
        public String getSource() { return source; }
        public void setSource(String source) { this.source = source; }
        public boolean isAnomaly() { return isAnomaly; }
        public void setAnomaly(boolean anomaly) { isAnomaly = anomaly; }
        public String getAlgorithm() { return algorithm; }
        public void setAlgorithm(String algorithm) { this.algorithm = algorithm; }
        public double getScore() { return score; }
        public void setScore(double score) { this.score = score; }
        public double getThreshold() { return threshold; }
        public void setThreshold(double threshold) { this.threshold = threshold; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }
}
