package com.reconciliation.store;

import com.reconciliation.model.DelayAlertEvent;

import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.stream.Collectors;

public class InMemoryDelayAlertStore implements DelayAlertStore {

    private final ConcurrentLinkedDeque<DelayAlertEvent> store;
    private final int maxSize;

    public InMemoryDelayAlertStore(int maxSize) {
        this.maxSize = maxSize;
        this.store = new ConcurrentLinkedDeque<>();
    }

    @Override
    public synchronized void store(DelayAlertEvent alert) {
        store.addFirst(alert);
        while (store.size() > maxSize) {
            store.pollLast();
        }
    }

    @Override
    public DelayAlertEvent queryByOrderId(String orderId) {
        return store.stream()
                .filter(a -> orderId.equals(a.getOrderId()))
                .findFirst()
                .orElse(null);
    }

    @Override
    public List<DelayAlertEvent> queryByType(DelayAlertEvent.AlertType type, int count) {
        return store.stream()
                .filter(a -> type == null || type.equals(a.getType()))
                .limit(count)
                .collect(Collectors.toList());
    }

    @Override
    public List<DelayAlertEvent> queryByTimeRange(long fromTime, long toTime) {
        return store.stream()
                .filter(a -> a.getDetectedAt() >= fromTime && a.getDetectedAt() <= toTime)
                .sorted(Comparator.comparingLong(DelayAlertEvent::getDetectedAt).reversed())
                .collect(Collectors.toList());
    }

    @Override
    public List<DelayAlertEvent> queryLatest(int count) {
        return store.stream()
                .limit(count)
                .collect(Collectors.toList());
    }

    @Override
    public int size() {
        return store.size();
    }

    @Override
    public void clear() {
        store.clear();
    }
}
