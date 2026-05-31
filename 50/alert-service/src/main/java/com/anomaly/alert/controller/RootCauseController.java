package com.anomaly.alert.controller;

import com.alibaba.fastjson.JSON;
import com.anomaly.alert.model.AnomalyAlert;
import com.anomaly.alert.rootcause.RootCauseAnalyzer;
import com.anomaly.alert.rootcause.RootCauseKnowledgeBase;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api/root-cause")
@CrossOrigin(origins = "*")
public class RootCauseController {

    @Autowired
    private RootCauseAnalyzer rootCauseAnalyzer;

    @Autowired
    private RootCauseKnowledgeBase knowledgeBase;

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    @PostMapping("/analyze")
    public ResponseEntity<?> analyzeRootCause(@RequestBody AnomalyAlert alert) {
        try {
            log.info("Received root cause analysis request for metric: {}", alert.getMetricId());
            RootCauseAnalyzer.RootCauseAnalysis analysis = rootCauseAnalyzer.analyze(alert);
            return ResponseEntity.ok(analysis);
        } catch (Exception e) {
            log.error("Error analyzing root cause", e);
            return ResponseEntity.internalServerError()
                .body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/analyze-batch")
    public ResponseEntity<?> analyzeBatch(@RequestBody List<AnomalyAlert> alerts) {
        try {
            log.info("Received batch root cause analysis request for {} alerts", alerts.size());
            List<RootCauseAnalyzer.RootCauseAnalysis> results = new ArrayList<>();
            for (AnomalyAlert alert : alerts) {
                results.add(rootCauseAnalyzer.analyze(alert));
            }
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            log.error("Error analyzing batch root cause", e);
            return ResponseEntity.internalServerError()
                .body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/knowledge/metrics")
    public ResponseEntity<?> getKnownMetrics() {
        try {
            Set<String> metrics = knowledgeBase.getKnownMetrics();
            Map<String, Object> result = new HashMap<>();
            result.put("metrics", metrics);
            result.put("count", metrics.size());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Error getting known metrics", e);
            return ResponseEntity.internalServerError()
                .body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/knowledge/patterns/{metricId}")
    public ResponseEntity<?> getPatternsForMetric(@PathVariable String metricId) {
        try {
            List<RootCauseKnowledgeBase.CausePattern> patterns = knowledgeBase.getPatternsForMetric(metricId);
            return ResponseEntity.ok(patterns);
        } catch (Exception e) {
            log.error("Error getting patterns for metric", e);
            return ResponseEntity.internalServerError()
                .body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/simulate")
    public ResponseEntity<?> simulateAnalysis(
            @RequestParam String metricId,
            @RequestParam(defaultValue = "3.5") double score,
            @RequestParam(defaultValue = "3sigma") String algorithm) {
        try {
            AnomalyAlert alert = new AnomalyAlert();
            alert.setMetricId(metricId);
            alert.setValue(score * 10);
            alert.setTimestamp(System.currentTimeMillis());
            alert.setSource("api-simulation");
            alert.setAnomaly(true);
            alert.setAlgorithm(algorithm);
            alert.setScore(score);
            alert.setThreshold(3.0);
            alert.setMessage("Simulated anomaly for testing root cause analysis");
            alert.setTags(Collections.singletonMap("environment", "test"));

            RootCauseAnalyzer.RootCauseAnalysis analysis = rootCauseAnalyzer.analyze(alert);
            return ResponseEntity.ok(analysis);
        } catch (Exception e) {
            log.error("Error simulating analysis", e);
            return ResponseEntity.internalServerError()
                .body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/test-alert")
    public ResponseEntity<?> sendTestAlert(@RequestBody Map<String, Object> params) {
        try {
            String metricId = (String) params.getOrDefault("metricId", "cpu.usage");
            double score = ((Number) params.getOrDefault("score", 3.8)).doubleValue();
            String algorithm = (String) params.getOrDefault("algorithm", "3sigma");

            Map<String, Object> data = new HashMap<>();
            data.put("metricId", metricId);
            data.put("value", score * 20);
            data.put("timestamp", System.currentTimeMillis());
            data.put("source", "api-test");
            data.put("isAnomaly", true);
            data.put("algorithm", algorithm);
            data.put("score", score);
            data.put("threshold", 3.0);
            data.put("message", "Test alert from API");
            data.put("tags", Collections.singletonMap("environment", "test"));

            String json = JSON.toJSONString(data);
            kafkaTemplate.send("anomaly-alerts", json);
            
            return ResponseEntity.ok(Collections.singletonMap("status", "Test alert sent to Kafka topic: anomaly-alerts"));
        } catch (Exception e) {
            log.error("Error sending test alert", e);
            return ResponseEntity.internalServerError()
                .body(Collections.singletonMap("error", e.getMessage()));
        }
    }
}
