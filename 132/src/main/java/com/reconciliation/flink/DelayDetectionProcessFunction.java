package com.reconciliation.flink;

import com.reconciliation.model.DelayAlertEvent;
import com.reconciliation.model.DelayAlertEvent.AlertType;
import com.reconciliation.model.OrderEvent;
import org.apache.flink.api.common.state.StateTtlConfig;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.time.Time;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;
import org.apache.flink.util.OutputTag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class DelayDetectionProcessFunction
        extends KeyedProcessFunction<String, OrderEvent, OrderEvent> {

    private static final long serialVersionUID = 1L;
    private static final Logger LOG = LoggerFactory.getLogger(DelayDetectionProcessFunction.class);

    public static final OutputTag<DelayAlertEvent> ALERT_OUTPUT_TAG =
            new OutputTag<DelayAlertEvent>("delay-alerts") {};

    private final long delayThresholdMs;

    private final int stateTtlHours;

    private transient ValueState<Long> aReceivedAtState;
    private transient ValueState<Long> bReceivedAtState;
    private transient ValueState<Boolean> alertedState;

    public DelayDetectionProcessFunction(long delayThresholdMs, int stateTtlHours) {
        this.delayThresholdMs = delayThresholdMs;
        this.stateTtlHours = stateTtlHours;
    }

    @Override
    public void open(Configuration parameters) {
        StateTtlConfig ttlConfig = StateTtlConfig
                .newBuilder(Time.hours(stateTtlHours))
                .setUpdateType(StateTtlConfig.UpdateType.OnCreateAndWrite)
                .setStateVisibility(StateTtlConfig.StateVisibility.NeverReturnExpired)
                .cleanupFullSnapshot()
                .build();

        ValueStateDescriptor<Long> aDesc = new ValueStateDescriptor<>("a-received-at", Long.class);
        aDesc.enableTimeToLive(ttlConfig);
        aReceivedAtState = getRuntimeContext().getState(aDesc);

        ValueStateDescriptor<Long> bDesc = new ValueStateDescriptor<>("b-received-at", Long.class);
        bDesc.enableTimeToLive(ttlConfig);
        bReceivedAtState = getRuntimeContext().getState(bDesc);

        ValueStateDescriptor<Boolean> alertedDesc = new ValueStateDescriptor<>("alerted", Boolean.class);
        alertedDesc.enableTimeToLive(ttlConfig);
        alertedState = getRuntimeContext().getState(alertedDesc);
    }

    @Override
    public void processElement(OrderEvent event, Context ctx, Collector<OrderEvent> out) throws Exception {
        String orderId = ctx.getCurrentKey();
        long eventTime = event.getEventTime();

        out.collect(event);

        if ("A".equals(event.getSource())) {
            if (aReceivedAtState.value() == null) {
                aReceivedAtState.update(eventTime);
                long timerTs = eventTime + delayThresholdMs;
                ctx.timerService().registerEventTimeTimer(timerTs);
                LOG.debug("Registered delay timer for orderId={}, timerAt={}", orderId, timerTs);
            }
        } else if ("B".equals(event.getSource())) {
            bReceivedAtState.update(eventTime);
            Long aReceivedAt = aReceivedAtState.value();

            if (aReceivedAt != null) {
                Boolean alerted = alertedState.value();
                if (!Boolean.TRUE.equals(alerted)) {
                    long delayMs = eventTime - aReceivedAt;
                    if (delayMs > 0) {
                        DelayAlertEvent resolvedAlert = new DelayAlertEvent(
                                orderId, AlertType.DELAY_RESOLVED, eventTime, aReceivedAt, eventTime);
                        ctx.output(ALERT_OUTPUT_TAG, resolvedAlert);
                        LOG.info("Delay resolved: orderId={}, delayMs={}, bucket={}",
                                orderId, delayMs, resolvedAlert.getDelayBucket());
                    }
                    alertedState.update(true);
                }
            }
        }
    }

    @Override
    public void onTimer(long timestamp, OnTimerContext ctx, Collector<OrderEvent> out) throws Exception {
        String orderId = ctx.getCurrentKey();
        Long aReceivedAt = aReceivedAtState.value();
        Long bReceivedAt = bReceivedAtState.value();
        Boolean alerted = alertedState.value();

        if (aReceivedAt != null && bReceivedAt == null && !Boolean.TRUE.equals(alerted)) {
            long delayMs = timestamp - aReceivedAt;
            DelayAlertEvent timeoutAlert = new DelayAlertEvent(
                    orderId, AlertType.TIMEOUT_TRIGGERED, timestamp, aReceivedAt, null);
            timeoutAlert.setSource("timeout-timer");
            ctx.output(ALERT_OUTPUT_TAG, timeoutAlert);
            alertedState.update(true);

            LOG.warn("Timeout triggered: orderId={}, aReceivedAt={}, delayMs={}, bucket={}",
                    orderId, aReceivedAt, delayMs, timeoutAlert.getDelayBucket());
        }
    }
}
