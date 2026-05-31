package com.reconciliation.model;

import java.io.Serializable;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

public class DelayDistributionStats implements Serializable {

    private static final long serialVersionUID = 1L;

    private final Map<String, AtomicLong> bucketCounts = new ConcurrentHashMap<>();
    private final AtomicLong totalAlerts = new AtomicLong(0);
    private final AtomicLong totalTimeouts = new AtomicLong(0);
    private final AtomicLong totalResolved = new AtomicLong(0);
    private final AtomicLong totalDelayMs = new AtomicLong(0);

    public DelayDistributionStats() {
        for (String bucket : new String[]{"<1s", "1s-5s", "5s-30s", "30s-1m", "1m-5m", "5m-10m", ">10m"}) {
            bucketCounts.put(bucket, new AtomicLong(0));
        }
    }

    public void recordAlert(DelayAlertEvent alert) {
        totalAlerts.incrementAndGet();

        if (alert.getType() == DelayAlertEvent.AlertType.TIMEOUT_TRIGGERED) {
            totalTimeouts.incrementAndGet();
        } else if (alert.getType() == DelayAlertEvent.AlertType.DELAY_RESOLVED) {
            totalResolved.incrementAndGet();
        }

        String bucket = alert.getDelayBucket();
        bucketCounts.computeIfAbsent(bucket, k -> new AtomicLong(0)).incrementAndGet();
        totalDelayMs.addAndGet(alert.getDelayMs());
    }

    public Map<String, Long> getBucketCountsSnapshot() {
        Map<String, Long> snapshot = new java.util.TreeMap<>();
        for (Map.Entry<String, AtomicLong> entry : bucketCounts.entrySet()) {
            snapshot.put(entry.getKey(), entry.getValue().get());
        }
        return snapshot;
    }

    public long getTotalAlerts() {
        return totalAlerts.get();
    }

    public long getTotalTimeouts() {
        return totalTimeouts.get();
    }

    public long getTotalResolved() {
        return totalResolved.get();
    }

    public double getAverageDelayMs() {
        long resolved = totalResolved.get();
        if (resolved == 0) return 0.0;
        return (double) totalDelayMs.get() / resolved;
    }

    public void reset() {
        for (AtomicLong count : bucketCounts.values()) {
            count.set(0);
        }
        totalAlerts.set(0);
        totalTimeouts.set(0);
        totalResolved.set(0);
        totalDelayMs.set(0);
    }
}
