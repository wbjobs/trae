package com.anomaly.alert.notification;

import com.alibaba.fastjson.JSON;
import com.anomaly.alert.model.AnomalyAlert;
import com.anomaly.alert.rootcause.RootCauseAnalyzer;
import lombok.extern.slf4j.Slf4j;
import okhttp3.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class WeChatNotification implements NotificationChannel {

    @Value("${alert.wechat.enabled:false}")
    private boolean enabled;

    @Value("${alert.wechat.webhook-url:}")
    private String webhookUrl;

    private final OkHttpClient httpClient = new OkHttpClient();

    @Override
    public String getName() {
        return "wechat";
    }

    @Override
    public void send(AnomalyAlert alert) throws Exception {
        if (!enabled || webhookUrl.isEmpty()) {
            return;
        }

        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        String time = sdf.format(new Date(alert.getTimestamp()));

        StringBuilder markdown = new StringBuilder();
        markdown.append("## 异常告警通知\n\n");
        
        String severityColor = getSeverityColor(alert.getRootCauseAnalysis() != null ? 
            alert.getRootCauseAnalysis().getSeverityLevel() : "MEDIUM");
        
        markdown.append(String.format(
            "<font color=\"%s\">**检测到异常数据点**</font>\n\n", severityColor));
        
        markdown.append("> **指标ID**: <font color=\"comment\">").append(alert.getMetricId()).append("</font>\n");
        markdown.append("> **异常值**: <font color=\"comment\">").append(String.format("%.2f", alert.getValue())).append("</font>\n");
        markdown.append("> **检测时间**: <font color=\"comment\">").append(time).append("</font>\n");
        markdown.append("> **检测算法**: <font color=\"comment\">").append(alert.getAlgorithm()).append("</font>\n");
        markdown.append("> **异常分数**: <font color=\"comment\">").append(String.format("%.4f", alert.getScore())).append("</font>\n");
        markdown.append("> **阈值**: <font color=\"comment\">").append(String.format("%.2f", alert.getThreshold())).append("</font>\n");
        markdown.append("> **数据来源**: <font color=\"comment\">").append(alert.getSource()).append("</font>\n\n");
        
        markdown.append("**详细信息**: ").append(alert.getMessage()).append("\n\n");

        if (alert.getRootCauseAnalysis() != null) {
            RootCauseAnalyzer.RootCauseAnalysis rca = alert.getRootCauseAnalysis();
            
            markdown.append("---\n\n");
            markdown.append("## 🧠 根因分析\n\n");
            
            markdown.append("> **严重级别**: <font color=\"").append(getSeverityColor(rca.getSeverityLevel()).append("\">")
                .append(getSeverityText(rca.getSeverityLevel())).append("</font>\n");
            markdown.append("> **置信度**: <font color=\"info\">").append(String.format("%.1f%%", rca.getConfidence() * 100)).append("</font>\n\n");

            List<RootCauseAnalyzer.ScoredCause> causes = rca.getPossibleCauses();
            if (causes != null && !causes.isEmpty()) {
                markdown.append("### 🔍 可能的原因\n\n");
                for (int i = 0; i < Math.min(3, causes.size()); i++) {
                    RootCauseAnalyzer.ScoredCause cause = causes.get(i);
                    markdown.append(String.format("**%d. %s** (匹配度: %.1f%%)\n", 
                        i + 1, cause.getPatternName(), cause.getTotalScore() * 100);
                    
                    List<String> possibleCauses = cause.getPossibleCauses();
                    if (possibleCauses != null && !possibleCauses.isEmpty()) {
                        markdown.append("可能原因: ");
                        for (int j = 0; j < Math.min(3, possibleCauses.size()); j++) {
                            if (j > 0) markdown.append("、");
                            markdown.append(possibleCauses.get(j));
                        }
                        markdown.append("\n\n");
                    }
                }
            }

            List<String> suggestions = rca.getSuggestions();
            if (suggestions != null && !suggestions.isEmpty()) {
                markdown.append("### 💡 建议处理方案\n\n");
                for (int i = 0; i < Math.min(5, suggestions.size()); i++) {
                    markdown.append(suggestions.get(i)).append("\n\n");
                }
            }
        }

        Map<String, Object> message = new HashMap<>();
        message.put("msgtype", "markdown");
        Map<String, String> markdownContent = new HashMap<>();
        markdownContent.put("content", markdown.toString());
        message.put("markdown", markdownContent);

        String json = JSON.toJSONString(message);

        RequestBody body = RequestBody.create(
            MediaType.parse("application/json"), json
        );

        Request request = new Request.Builder()
            .url(webhookUrl)
            .post(body)
            .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("WeChat webhook call failed: " + response);
            }
            log.info("WeChat alert sent for metric: {}", alert.getMetricId());
        }
    }

    private String getSeverityColor(String severity) {
        if (severity == null) return "warning";
        switch (severity) {
            case "CRITICAL": return "red";
            case "HIGH": return "warning";
            case "MEDIUM": return "gold";
            case "LOW": return "green";
            default: return "comment";
        }
    }

    private String getSeverityText(String severity) {
        if (severity == null) return "未知";
        switch (severity) {
            case "CRITICAL": return "严重 🔴";
            case "HIGH": return "高 🟠";
            case "MEDIUM": return "中 🟡";
            case "LOW": return "低 🟢";
            default: return "未知 ⚪";
        }
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }
}
