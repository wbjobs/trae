package com.sentiment.controller;

import com.sentiment.dto.*;
import com.sentiment.producer.SocialMediaProducer;
import com.sentiment.consumer.SocialMediaConsumer;
import com.sentiment.service.BurstDetectionService;
import com.sentiment.service.DruidIngestionService;
import com.sentiment.service.DruidQueryService;
import com.sentiment.service.EntityExtractionService;
import com.sentiment.service.SentimentAnalysisService;
import com.sentiment.model.SocialMediaPost;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class SentimentController {

    private final DruidIngestionService druidService;
    private final DruidQueryService druidQueryService;
    private final BurstDetectionService burstDetectionService;
    private final SentimentAnalysisService sentimentService;
    private final EntityExtractionService entityService;
    private final SocialMediaProducer producer;
    private final SocialMediaConsumer consumer;

    public SentimentController(DruidIngestionService druidService,
                               DruidQueryService druidQueryService,
                               BurstDetectionService burstDetectionService,
                               SentimentAnalysisService sentimentService,
                               EntityExtractionService entityService,
                               SocialMediaProducer producer,
                               SocialMediaConsumer consumer) {
        this.druidService = druidService;
        this.druidQueryService = druidQueryService;
        this.burstDetectionService = burstDetectionService;
        this.sentimentService = sentimentService;
        this.entityService = entityService;
        this.producer = producer;
        this.consumer = consumer;
    }

    @GetMapping("/dashboard")
    public ResponseEntity<DashboardStatsDTO> getDashboard(
            @RequestParam(defaultValue = "5m") String window) {
        log.debug("Getting dashboard stats for window: {}", window);
        DashboardStatsDTO stats = druidService.getDashboardStats(window);
        return ResponseEntity.ok(stats);
    }

    @GetMapping("/sentiment/trend")
    public ResponseEntity<List<SentimentTrendDTO>> getSentimentTrend(
            @RequestParam(defaultValue = "5m") String window) {
        log.debug("Getting sentiment trend for window: {}", window);
        List<SentimentTrendDTO> trends = druidService.getSentimentTrends(window);
        return ResponseEntity.ok(trends);
    }

    @GetMapping("/entities/top")
    public ResponseEntity<List<EntityCountDTO>> getTopEntities(
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(required = false) String type) {
        log.debug("Getting top {} entities of type: {}", limit, type);
        List<EntityCountDTO> entities = druidService.getTopEntities(limit, type);
        return ResponseEntity.ok(entities);
    }

    @GetMapping("/geo/distribution")
    public ResponseEntity<List<GeoDistributionDTO>> getGeoDistribution(
            @RequestParam(defaultValue = "50") int limit) {
        log.debug("Getting geo distribution with limit: {}", limit);
        List<GeoDistributionDTO> distribution = druidService.getGeoDistribution(limit);
        return ResponseEntity.ok(distribution);
    }

    @GetMapping("/stats/realtime")
    public ResponseEntity<Map<String, Object>> getRealTimeStats() {
        Map<String, Object> stats = druidService.getRealTimeStats();
        stats.put("producerTotal", producer.getTotalProduced());
        stats.put("consumerProcessed", consumer.getProcessedCount());
        return ResponseEntity.ok(stats);
    }

    @PostMapping("/analyze")
    public ResponseEntity<Map<String, Object>> analyzeText(@RequestBody Map<String, String> request) {
        String text = request.get("text");
        if (text == null || text.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Text is required"));
        }

        Map<String, Object> result = new HashMap<>();
        result.put("sentiment", sentimentService.analyze(text));
        result.put("entities", entityService.extract(text));
        result.put("timestamp", Instant.now().toString());

        return ResponseEntity.ok(result);
    }

    @PostMapping("/analyze/batch")
    public ResponseEntity<List<Map<String, Object>>> analyzeBatch(@RequestBody List<String> texts) {
        List<Map<String, Object>> results = new ArrayList<>();
        for (String text : texts) {
            Map<String, Object> result = new HashMap<>();
            result.put("text", text);
            result.put("sentiment", sentimentService.analyze(text));
            result.put("entities", entityService.extract(text));
            results.add(result);
        }
        return ResponseEntity.ok(results);
    }

    @PostMapping("/producer/toggle")
    public ResponseEntity<Map<String, Object>> toggleProducer(@RequestParam boolean enable) {
        Map<String, Object> result = new HashMap<>();
        result.put("enabled", enable);
        result.put("totalProduced", producer.getTotalProduced());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> health = new HashMap<>();
        health.put("status", "UP");
        health.put("timestamp", Instant.now().toString());
        health.put("producerTotal", producer.getTotalProduced());
        health.put("consumerProcessed", consumer.getProcessedCount());
        return ResponseEntity.ok(health);
    }

    @GetMapping("/entities/dictionary")
    public ResponseEntity<Map<String, Object>> getEntityDictionary() {
        Map<String, Object> dictionary = new HashMap<>();
        dictionary.put("persons", entityService.getPersonNames());
        dictionary.put("brands", entityService.getBrandNames());
        dictionary.put("locations", entityService.getLocationNames());
        return ResponseEntity.ok(dictionary);
    }

    @GetMapping("/druid/status")
    public ResponseEntity<Map<String, Object>> getDruidStatus() {
        Map<String, Object> status = new HashMap<>();
        DruidQueryService.DruidStatus druidStatus = druidQueryService.getStatus();
        status.put("available", druidStatus.isAvailable());
        status.put("cacheSize", druidStatus.getCacheSize());
        status.put("cacheStats", druidStatus.getCacheStats());
        status.put("segmentStatus", druidService.getSegmentStatus().name());
        status.put("bufferSize", druidService.getBufferSize());
        status.put("lastCheckTime", druidStatus.getLastCheckTime());
        return ResponseEntity.ok(status);
    }

    @PostMapping("/druid/cache/invalidate")
    public ResponseEntity<Map<String, Object>> invalidateDruidCache() {
        druidQueryService.invalidateCache();
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "Druid query cache invalidated");
        return ResponseEntity.ok(result);
    }

    @PostMapping("/druid/flush")
    public ResponseEntity<Map<String, Object>> flushDruidBuffer() {
        druidService.forceFlush();
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "Buffer flush triggered");
        result.put("remainingBuffer", druidService.getBufferSize());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/druid/segments")
    public ResponseEntity<Map<String, Object>> getSegmentStatus() {
        Map<String, Object> status = new HashMap<>();
        status.put("segmentStatus", druidService.getSegmentStatus().name());
        status.put("availableSegments", druidQueryService.getAvailableSegments());
        status.put("druidAvailable", druidQueryService.checkDruidAvailability());
        return ResponseEntity.ok(status);
    }

    @GetMapping("/bursts/active")
    public ResponseEntity<Map<String, Object>> getActiveBursts(
            @RequestParam(defaultValue = "20") int limit) {
        Map<String, Object> result = new HashMap<>();
        result.put("activeBursts", burstDetectionService.getActiveBursts());
        result.put("alerts", burstDetectionService.getActiveBurstAlerts(limit));
        result.put("statistics", burstDetectionService.getBurstStatistics());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/bursts/alerts")
    public ResponseEntity<List<BurstDetectionService.BurstAlert>> getBurstAlerts(
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(required = false) String severity) {
        if (severity != null && !severity.isEmpty()) {
            return ResponseEntity.ok(burstDetectionService.getBurstAlertsBySeverity(severity, limit));
        }
        return ResponseEntity.ok(burstDetectionService.getAllBurstAlerts(limit));
    }

    @GetMapping("/bursts/statistics")
    public ResponseEntity<Map<String, Object>> getBurstStatistics() {
        return ResponseEntity.ok(burstDetectionService.getBurstStatistics());
    }

    @PostMapping("/bursts/alerts/{alertId}/acknowledge")
    public ResponseEntity<Map<String, Object>> acknowledgeAlert(@PathVariable String alertId) {
        boolean success = burstDetectionService.acknowledgeAlert(alertId);
        Map<String, Object> result = new HashMap<>();
        result.put("success", success);
        result.put("message", success ? "Alert acknowledged" : "Alert not found");
        return ResponseEntity.ok(result);
    }

    @PostMapping("/bursts/alerts/acknowledge-all")
    public ResponseEntity<Map<String, Object>> acknowledgeAllAlerts() {
        burstDetectionService.acknowledgeAllAlerts();
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "All alerts acknowledged");
        return ResponseEntity.ok(result);
    }

    @PostMapping("/bursts/toggle")
    public ResponseEntity<Map<String, Object>> toggleBurstDetection(@RequestParam boolean enable) {
        burstDetectionService.setDetectionEnabled(enable);
        Map<String, Object> result = new HashMap<>();
        result.put("enabled", enable);
        result.put("message", "Burst detection " + (enable ? "enabled" : "disabled"));
        return ResponseEntity.ok(result);
    }

    @PostMapping("/bursts/clear")
    public ResponseEntity<Map<String, Object>> clearBurstData() {
        burstDetectionService.clearAllData();
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "Burst detection data cleared");
        return ResponseEntity.ok(result);
    }
}
