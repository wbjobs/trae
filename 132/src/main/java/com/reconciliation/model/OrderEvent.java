package com.reconciliation.model;

import java.io.Serializable;
import java.util.Objects;

public class OrderEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    private String orderId;
    private String userId;
    private long amount;
    private long eventTime;
    private String source;
    private String messageId;
    private boolean isDuplicate = false;

    public OrderEvent() {}

    public OrderEvent(String orderId, String userId, long amount, long eventTime, String source) {
        this.orderId = orderId;
        this.userId = userId;
        this.amount = amount;
        this.eventTime = eventTime;
        this.source = source;
    }

    public OrderEvent(String orderId, String userId, long amount, long eventTime, String source, String messageId) {
        this.orderId = orderId;
        this.userId = userId;
        this.amount = amount;
        this.eventTime = eventTime;
        this.source = source;
        this.messageId = messageId;
    }

    public String getOrderId() {
        return orderId;
    }

    public void setOrderId(String orderId) {
        this.orderId = orderId;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public long getAmount() {
        return amount;
    }

    public void setAmount(long amount) {
        this.amount = amount;
    }

    public long getEventTime() {
        return eventTime;
    }

    public void setEventTime(long eventTime) {
        this.eventTime = eventTime;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getMessageId() {
        return messageId;
    }

    public void setMessageId(String messageId) {
        this.messageId = messageId;
    }

    public boolean isDuplicate() {
        return isDuplicate;
    }

    public void setDuplicate(boolean duplicate) {
        isDuplicate = duplicate;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        OrderEvent that = (OrderEvent) o;
        return amount == that.amount
                && eventTime == that.eventTime
                && Objects.equals(orderId, that.orderId)
                && Objects.equals(userId, that.userId)
                && Objects.equals(source, that.source)
                && Objects.equals(messageId, that.messageId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(orderId, userId, amount, eventTime, source, messageId);
    }

    @Override
    public String toString() {
        return "OrderEvent{" +
                "orderId='" + orderId + '\'' +
                ", userId='" + userId + '\'' +
                ", amount=" + amount +
                ", eventTime=" + eventTime +
                ", source='" + source + '\'' +
                ", messageId='" + messageId + '\'' +
                ", isDuplicate=" + isDuplicate +
                '}';
    }
}
