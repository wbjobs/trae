package com.anomaly.alert.notification;

import com.anomaly.alert.model.AnomalyAlert;
import com.anomaly.alert.rootcause.RootCauseAnalyzer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;

@Slf4j
@Component
public class EmailNotification implements NotificationChannel {

    @Autowired
    private JavaMailSender mailSender;

    @Value("${alert.email.enabled:false}")
    private boolean enabled;

    @Value("${alert.email.from:}")
    private String from;

    @Value("${alert.email.to:}")
    private String to;

    @Override
    public String getName() {
        return "email";
    }

    @Override
    public void send(AnomalyAlert alert) throws Exception {
        if (!enabled || to.isEmpty()) {
            return;
        }

        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        String time = sdf.format(new Date(alert.getTimestamp()));

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to.split(","));
        
        String subject = String.format("[%s异常告警] %s - 偏离%.2f倍",
            getSeverityEmoji(alert.getRootCauseAnalysis() != null ? alert.getRootCauseAnalysis().getSeverityLevel() : "MEDIUM"),
            alert.getMetricId(),
            alert.getScore());
        
        message.setSubject(subject);

        StringBuilder text = new StringBuilder();
        text.append("检测到异常数据点:\n\n");
        text.append("指标ID: ").append(alert.getMetricId()).append("\n");
        text.append("异常值: ").append(String.format("%.2f", alert.getValue())).append("\n");
        text.append("检测时间: ").append(time).append("\n");
        text.append("检测算法: ").append(alert.getAlgorithm()).append("\n");
        text.append("异常分数: ").append(String.format("%.4f", alert.getScore())).append("\n");
        text.append("阈值: ").append(String.format("%.2f", alert.getThreshold())).append("\n");
        text.append("数据来源: ").append(alert.getSource()).append("\n");
        text.append("详细信息: ").append(alert.getMessage()).append("\n");

        if (alert.getRootCauseAnalysis() != null) {
            RootCauseAnalyzer.RootCauseAnalysis rca = alert.getRootCauseAnalysis();
            text.append("\n====================\n");
            text.append("【根因分析结果\n");
            text.append("====================\n\n");
            
            text.append("严重级别: ").append(getSeverityText(rca.getSeverityLevel())).append("\n");
            text.append("置信度: ").append(String.format("%.1f%%", rca.getConfidence() * 100)).append("\n");
            text.append("分析耗时: ").append(rca.getAnalysisTimeMs()).append("ms\n\n");

            List<RootCauseAnalyzer.ScoredCause> causes = rca.getPossibleCauses();
            if (causes != null && !causes.isEmpty()) {
                text.append("可能的原因:\n");
                for (int i = 0; i < Math.min(3, causes.size()); i++) {
                    RootCauseAnalyzer.ScoredCause cause = causes.get(i);
                    text.append(String.format("%d. [%s] (匹配度: %.1f%%)\n", 
                        i + 1, cause.getPatternName(), cause.getTotalScore() * 100);
                    List<String> possibleCauses = cause.getPossibleCauses();
                    if (possibleCauses != null && !possibleCauses.isEmpty()) {
                        text.append("   - ").append(String.join(", ", possibleCauses)).append("\n");
                    }
                }
                text.append("\n");
            }

            List<String> suggestions = rca.getSuggestions();
            if (suggestions != null && !suggestions.isEmpty()) {
                text.append("建议处理方案:\n");
                for (int i = 0; i < Math.min(5, suggestions.size()); i++) {
                    text.append("  ").append(suggestions.get(i)).append("\n");
                }
            }
        }

        message.setText(text.toString());

        mailSender.send(message);
        log.info("Email alert sent for metric: {}", alert.getMetricId());
    }

    private String getSeverityEmoji(String severity) {
        if (severity == null) return "⚠️";
        switch (severity) {
            case "CRITICAL": return "🔴";
            case "HIGH": return "🟠";
            case "MEDIUM": return "🟡";
            case "LOW": return "🟢";
            default: return "⚪";
        }
    }

    private String getSeverityText(String severity) {
        if (severity == null) return "未知";
        switch (severity) {
            case "CRITICAL": return "严重";
            case "HIGH": return "高";
            case "MEDIUM": return "中";
            case "LOW": return "低";
            default: return "未知";
        }
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }
}
