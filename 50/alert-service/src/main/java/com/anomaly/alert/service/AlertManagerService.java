package com.anomaly.alert.service;

import com.alibaba.fastjson.JSON;
import com.anomaly.alert.model.AnomalyAlert;
import com.anomaly.alert.notification.NotificationChannel;
import com.anomaly.alert.rootcause.RootCauseAnalyzer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class AlertManagerService {

    @Autowired
    private List<NotificationChannel> notificationChannels;

    @Autowired
    private RootCauseAnalyzer rootCauseAnalyzer;

    @Autowired(required = false)
    private KafkaTemplate<String, String> kafkaTemplate;

    private final Map<String, Long> lastAlertTime = new ConcurrentHashMap<>();
    private static final long MIN_INTERVAL_MS = 60000;

    @PostConstruct
    public void init() {
        log.info("Alert Manager initialized with {} channels", notificationChannels.size());
        for (NotificationChannel channel : notificationChannels) {
            log.info("Notification channel: {} (enabled: {})", channel.getName(), channel.isEnabled());
        }
    }

    @KafkaListener(topics = "anomaly-alerts", groupId = "alert-service-group")
    public void handleAlert(String message) {
        try {
            AnomalyAlert alert = JSON.parseObject(message, AnomalyAlert.class);
            if (alert.isAnomaly()) {
                processAlert(alert);
            }
        } catch (Exception e) {
            log.error("Error processing alert", e);
        }
    }

    @Async
    public void processAlert(AnomalyAlert alert) {
        String key = alert.getMetricId() + ":" + alert.getAlgorithm();
        Long lastTime = lastAlertTime.get(key);
        long now = System.currentTimeMillis();

        if (lastTime != null && now - lastTime < MIN_INTERVAL_MS) {
            log.debug("Alert suppressed for {} due to rate limiting", key);
            return;
        }

        lastAlertTime.put(key, now);
        log.warn("Processing alert: metric={}, value={}, algorithm={}, score={}",
            alert.getMetricId(), alert.getValue(), alert.getAlgorithm(), alert.getScore());

        try {
            RootCauseAnalyzer.RootCauseAnalysis analysis = rootCauseAnalyzer.analyze(alert);
            alert.setRootCauseAnalysis(analysis);
            
            log.info("Root cause analysis completed for {}: confidence={}, severity={}, causes={}",
                alert.getMetricId(), analysis.getConfidence(), analysis.getSeverityLevel(), 
                analysis.getPossibleCauses().size());
            
            if (kafkaTemplate != null) {
                String enrichedJson = JSON.toJSONString(alert);
                kafkaTemplate.send("anomaly-alerts-enriched", enrichedJson);
            }
            
            for (NotificationChannel channel : notificationChannels) {
                if (channel.isEnabled()) {
                    try {
                        channel.send(alert);
                    } catch (Exception e) {
                        log.error("Failed to send alert via channel {}: {}",
                            channel.getName(), e.getMessage());
                    }
                }
            }
            
        } catch (Exception e) {
            log.error("Error during root cause analysis", e);
            
            for (NotificationChannel channel : notificationChannels) {
                if (channel.isEnabled()) {
                    try {
                        channel.send(alert);
                    } catch (Exception ex) {
                        log.error("Failed to send alert via channel {}: {}",
                            channel.getName(), ex.getMessage());
                    }
                }
            }
        }
    }

    public Map<String, Object> getAlertStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalAlertsProcessed", lastAlertTime.size());
        stats.put("notificationChannels", notificationChannels.size());
        stats.put("activeChannels", notificationChannels.stream()
            .filter(NotificationChannel::isEnabled)
            .map(NotificationChannel::getName)
            .toList());
        return stats;
    }
}
