package com.reconciliation.model;

import java.io.Serializable;
import java.util.List;

public class ReconciliationResult implements Serializable {

    private static final long serialVersionUID = 1L;

    private String resultId;
    private long windowStart;
    private long windowEnd;
    private List<OrderEvent> missingOrders;

    public ReconciliationResult() {}

    public ReconciliationResult(long windowStart, long windowEnd, List<OrderEvent> missingOrders) {
        this.resultId = generateResultId(windowStart, windowEnd);
        this.windowStart = windowStart;
        this.windowEnd = windowEnd;
        this.missingOrders = missingOrders;
    }

    public static String generateResultId(long windowStart, long windowEnd) {
        return windowStart + "_" + windowEnd;
    }

    public long getWindowStart() {
        return windowStart;
    }

    public void setWindowStart(long windowStart) {
        this.windowStart = windowStart;
        this.resultId = generateResultId(windowStart, this.windowEnd);
    }

    public long getWindowEnd() {
        return windowEnd;
    }

    public void setWindowEnd(long windowEnd) {
        this.windowEnd = windowEnd;
        this.resultId = generateResultId(this.windowStart, windowEnd);
    }

    public String getResultId() {
        return resultId;
    }

    public void setResultId(String resultId) {
        this.resultId = resultId;
    }

    public List<OrderEvent> getMissingOrders() {
        return missingOrders;
    }

    public void setMissingOrders(List<OrderEvent> missingOrders) {
        this.missingOrders = missingOrders;
    }

    public int getMissingCount() {
        return missingOrders != null ? missingOrders.size() : 0;
    }

    @Override
    public String toString() {
        return "ReconciliationResult{" +
                "resultId='" + resultId + '\'' +
                ", windowStart=" + windowStart +
                ", windowEnd=" + windowEnd +
                ", missingCount=" + getMissingCount() +
                '}';
    }
}
