package com.sentiment.websocket;

import com.sentiment.service.BurstDetectionService;
import com.sentiment.service.DruidIngestionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class RealTimePushService {

    private final SimpMessagingTemplate messagingTemplate;
    private final DruidIngestionService druidService;
    private final BurstDetectionService burstDetectionService;

    public RealTimePushService(SimpMessagingTemplate messagingTemplate,
                               DruidIngestionService druidService,
                               BurstDetectionService burstDetectionService) {
        this.messagingTemplate = messagingTemplate;
        this.druidService = druidService;
        this.burstDetectionService = burstDetectionService;
    }

    @Scheduled(fixedRate = 2000)
    public void pushRealTimeStats() {
        try {
            var stats = druidService.getRealTimeStats();
            messagingTemplate.convertAndSend("/topic/realtime", stats);
        } catch (Exception e) {
            log.warn("Failed to push realtime stats: {}", e.getMessage());
        }
    }

    @Scheduled(fixedRate = 5000)
    public void pushSentimentTrend() {
        try {
            var trends = druidService.getSentimentTrends("5m");
            messagingTemplate.convertAndSend("/topic/trends", trends);
        } catch (Exception e) {
            log.warn("Failed to push sentiment trends: {}", e.getMessage());
        }
    }

    @Scheduled(fixedRate = 10000)
    public void pushTopEntities() {
        try {
            var entities = druidService.getTopEntities(30, null);
            messagingTemplate.convertAndSend("/topic/entities", entities);
        } catch (Exception e) {
            log.warn("Failed to push top entities: {}", e.getMessage());
        }
    }

    @Scheduled(fixedRate = 10000)
    public void pushGeoDistribution() {
        try {
            var geo = druidService.getGeoDistribution(30);
            messagingTemplate.convertAndSend("/topic/geo", geo);
        } catch (Exception e) {
            log.warn("Failed to push geo distribution: {}", e.getMessage());
        }
    }

    @Scheduled(fixedRate = 5000)
    public void pushBurstAlerts() {
        try {
            var activeBursts = burstDetectionService.getActiveBurstAlerts(10);
            if (!activeBursts.isEmpty()) {
                var burstData = new java.util.HashMap<String, Object>();
                burstData.put("alerts", activeBursts);
                burstData.put("statistics", burstDetectionService.getBurstStatistics());
                burstData.put("activeBursts", burstDetectionService.getActiveBursts());
                messagingTemplate.convertAndSend("/topic/bursts", burstData);
            }
        } catch (Exception e) {
            log.warn("Failed to push burst alerts: {}", e.getMessage());
        }
    }
}
