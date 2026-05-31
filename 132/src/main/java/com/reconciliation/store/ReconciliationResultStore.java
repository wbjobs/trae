package com.reconciliation.store;

import com.reconciliation.model.ReconciliationResult;

import java.util.List;

public interface ReconciliationResultStore {

    void store(ReconciliationResult result);

    boolean storeIfAbsent(ReconciliationResult result);

    boolean exists(String resultId);

    ReconciliationResult queryByWindow(long windowStart, long windowEnd);

    List<ReconciliationResult> queryByTimeRange(long fromTime, long toTime);

    List<ReconciliationResult> queryLatest(int count);

    int size();

    void clear();
}
