package com.reconciliation.model;

import java.io.Serializable;

public class DelayAlertEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    public enum AlertType {
        DELAY_DETECTED,
        DELAY_RESOLVED,
        TIMEOUT_TRIGGERED
    }

    private String alertId;
    private String orderId;
    private AlertType type;
    private long detectedAt;
    private long aReceivedAt;
    private Long bReceivedAt;
    private long delayMs;
    private String delayBucket;
    private String source;

    public DelayAlertEvent() {}

    public DelayAlertEvent(String orderId, AlertType type, long detectedAt, long aReceivedAt, Long bReceivedAt) {
        this.orderId = orderId;
        this.type = type;
        this.detectedAt = detectedAt;
        this.aReceivedAt = aReceivedAt;
        this.bReceivedAt = bReceivedAt;
        this.delayMs = bReceivedAt != null ? (bReceivedAt - aReceivedAt) : (detectedAt - aReceivedAt);
        this.delayBucket = calculateDelayBucket(this.delayMs);
        this.alertId = generateAlertId(orderId, type);
    }

    public static String generateAlertId(String orderId, AlertType type) {
        return orderId + "_" + type.name();
    }

    public static String calculateDelayBucket(long delayMs) {
        if (delayMs < 1000) return "<1s";
        if (delayMs < 5000) return "1s-5s";
        if (delayMs < 30000) return "5s-30s";
        if (delayMs < 60000) return "30s-1m";
        if (delayMs < 300000) return "1m-5m";
        if (delayMs < 600000) return "5m-10m";
        return ">10m";
    }

    public String getAlertId() {
        return alertId;
    }

    public void setAlertId(String alertId) {
        this.alertId = alertId;
    }

    public String getOrderId() {
        return orderId;
    }

    public void setOrderId(String orderId) {
        this.orderId = orderId;
    }

    public AlertType getType() {
        return type;
    }

    public void setType(AlertType type) {
        this.type = type;
    }

    public long getDetectedAt() {
        return detectedAt;
    }

    public void setDetectedAt(long detectedAt) {
        this.detectedAt = detectedAt;
    }

    public long getaReceivedAt() {
        return aReceivedAt;
    }

    public void setaReceivedAt(long aReceivedAt) {
        this.aReceivedAt = aReceivedAt;
    }

    public Long getbReceivedAt() {
        return bReceivedAt;
    }

    public void setbReceivedAt(Long bReceivedAt) {
        this.bReceivedAt = bReceivedAt;
    }

    public long getDelayMs() {
        return delayMs;
    }

    public void setDelayMs(long delayMs) {
        this.delayMs = delayMs;
        this.delayBucket = calculateDelayBucket(delayMs);
    }

    public String getDelayBucket() {
        return delayBucket;
    }

    public void setDelayBucket(String delayBucket) {
        this.delayBucket = delayBucket;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    @Override
    public String toString() {
        return "DelayAlertEvent{" +
                "alertId='" + alertId + '\'' +
                ", orderId='" + orderId + '\'' +
                ", type=" + type +
                ", delayMs=" + delayMs +
                ", delayBucket='" + delayBucket + '\'' +
                '}';
    }
}
