package com.reconciliation.config;

import java.io.Serializable;

public class ReconciliationConfig implements Serializable {

    private static final long serialVersionUID = 1L;

    private String pulsarServiceUrl = "pulsar://localhost:6650";
    private String topicA = "persistent://public/default/orders-dc-a";
    private String topicB = "persistent://public/default/orders-dc-b";
    private String subscriptionName = "reconciliation-sub";
    private long windowSizeSeconds = 60;
    private String rocksDbPath = "file:///tmp/flink/rocksdb";
    private int httpPort = 8080;
    private int checkpointIntervalMs = 60000;
    private int maxHistorySize = 1000;
    private int dedupStateTtlHours = 24;
    private long delayThresholdSeconds = 300;
    private String alertTopic = "persistent://public/default/reconciliation-alerts";
    private int alertHistorySize = 500;

    public ReconciliationConfig() {}

    public static ReconciliationConfig fromSystemProperties() {
        ReconciliationConfig config = new ReconciliationConfig();
        config.pulsarServiceUrl = System.getProperty("pulsar.service.url", config.pulsarServiceUrl);
        config.topicA = System.getProperty("pulsar.topic.a", config.topicA);
        config.topicB = System.getProperty("pulsar.topic.b", config.topicB);
        config.subscriptionName = System.getProperty("pulsar.subscription", config.subscriptionName);
        config.windowSizeSeconds = Long.getLong("window.size.seconds", config.windowSizeSeconds);
        config.rocksDbPath = System.getProperty("rocksdb.path", config.rocksDbPath);
        config.httpPort = Integer.getInteger("http.port", config.httpPort);
        config.checkpointIntervalMs = Integer.getInteger("checkpoint.interval.ms", config.checkpointIntervalMs);
        config.maxHistorySize = Integer.getInteger("history.max.size", config.maxHistorySize);
        config.dedupStateTtlHours = Integer.getInteger("dedup.state.ttl.hours", config.dedupStateTtlHours);
        config.delayThresholdSeconds = Long.getLong("delay.threshold.seconds", config.delayThresholdSeconds);
        config.alertTopic = System.getProperty("alert.topic", config.alertTopic);
        config.alertHistorySize = Integer.getInteger("alert.history.size", config.alertHistorySize);
        return config;
    }

    public String getPulsarServiceUrl() {
        return pulsarServiceUrl;
    }

    public void setPulsarServiceUrl(String pulsarServiceUrl) {
        this.pulsarServiceUrl = pulsarServiceUrl;
    }

    public String getTopicA() {
        return topicA;
    }

    public void setTopicA(String topicA) {
        this.topicA = topicA;
    }

    public String getTopicB() {
        return topicB;
    }

    public void setTopicB(String topicB) {
        this.topicB = topicB;
    }

    public String getSubscriptionName() {
        return subscriptionName;
    }

    public void setSubscriptionName(String subscriptionName) {
        this.subscriptionName = subscriptionName;
    }

    public long getWindowSizeSeconds() {
        return windowSizeSeconds;
    }

    public void setWindowSizeSeconds(long windowSizeSeconds) {
        this.windowSizeSeconds = windowSizeSeconds;
    }

    public String getRocksDbPath() {
        return rocksDbPath;
    }

    public void setRocksDbPath(String rocksDbPath) {
        this.rocksDbPath = rocksDbPath;
    }

    public int getHttpPort() {
        return httpPort;
    }

    public void setHttpPort(int httpPort) {
        this.httpPort = httpPort;
    }

    public int getCheckpointIntervalMs() {
        return checkpointIntervalMs;
    }

    public void setCheckpointIntervalMs(int checkpointIntervalMs) {
        this.checkpointIntervalMs = checkpointIntervalMs;
    }

    public int getMaxHistorySize() {
        return maxHistorySize;
    }

    public void setMaxHistorySize(int maxHistorySize) {
        this.maxHistorySize = maxHistorySize;
    }

    public int getDedupStateTtlHours() {
        return dedupStateTtlHours;
    }

    public void setDedupStateTtlHours(int dedupStateTtlHours) {
        this.dedupStateTtlHours = dedupStateTtlHours;
    }

    public long getDelayThresholdSeconds() {
        return delayThresholdSeconds;
    }

    public void setDelayThresholdSeconds(long delayThresholdSeconds) {
        this.delayThresholdSeconds = delayThresholdSeconds;
    }

    public String getAlertTopic() {
        return alertTopic;
    }

    public void setAlertTopic(String alertTopic) {
        this.alertTopic = alertTopic;
    }

    public int getAlertHistorySize() {
        return alertHistorySize;
    }

    public void setAlertHistorySize(int alertHistorySize) {
        this.alertHistorySize = alertHistorySize;
    }
}
