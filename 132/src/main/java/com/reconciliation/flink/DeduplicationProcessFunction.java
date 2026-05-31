package com.reconciliation.flink;

import com.reconciliation.model.OrderEvent;
import org.apache.flink.api.common.state.StateTtlConfig;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.time.Time;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class DeduplicationProcessFunction
        extends KeyedProcessFunction<String, OrderEvent, OrderEvent> {

    private static final long serialVersionUID = 1L;
    private static final Logger LOG = LoggerFactory.getLogger(DeduplicationProcessFunction.class);

    private final int ttlHours;

    private transient ValueState<Boolean> processedState;

    public DeduplicationProcessFunction(int ttlHours) {
        this.ttlHours = ttlHours;
    }

    public DeduplicationProcessFunction() {
        this(24);
    }

    @Override
    public void open(Configuration parameters) {
        StateTtlConfig ttlConfig = StateTtlConfig
                .newBuilder(Time.hours(ttlHours))
                .setUpdateType(StateTtlConfig.UpdateType.OnCreateAndWrite)
                .setStateVisibility(StateTtlConfig.StateVisibility.NeverReturnExpired)
                .cleanupFullSnapshot()
                .build();

        ValueStateDescriptor<Boolean> descriptor = new ValueStateDescriptor<>(
                "processed-orders",
                Boolean.class
        );
        descriptor.enableTimeToLive(ttlConfig);

        processedState = getRuntimeContext().getState(descriptor);
    }

    @Override
    public void processElement(OrderEvent event, Context ctx, Collector<OrderEvent> out) throws Exception {
        String deduplicationKey = ctx.getCurrentKey();

        if (deduplicationKey == null || deduplicationKey.isEmpty()) {
            LOG.warn("Empty deduplication key, passing through: orderId={}, source={}",
                    event.getOrderId(), event.getSource());
            out.collect(event);
            return;
        }

        Boolean isProcessed = processedState.value();

        if (Boolean.TRUE.equals(isProcessed)) {
            event.setDuplicate(true);
            LOG.debug("Duplicate message detected, skipping: key={}, orderId={}, source={}, messageId={}",
                    deduplicationKey, event.getOrderId(), event.getSource(), event.getMessageId());
            return;
        }

        processedState.update(true);
        out.collect(event);
    }

    public static String getDeduplicationKey(OrderEvent event) {
        String messageId = event.getMessageId();
        if (messageId != null && !messageId.isEmpty()) {
            return event.getSource() + "_" + messageId;
        }
        return event.getSource() + "_" + event.getOrderId();
    }
}
