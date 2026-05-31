package com.anomaly.websocket.service;

import com.alibaba.fastjson.JSON;
import com.anomaly.websocket.handler.AnomalyWebSocketHandler;
import com.anomaly.websocket.model.AnomalyResult;
import com.anomaly.websocket.model.RootCauseAnalysisResult;
import com.anomaly.websocket.model.StatisticsData;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Service
public class KafkaConsumerService {

    @Autowired
    private AnomalyWebSocketHandler webSocketHandler;

    private final Map<String, AtomicLong> anomaliesByMetric = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> anomaliesByAlgorithm = new ConcurrentHashMap<>();
    private final AtomicLong totalRootCauseAnalyses = new AtomicLong(0);

    @KafkaListener(topics = "anomaly-output", groupId = "websocket-group")
    public void handleAnomalyOutput(String message) {
        try {
            AnomalyResult anomaly = JSON.parseObject(message, AnomalyResult.class);
            webSocketHandler.broadcastAnomaly(anomaly);

            if (anomaly.isAnomaly()) {
                anomaliesByMetric.computeIfAbsent(anomaly.getMetricId(), k -> new AtomicLong(0)).incrementAndGet();
                anomaliesByAlgorithm.computeIfAbsent(anomaly.getAlgorithm(), k -> new AtomicLong(0)).incrementAndGet();
            }
        } catch (Exception e) {
            log.error("Error processing anomaly output", e);
        }
    }

    @KafkaListener(topics = "anomaly-alerts-enriched", groupId = "websocket-group")
    public void handleEnrichedAlerts(String message) {
        try {
            RootCauseAnalysisResult rootCause = JSON.parseObject(message, RootCauseAnalysisResult.class);
            totalRootCauseAnalyses.incrementAndGet();
            webSocketHandler.broadcastRootCause(rootCause);
            log.info("Broadcast root cause analysis for metric: {}, confidence: {}", 
                rootCause.getAlert().getMetricId(), rootCause.getConfidence());
        } catch (Exception e) {
            log.error("Error processing enriched alert", e);
        }
    }

    @Scheduled(fixedRate = 5000)
    public void sendStatistics() {
        StatisticsData stats = new StatisticsData();
        stats.setActiveConnections(webSocketHandler.getConnectionCount());
        stats.setTotalMessages(webSocketHandler.getTotalMessages());
        stats.setTotalAnomalies(webSocketHandler.getTotalAnomalies());
        stats.setTimestamp(System.currentTimeMillis());

        Map<String, Long> metricMap = new ConcurrentHashMap<>();
        anomaliesByMetric.forEach((k, v) -> metricMap.put(k, v.get()));
        stats.setAnomaliesByMetric(metricMap);

        Map<String, Long> algoMap = new ConcurrentHashMap<>();
        anomaliesByAlgorithm.forEach((k, v) -> algoMap.put(k, v.get()));
        stats.setAnomaliesByAlgorithm(algoMap);

        webSocketHandler.broadcastStatistics(stats);
    }

    public long getTotalRootCauseAnalyses() {
        return totalRootCauseAnalyses.get();
    }
}
