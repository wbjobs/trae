package com.anomaly.alert.rootcause;

import com.anomaly.alert.model.AnomalyAlert;
import com.anomaly.alert.rootcause.RootCauseKnowledgeBase.CausePattern;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
@Component
public class RootCauseAnalyzer {

    @Autowired
    private RootCauseKnowledgeBase knowledgeBase;

    private final Map<String, List<AnomalyAlert>> anomalyHistory = new ConcurrentHashMap<>();
    private static final int MAX_HISTORY_SIZE = 100;
    private static final long RECENT_WINDOW_MS = 300000;

    @PostConstruct
    public void init() {
        log.info("Root Cause Analyzer initialized");
    }

    public RootCauseAnalysis analyze(AnomalyAlert alert) {
        long startTime = System.currentTimeMillis();
        
        try {
            updateAnomalyHistory(alert);
            
            List<ScoredCause> scoredCauses = new ArrayList<>();
            
            scoredCauses.addAll(analyzeMetricPatterns(alert));
            scoredCauses.addAll(analyzeAlgorithmPatterns(alert));
            scoredCauses.addAll(analyzeTagPatterns(alert));
            scoredCauses.addAll(analyzeTemporalPatterns(alert));
            scoredCauses.addAll(analyzeContextPatterns(alert));
            scoredCauses.addAll(analyzeSeverityPatterns(alert));
            
            Map<String, ScoredCause> mergedCauses = mergeCauses(scoredCauses);
            
            List<ScoredCause> sortedCauses = mergedCauses.values().stream()
                .sorted((a, b) -> Double.compare(b.getTotalScore(), a.getTotalScore()))
                .limit(5)
                .collect(Collectors.toList());
            
            List<String> aggregatedSuggestions = aggregateSuggestions(sortedCauses);
            
            RootCauseAnalysis analysis = new RootCauseAnalysis();
            analysis.setAlert(alert);
            analysis.setPossibleCauses(sortedCauses);
            analysis.setSuggestions(aggregatedSuggestions);
            analysis.setAnalysisTimeMs(System.currentTimeMillis() - startTime);
            analysis.setConfidence(calculateOverallConfidence(sortedCauses));
            analysis.setSeverityLevel(calculateSeverityLevel(alert, sortedCauses));
            
            log.debug("Root cause analysis completed for metric {} in {}ms, found {} possible causes",
                alert.getMetricId(), analysis.getAnalysisTimeMs(), sortedCauses.size());
            
            return analysis;
            
        } catch (Exception e) {
            log.error("Error during root cause analysis", e);
            return createFallbackAnalysis(alert);
        }
    }

    private List<ScoredCause> analyzeMetricPatterns(AnomalyAlert alert) {
        List<ScoredCause> results = new ArrayList<>();
        List<CausePattern> patterns = knowledgeBase.getPatternsForMetric(alert.getMetricId());
        
        for (CausePattern pattern : patterns) {
            double score = pattern.getWeight() * 1.0;
            ScoredCause cause = new ScoredCause();
            cause.setPatternCode(pattern.getPatternCode());
            cause.setPatternName(pattern.getPatternName());
            cause.setPossibleCauses(pattern.getPossibleCauses());
            cause.setSuggestions(pattern.getSuggestions());
            cause.addScoreComponent("metric_pattern", score);
            results.add(cause);
        }
        
        return results;
    }

    private List<ScoredCause> analyzeAlgorithmPatterns(AnomalyAlert alert) {
        List<ScoredCause> results = new ArrayList<>();
        List<CausePattern> patterns = knowledgeBase.getPatternsForAlgorithm(alert.getAlgorithm());
        
        for (CausePattern pattern : patterns) {
            double score = pattern.getWeight() * 0.8;
            ScoredCause cause = new ScoredCause();
            cause.setPatternCode(pattern.getPatternCode());
            cause.setPatternName(pattern.getPatternName());
            cause.setPossibleCauses(pattern.getPossibleCauses());
            cause.setSuggestions(pattern.getSuggestions());
            cause.addScoreComponent("algorithm_pattern", score);
            results.add(cause);
        }
        
        return results;
    }

    private List<ScoredCause> analyzeTagPatterns(AnomalyAlert alert) {
        List<ScoredCause> results = new ArrayList<>();
        List<CausePattern> patterns = knowledgeBase.getPatternsForTags(alert.getTags());
        
        for (CausePattern pattern : patterns) {
            double score = pattern.getWeight() * 0.6;
            ScoredCause cause = new ScoredCause();
            cause.setPatternCode(pattern.getPatternCode());
            cause.setPatternName(pattern.getPatternName());
            cause.setPossibleCauses(pattern.getPossibleCauses());
            cause.setSuggestions(pattern.getSuggestions());
            cause.addScoreComponent("tag_pattern", score);
            results.add(cause);
        }
        
        return results;
    }

    private List<ScoredCause> analyzeTemporalPatterns(AnomalyAlert alert) {
        List<ScoredCause> results = new ArrayList<>();
        LocalDateTime time = LocalDateTime.ofInstant(
            Instant.ofEpochMilli(alert.getTimestamp()),
            ZoneId.systemDefault()
        );
        
        int hour = time.getHour();
        DayOfWeek dayOfWeek = time.getDayOfWeek();
        boolean isWeekend = dayOfWeek == DayOfWeek.SATURDAY || dayOfWeek == DayOfWeek.SUNDAY;
        boolean isBusinessHours = hour >= 9 && hour <= 18;
        boolean isNightHours = hour >= 0 && hour < 6;
        boolean isPeakHours = (hour >= 10 && hour <= 12) || (hour >= 14 && hour <= 16);
        
        if (isNightHours) {
            ScoredCause cause = new ScoredCause();
            cause.setPatternCode("night_time_anomaly");
            cause.setPatternName("夜间时段异常");
            cause.setPossibleCauses(Arrays.asList(
                "夜间批处理任务",
                "定时任务异常",
                "系统维护操作",
                "夜间攻击行为"
            ));
            cause.setSuggestions(Arrays.asList(
                "1. 检查是否有夜间定时任务在运行",
                "2. 查看系统维护计划",
                "3. 检查安全日志，是否有异常访问",
                "4. 确认是否为正常的批处理作业"
            ));
            cause.addScoreComponent("temporal_pattern", 0.7);
            results.add(cause);
        }
        
        if (isWeekend) {
            ScoredCause cause = new ScoredCause();
            cause.setPatternCode("weekend_anomaly");
            cause.setPatternName("周末时段异常");
            cause.setPossibleCauses(Arrays.asList(
                "周末促销活动",
                "系统维护",
                "异常流量",
                "测试流量"
            ));
            cause.setSuggestions(Arrays.asList(
                "1. 检查是否有周末活动或促销",
                "2. 确认是否有系统维护计划",
                "3. 分析流量来源是否正常",
                "4. 检查是否为测试环境流量"
            ));
            cause.addScoreComponent("temporal_pattern", 0.6);
            results.add(cause);
        }
        
        if (isPeakHours) {
            ScoredCause cause = new ScoredCause();
            cause.setPatternCode("peak_hours_anomaly");
            cause.setPatternName("业务高峰时段异常");
            cause.setPossibleCauses(Arrays.asList(
                "业务量超过系统承载能力",
                "资源瓶颈",
                "热点数据访问",
                "数据库连接池耗尽"
            ));
            cause.setSuggestions(Arrays.asList(
                "1. 检查系统资源使用情况",
                "2. 考虑扩容或限流",
                "3. 优化热点数据访问",
                "4. 检查数据库连接池配置"
            ));
            cause.addScoreComponent("temporal_pattern", 0.8);
            results.add(cause);
        }
        
        return results;
    }

    private List<ScoredCause> analyzeContextPatterns(AnomalyAlert alert) {
        List<ScoredCause> results = new ArrayList<>();
        
        List<AnomalyAlert> recentAnomalies = anomalyHistory.getOrDefault(alert.getMetricId(), Collections.emptyList());
        int recentCount = (int) recentAnomalies.stream()
            .filter(a -> System.currentTimeMillis() - a.getTimestamp() < RECENT_WINDOW_MS)
            .count();
        
        if (recentCount >= 5) {
            ScoredCause cause = new ScoredCause();
            cause.setPatternCode("frequent_anomalies");
            cause.setPatternName("频繁异常波动");
            cause.setPossibleCauses(Arrays.asList(
                "系统不稳定",
                "资源抖动",
                "数据采集异常",
                "外部依赖不稳定"
            ));
            cause.setSuggestions(Arrays.asList(
                "1. 检查系统是否存在不稳定因素",
                "2. 查看资源使用是否有剧烈波动",
                "3. 检查数据采集链路是否正常",
                "4. 检查依赖服务的稳定性"
            ));
            double frequencyScore = Math.min(recentCount / 10.0, 1.0);
            cause.addScoreComponent("context_pattern", 0.5 + frequencyScore * 0.4);
            results.add(cause);
        }
        
        Set<String> recentMetrics = recentAnomalies.stream()
            .filter(a -> System.currentTimeMillis() - a.getTimestamp() < RECENT_WINDOW_MS)
            .map(AnomalyAlert::getMetricId)
            .collect(Collectors.toSet());
        
        if (recentMetrics.size() >= 3) {
            ScoredCause cause = new ScoredCause();
            cause.setPatternCode("multiple_metrics_anomaly");
            cause.setPatternName("多指标同时异常");
            cause.setPossibleCauses(Arrays.asList(
                "基础设施故障",
                "网络问题",
                "数据库故障",
                "中间件故障",
                "级联故障"
            ));
            cause.setSuggestions(Arrays.asList(
                "1. 立即检查基础设施状态",
                "2. 检查网络连通性",
                "3. 检查数据库和中间件健康状态",
                "4. 查看是否有服务雪崩效应",
                "5. 考虑启动故障恢复流程"
            ));
            cause.addScoreComponent("context_pattern", 0.9);
            results.add(cause);
        }
        
        return results;
    }

    private List<ScoredCause> analyzeSeverityPatterns(AnomalyAlert alert) {
        List<ScoredCause> results = new ArrayList<>();
        double score = alert.getScore();
        
        if (score >= 4.0) {
            ScoredCause cause = new ScoredCause();
            cause.setPatternCode("extreme_severity");
            cause.setPatternName("严重异常（极高偏离）");
            cause.setPossibleCauses(Arrays.asList(
                "系统故障",
                "灾难性事件",
                "数据错误",
                "配置错误"
            ));
            cause.setSuggestions(Arrays.asList(
                "1. 立即启动应急响应流程",
                "2. 检查系统是否正常运行",
                "3. 验证数据采集是否正确",
                "4. 检查最近的配置变更"
            ));
            cause.addScoreComponent("severity_pattern", 0.95);
            results.add(cause);
        } else if (score >= 3.5) {
            ScoredCause cause = new ScoredCause();
            cause.setPatternCode("high_severity");
            cause.setPatternName("高严重度异常");
            cause.setPossibleCauses(Arrays.asList(
                "严重性能问题",
                "资源耗尽",
                "业务量激增",
                "外部攻击"
            ));
            cause.setSuggestions(Arrays.asList(
                "1. 优先处理此异常",
                "2. 检查系统资源是否耗尽",
                "3. 分析流量模式是否正常",
                "4. 考虑紧急扩容"
            ));
            cause.addScoreComponent("severity_pattern", 0.8);
            results.add(cause);
        }
        
        return results;
    }

    private Map<String, ScoredCause> mergeCauses(List<ScoredCause> causes) {
        Map<String, ScoredCause> merged = new HashMap<>();
        
        for (ScoredCause cause : causes) {
            String key = cause.getPatternCode();
            if (merged.containsKey(key)) {
                ScoredCause existing = merged.get(key);
                existing.merge(cause);
            } else {
                merged.put(key, cause);
            }
        }
        
        return merged;
    }

    private List<String> aggregateSuggestions(List<ScoredCause> topCauses) {
        Set<String> uniqueSuggestions = new LinkedHashSet<>();
        
        for (ScoredCause cause : topCauses) {
            if (cause.getTotalScore() >= 0.6) {
                uniqueSuggestions.addAll(cause.getSuggestions());
            }
        }
        
        if (uniqueSuggestions.size() > 10) {
            return new ArrayList<>(uniqueSuggestions).subList(0, 10);
        }
        
        return new ArrayList<>(uniqueSuggestions);
    }

    private double calculateOverallConfidence(List<ScoredCause> causes) {
        if (causes.isEmpty()) {
            return 0.0;
        }
        double totalScore = causes.stream()
            .mapToDouble(ScoredCause::getTotalScore)
            .sum();
        return Math.min(totalScore / causes.size(), 1.0);
    }

    private String calculateSeverityLevel(AnomalyAlert alert, List<ScoredCause> causes) {
        double score = alert.getScore();
        
        if (score >= 4.0) {
            return "CRITICAL";
        } else if (score >= 3.5) {
            return "HIGH";
        } else if (score >= 3.0) {
            return "MEDIUM";
        } else {
            return "LOW";
        }
    }

    private void updateAnomalyHistory(AnomalyAlert alert) {
        anomalyHistory.compute(alert.getMetricId(), (key, list) -> {
            if (list == null) {
                list = new ArrayList<>();
            }
            list.add(alert);
            if (list.size() > MAX_HISTORY_SIZE) {
                list = new ArrayList<>(list.subList(list.size() - MAX_HISTORY_SIZE, list.size()));
            }
            return list;
        });
    }

    private RootCauseAnalysis createFallbackAnalysis(AnomalyAlert alert) {
        RootCauseAnalysis analysis = new RootCauseAnalysis();
        analysis.setAlert(alert);
        analysis.setPossibleCauses(Collections.emptyList());
        analysis.setSuggestions(Arrays.asList(
            "1. 手动检查相关指标和日志",
            "2. 联系运维人员协助排查",
            "3. 查看系统监控面板"
        ));
        analysis.setConfidence(0.0);
        analysis.setSeverityLevel("UNKNOWN");
        return analysis;
    }

    @Data
    public static class RootCauseAnalysis implements java.io.Serializable {
        private AnomalyAlert alert;
        private List<ScoredCause> possibleCauses;
        private List<String> suggestions;
        private double confidence;
        private String severityLevel;
        private long analysisTimeMs;
    }

    @Data
    public static class ScoredCause implements java.io.Serializable {
        private String patternCode;
        private String patternName;
        private List<String> possibleCauses;
        private List<String> suggestions;
        private Map<String, Double> scoreComponents = new HashMap<>();
        private double totalScore;

        public void addScoreComponent(String component, double score) {
            scoreComponents.put(component, score);
            recalculateTotalScore();
        }

        public void merge(ScoredCause other) {
            for (Map.Entry<String, Double> entry : other.getScoreComponents().entrySet()) {
                this.scoreComponents.merge(entry.getKey(), entry.getValue(), Math::max);
            }
            recalculateTotalScore();
        }

        private void recalculateTotalScore() {
            this.totalScore = scoreComponents.values().stream()
                .mapToDouble(Double::doubleValue)
                .average()
                .orElse(0.0);
        }
    }
}
