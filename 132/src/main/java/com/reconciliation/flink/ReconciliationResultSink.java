package com.reconciliation.flink;

import com.reconciliation.model.ReconciliationResult;
import com.reconciliation.store.ReconciliationResultStore;
import org.apache.flink.streaming.api.functions.sink.SinkFunction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ReconciliationResultSink implements SinkFunction<ReconciliationResult> {

    private static final long serialVersionUID = 1L;
    private static final Logger LOG = LoggerFactory.getLogger(ReconciliationResultSink.class);

    private static volatile ReconciliationResultStore sharedStore;

    public static void setSharedStore(ReconciliationResultStore store) {
        sharedStore = store;
    }

    @Override
    public void invoke(ReconciliationResult value, Context context) {
        if (sharedStore != null) {
            String resultId = value.getResultId();
            boolean stored = sharedStore.storeIfAbsent(value);
            if (stored) {
                LOG.info("Stored new reconciliation result: resultId={}, windowStart={}, windowEnd={}, missingCount={}",
                        resultId, value.getWindowStart(), value.getWindowEnd(), value.getMissingCount());
            } else {
                LOG.info("Result already exists, skipped (idempotent): resultId={}, windowStart={}, windowEnd={}",
                        resultId, value.getWindowStart(), value.getWindowEnd());
            }
        } else {
            LOG.warn("Shared store not set. Result will be lost: {}", value);
        }
    }
}
