package com.reconciliation.store;

import com.reconciliation.model.DelayAlertEvent;

import java.util.List;

public interface DelayAlertStore {

    void store(DelayAlertEvent alert);

    DelayAlertEvent queryByOrderId(String orderId);

    List<DelayAlertEvent> queryByType(DelayAlertEvent.AlertType type, int count);

    List<DelayAlertEvent> queryByTimeRange(long fromTime, long toTime);

    List<DelayAlertEvent> queryLatest(int count);

    int size();

    void clear();
}
