package com.iot.monitor.service;

import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
public class NotificationService {

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username}")
    private String fromEmail;

    @Value("${wechat.webhook-url}")
    private String wechatWebhookUrl;

    @Value("${alarm.notify-interval:300000}")
    private long notifyInterval;

    private final Map<String, Long> lastNotifyMap = new HashMap<>();

    public NotificationService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    @Async
    public void sendNotification(String notifyType, String content) {
        String cacheKey = notifyType + ":" + content.hashCode();
        Long lastTime = lastNotifyMap.get(cacheKey);
        if (lastTime != null && System.currentTimeMillis() - lastTime < notifyInterval) {
            return;
        }
        lastNotifyMap.put(cacheKey, System.currentTimeMillis());

        if (notifyType == null) {
            return;
        }

        String[] types = notifyType.split(",");
        for (String type : types) {
            try {
                switch (type.trim().toUpperCase()) {
                    case "EMAIL":
                        sendEmail(content);
                        break;
                    case "WECHAT":
                        sendWechat(content);
                        break;
                    default:
                        log.warn("Unknown notify type: {}", type);
                }
            } catch (Exception e) {
                log.error("Send notification failed, type: {}", type, e);
            }
        }
    }

    private void sendEmail(String content) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(fromEmail);
            message.setSubject("设备监控告警");
            message.setText(content);
            mailSender.send(message);
            log.info("Email notification sent");
        } catch (Exception e) {
            log.error("Send email failed", e);
        }
    }

    private void sendWechat(String content) {
        try {
            JSONObject message = new JSONObject();
            message.put("msgtype", "text");

            JSONObject text = new JSONObject();
            text.put("content", content);
            message.put("text", text);

            HttpResponse response = HttpRequest.post(wechatWebhookUrl)
                    .header("Content-Type", "application/json")
                    .body(JSON.toJSONString(message))
                    .execute();

            if (response.isOk()) {
                log.info("WeChat notification sent");
            } else {
                log.error("Send WeChat failed, response: {}", response.body());
            }
        } catch (Exception e) {
            log.error("Send WeChat notification failed", e);
        }
    }
}
