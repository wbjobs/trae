package com.reconciliation.flink;

import com.reconciliation.model.OrderEvent;
import com.reconciliation.model.ReconciliationResult;
import org.apache.flink.streaming.api.functions.windowing.WindowFunction;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ReconciliationWindowJoinFunction
        implements WindowFunction<OrderEvent, ReconciliationResult, String, TimeWindow> {

    private static final long serialVersionUID = 1L;

    @Override
    public void apply(String key, TimeWindow window, Iterable<OrderEvent> input,
                      Collector<ReconciliationResult> out) {
        Map<String, OrderEvent> ordersA = new HashMap<>();
        Map<String, OrderEvent> ordersB = new HashMap<>();

        for (OrderEvent event : input) {
            if ("A".equals(event.getSource())) {
                ordersA.put(event.getOrderId(), event);
            } else if ("B".equals(event.getSource())) {
                ordersB.put(event.getOrderId(), event);
            }
        }

        List<OrderEvent> missingOrders = new ArrayList<>();
        for (Map.Entry<String, OrderEvent> entry : ordersA.entrySet()) {
            if (!ordersB.containsKey(entry.getKey())) {
                missingOrders.add(entry.getValue());
            }
        }

        ReconciliationResult result = new ReconciliationResult(
                window.getStart(), window.getEnd(), missingOrders);
        out.collect(result);
    }
}
