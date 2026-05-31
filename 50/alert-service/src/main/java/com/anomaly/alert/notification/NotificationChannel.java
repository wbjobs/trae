package com.anomaly.alert.notification;

import com.anomaly.alert.model.AnomalyAlert;

public interface NotificationChannel {
    String getName();
    void send(AnomalyAlert alert) throws Exception;
    boolean isEnabled();
}
