package com.reconciliation.http;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.reconciliation.model.DelayAlertEvent;
import com.reconciliation.model.DelayDistributionStats;
import com.reconciliation.model.ReconciliationResult;
import com.reconciliation.store.DelayAlertStore;
import com.reconciliation.store.ReconciliationResultStore;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.Executors;

public class QueryHttpServer {

    private static final Logger LOG = LoggerFactory.getLogger(QueryHttpServer.class);
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private final HttpServer server;
    private final ReconciliationResultStore store;
    private final DelayAlertStore alertStore;
    private final DelayDistributionStats delayStats;
    private final int port;

    public QueryHttpServer(int port, ReconciliationResultStore store,
                           DelayAlertStore alertStore, DelayDistributionStats delayStats) throws IOException {
        this.port = port;
        this.store = store;
        this.alertStore = alertStore;
        this.delayStats = delayStats;
        this.server = HttpServer.create(new InetSocketAddress(port), 0);
        this.server.setExecutor(Executors.newFixedThreadPool(4));

        server.createContext("/api/reconciliation/latest", new LatestResultsHandler());
        server.createContext("/api/reconciliation/window", new WindowQueryHandler());
        server.createContext("/api/reconciliation/range", new TimeRangeHandler());
        server.createContext("/api/reconciliation/summary", new SummaryHandler());

        server.createContext("/api/alerts/latest", new LatestAlertsHandler());
        server.createContext("/api/alerts/timeout", new TimeoutAlertsHandler());
        server.createContext("/api/alerts/order", new AlertByOrderHandler());
        server.createContext("/api/alerts/range", new AlertRangeHandler());
        server.createContext("/api/alerts/distribution", new AlertDistributionHandler());

        server.createContext("/health", new HealthHandler());
    }

    public void start() {
        server.start();
        LOG.info("HTTP Query Server started on port {}", port);
    }

    public void stop(int delay) {
        server.stop(delay);
        LOG.info("HTTP Query Server stopped");
    }

    private Map<String, Object> resultToMap(ReconciliationResult r) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("resultId", r.getResultId());
        map.put("windowStart", r.getWindowStart());
        map.put("windowStartStr", formatTime(r.getWindowStart()));
        map.put("windowEnd", r.getWindowEnd());
        map.put("windowEndStr", formatTime(r.getWindowEnd()));
        map.put("missingCount", r.getMissingCount());
        map.put("missingOrders", r.getMissingOrders() != null ? r.getMissingOrders() : Collections.emptyList());
        return map;
    }

    private Map<String, Object> alertToMap(DelayAlertEvent a) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("alertId", a.getAlertId());
        map.put("orderId", a.getOrderId());
        map.put("type", a.getType().name());
        map.put("delayMs", a.getDelayMs());
        map.put("delayBucket", a.getDelayBucket());
        map.put("detectedAt", a.getDetectedAt());
        map.put("detectedAtStr", formatTime(a.getDetectedAt()));
        map.put("aReceivedAt", a.getaReceivedAt());
        map.put("aReceivedAtStr", formatTime(a.getaReceivedAt()));
        if (a.getbReceivedAt() != null) {
            map.put("bReceivedAt", a.getbReceivedAt());
            map.put("bReceivedAtStr", formatTime(a.getbReceivedAt()));
        }
        if (a.getSource() != null) {
            map.put("source", a.getSource());
        }
        return map;
    }

    private String formatTime(long epochMillis) {
        LocalDateTime ldt = LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMillis), ZoneId.systemDefault());
        return ldt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    private void sendJson(HttpExchange exchange, int statusCode, Object body) throws IOException {
        byte[] json = MAPPER.writeValueAsBytes(body);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, json.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(json);
        }
    }

    private Map<String, String> parseQueryParams(String query) {
        Map<String, String> params = new HashMap<>();
        if (query == null || query.isEmpty()) {
            return params;
        }
        for (String pair : query.split("&")) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2) {
                params.put(kv[0], kv[1]);
            }
        }
        return params;
    }

    private class LatestResultsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equals(exchange.getRequestMethod())) {
                sendJson(exchange, 405, Collections.singletonMap("error", "Method not allowed"));
                return;
            }
            Map<String, String> params = parseQueryParams(exchange.getRequestURI().getQuery());
            int count = Integer.parseInt(params.getOrDefault("count", "10"));
            List<ReconciliationResult> results = store.queryLatest(count);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("total", results.size());
            List<Map<String, Object>> items = new ArrayList<>();
            for (ReconciliationResult r : results) {
                items.add(resultToMap(r));
            }
            response.put("results", items);
            sendJson(exchange, 200, response);
        }
    }

    private class WindowQueryHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equals(exchange.getRequestMethod())) {
                sendJson(exchange, 405, Collections.singletonMap("error", "Method not allowed"));
                return;
            }
            Map<String, String> params = parseQueryParams(exchange.getRequestURI().getQuery());
            String startStr = params.get("start");
            String endStr = params.get("end");

            if (startStr == null || endStr == null) {
                sendJson(exchange, 400, Collections.singletonMap("error",
                        "Missing required parameters: start, end (epoch milliseconds)"));
                return;
            }

            long start = Long.parseLong(startStr);
            long end = Long.parseLong(endStr);
            ReconciliationResult result = store.queryByWindow(start, end);

            if (result == null) {
                sendJson(exchange, 404, Collections.singletonMap("message", "No result found for window"));
            } else {
                sendJson(exchange, 200, resultToMap(result));
            }
        }
    }

    private class TimeRangeHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equals(exchange.getRequestMethod())) {
                sendJson(exchange, 405, Collections.singletonMap("error", "Method not allowed"));
                return;
            }
            Map<String, String> params = parseQueryParams(exchange.getRequestURI().getQuery());
            String fromStr = params.get("from");
            String toStr = params.get("to");

            if (fromStr == null || toStr == null) {
                sendJson(exchange, 400, Collections.singletonMap("error",
                        "Missing required parameters: from, to (epoch milliseconds)"));
                return;
            }

            long from = Long.parseLong(fromStr);
            long to = Long.parseLong(toStr);
            List<ReconciliationResult> results = store.queryByTimeRange(from, to);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("total", results.size());
            List<Map<String, Object>> items = new ArrayList<>();
            for (ReconciliationResult r : results) {
                items.add(resultToMap(r));
            }
            response.put("results", items);
            sendJson(exchange, 200, response);
        }
    }

    private class SummaryHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equals(exchange.getRequestMethod())) {
                sendJson(exchange, 405, Collections.singletonMap("error", "Method not allowed"));
                return;
            }

            List<ReconciliationResult> all = store.queryLatest(store.size());
            int totalWindows = all.size();
            int totalMissing = 0;
            long maxMissingCount = 0;
            long windowWithMaxMissing = 0;

            for (ReconciliationResult r : all) {
                int mc = r.getMissingCount();
                totalMissing += mc;
                if (mc > maxMissingCount) {
                    maxMissingCount = mc;
                    windowWithMaxMissing = r.getWindowStart();
                }
            }

            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("totalWindows", totalWindows);
            summary.put("totalMissingOrders", totalMissing);
            summary.put("maxMissingCount", maxMissingCount);
            summary.put("windowWithMaxMissing", windowWithMaxMissing);
            summary.put("windowWithMaxMissingStr", formatTime(windowWithMaxMissing));

            if (totalWindows > 0) {
                summary.put("avgMissingPerWindow", String.format("%.2f", (double) totalMissing / totalWindows));
            } else {
                summary.put("avgMissingPerWindow", "0.00");
            }

            sendJson(exchange, 200, summary);
        }
    }

    private class LatestAlertsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equals(exchange.getRequestMethod())) {
                sendJson(exchange, 405, Collections.singletonMap("error", "Method not allowed"));
                return;
            }
            Map<String, String> params = parseQueryParams(exchange.getRequestURI().getQuery());
            int count = Integer.parseInt(params.getOrDefault("count", "20"));
            List<DelayAlertEvent> alerts = alertStore.queryLatest(count);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("total", alerts.size());
            List<Map<String, Object>> items = new ArrayList<>();
            for (DelayAlertEvent a : alerts) {
                items.add(alertToMap(a));
            }
            response.put("alerts", items);
            sendJson(exchange, 200, response);
        }
    }

    private class TimeoutAlertsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equals(exchange.getRequestMethod())) {
                sendJson(exchange, 405, Collections.singletonMap("error", "Method not allowed"));
                return;
            }
            Map<String, String> params = parseQueryParams(exchange.getRequestURI().getQuery());
            int count = Integer.parseInt(params.getOrDefault("count", "50"));
            List<DelayAlertEvent> alerts = alertStore.queryByType(
                    DelayAlertEvent.AlertType.TIMEOUT_TRIGGERED, count);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("total", alerts.size());
            List<Map<String, Object>> items = new ArrayList<>();
            for (DelayAlertEvent a : alerts) {
                items.add(alertToMap(a));
            }
            response.put("alerts", items);
            sendJson(exchange, 200, response);
        }
    }

    private class AlertByOrderHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equals(exchange.getRequestMethod())) {
                sendJson(exchange, 405, Collections.singletonMap("error", "Method not allowed"));
                return;
            }
            Map<String, String> params = parseQueryParams(exchange.getRequestURI().getQuery());
            String orderId = params.get("orderId");
            if (orderId == null || orderId.isEmpty()) {
                sendJson(exchange, 400, Collections.singletonMap("error", "Missing required parameter: orderId"));
                return;
            }
            DelayAlertEvent alert = alertStore.queryByOrderId(orderId);
            if (alert == null) {
                sendJson(exchange, 404, Collections.singletonMap("message", "No alert found for orderId"));
            } else {
                sendJson(exchange, 200, alertToMap(alert));
            }
        }
    }

    private class AlertRangeHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equals(exchange.getRequestMethod())) {
                sendJson(exchange, 405, Collections.singletonMap("error", "Method not allowed"));
                return;
            }
            Map<String, String> params = parseQueryParams(exchange.getRequestURI().getQuery());
            String fromStr = params.get("from");
            String toStr = params.get("to");
            if (fromStr == null || toStr == null) {
                sendJson(exchange, 400, Collections.singletonMap("error",
                        "Missing required parameters: from, to (epoch milliseconds)"));
                return;
            }
            long from = Long.parseLong(fromStr);
            long to = Long.parseLong(toStr);
            List<DelayAlertEvent> alerts = alertStore.queryByTimeRange(from, to);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("total", alerts.size());
            List<Map<String, Object>> items = new ArrayList<>();
            for (DelayAlertEvent a : alerts) {
                items.add(alertToMap(a));
            }
            response.put("alerts", items);
            sendJson(exchange, 200, response);
        }
    }

    private class AlertDistributionHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equals(exchange.getRequestMethod())) {
                sendJson(exchange, 405, Collections.singletonMap("error", "Method not allowed"));
                return;
            }

            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("totalAlerts", delayStats.getTotalAlerts());
            stats.put("totalTimeouts", delayStats.getTotalTimeouts());
            stats.put("totalResolved", delayStats.getTotalResolved());
            stats.put("averageDelayMs", String.format("%.2f", delayStats.getAverageDelayMs()));
            stats.put("bucketDistribution", delayStats.getBucketCountsSnapshot());
            stats.put("storedAlerts", alertStore.size());
            sendJson(exchange, 200, stats);
        }
    }

    private class HealthHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            Map<String, Object> health = new LinkedHashMap<>();
            health.put("status", "UP");
            health.put("timestamp", System.currentTimeMillis());
            health.put("storedResults", store.size());
            health.put("storedAlerts", alertStore.size());
            health.put("totalAlerts", delayStats.getTotalAlerts());
            health.put("totalTimeouts", delayStats.getTotalTimeouts());
            sendJson(exchange, 200, health);
        }
    }
}
