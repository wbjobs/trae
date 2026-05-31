package com.reconciliation.store;

import com.reconciliation.model.ReconciliationResult;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.stream.Collectors;

public class InMemoryResultStore implements ReconciliationResultStore {

    private final ConcurrentLinkedDeque<ReconciliationResult> store;
    private final int maxSize;

    public InMemoryResultStore(int maxSize) {
        this.maxSize = maxSize;
        this.store = new ConcurrentLinkedDeque<>();
    }

    @Override
    public void store(ReconciliationResult result) {
        storeIfAbsent(result);
    }

    @Override
    public synchronized boolean storeIfAbsent(ReconciliationResult result) {
        String resultId = result.getResultId();
        if (exists(resultId)) {
            return false;
        }
        store.addFirst(result);
        while (store.size() > maxSize) {
            store.pollLast();
        }
        return true;
    }

    @Override
    public boolean exists(String resultId) {
        if (resultId == null) {
            return false;
        }
        return store.stream()
                .anyMatch(r -> resultId.equals(r.getResultId()));
    }

    @Override
    public ReconciliationResult queryByWindow(long windowStart, long windowEnd) {
        return store.stream()
                .filter(r -> r.getWindowStart() == windowStart && r.getWindowEnd() == windowEnd)
                .findFirst()
                .orElse(null);
    }

    @Override
    public List<ReconciliationResult> queryByTimeRange(long fromTime, long toTime) {
        return store.stream()
                .filter(r -> r.getWindowStart() >= fromTime && r.getWindowEnd() <= toTime)
                .sorted(Comparator.comparingLong(ReconciliationResult::getWindowStart).reversed())
                .collect(Collectors.toList());
    }

    @Override
    public List<ReconciliationResult> queryLatest(int count) {
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
