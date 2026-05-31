package com.anomaly.alert.notification;

import com.anomaly.alert.model.AnomalyAlert;
import lombok.extern.slf4j.Slf4j;
import okhttp3.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;

@Slf4j
@Component
public class SmsNotification implements NotificationChannel {

    @Value("${alert.sms.enabled:false}")
    private boolean enabled;

    @Value("${alert.sms.api-url:}")
    private String apiUrl;

    @Value("${alert.sms.api-key:}")
    private String apiKey;

    @Value("${alert.sms.phone-numbers:}")
    private String phoneNumbers;

    private final OkHttpClient httpClient = new OkHttpClient();

    @Override
    public String getName() {
        return "sms";
    }

    @Override
    public void send(AnomalyAlert alert) throws Exception {
        if (!enabled || phoneNumbers.isEmpty()) {
            return;
        }

        SimpleDateFormat sdf = new SimpleDateFormat("HH:mm:ss");
        String time = sdf.format(new Date(alert.getTimestamp()));

        String content = String.format(
            "[异常告警] %s 值:%.2f 时间:%s 算法:%s",
            alert.getMetricId(),
            alert.getValue(),
            time,
            alert.getAlgorithm()
        );

        String json = String.format(
            "{\"apiKey\":\"%s\",\"phones\":\"%s\",\"content\":\"%s\"}",
            apiKey, phoneNumbers, content
        );

        RequestBody body = RequestBody.create(
            MediaType.parse("application/json"), json
        );

        Request request = new Request.Builder()
            .url(apiUrl)
            .post(body)
            .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("SMS API call failed: " + response);
            }
            log.info("SMS alert sent for metric: {}", alert.getMetricId());
        }
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }
}
