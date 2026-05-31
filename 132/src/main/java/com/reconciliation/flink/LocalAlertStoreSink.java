package com.reconciliation.flink;

import com.reconciliation.model.DelayAlertEvent;
import com.reconciliation.store.DelayAlertStore;
import org.apache.flink.streaming.api.functions.sink.SinkFunction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class LocalAlertStoreSink implements SinkFunction<DelayAlertEvent> {

    private static final long serialVersionUID = 1L;
    private static final Logger LOG = LoggerFactory.getLogger(LocalAlertStoreSink.class);

    private static volatile DelayAlertStore sharedStore;

    public static void setSharedStore(DelayAlertStore store) {
        sharedStore = store;
    }

    @Override
    public void invoke(DelayAlertEvent alert, Context context) {
        if (sharedStore != null) {
            sharedStore.store(alert);
            LOG.debug("Stored alert locally: alertId={}, type={}, delayMs={}",
                    alert.getAlertId(), alert.getType(), alert.getDelayMs());
        } else {
            LOG.warn("Shared alert store not set, alert not stored: {}", alert);
        }
    }
}
