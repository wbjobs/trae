package com.anomaly.websocket.handler;

import com.alibaba.fastjson.JSON;
import com.anomaly.websocket.model.AnomalyResult;
import com.anomaly.websocket.model.RootCauseAnalysisResult;
import com.anomaly.websocket.model.StatisticsData;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;

import java.io.IOException;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Component
public class AnomalyWebSocketHandler implements WebSocketHandler {

    private final CopyOnWriteArraySet<WebSocketSession> sessions = new CopyOnWriteArraySet<>();
    private final AtomicInteger connectionCount = new AtomicInteger(0);
    private final AtomicLong totalAnomalies = new AtomicLong(0);
    private final AtomicLong totalMessages = new AtomicLong(0);

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        sessions.add(session);
        int count = connectionCount.incrementAndGet();
        log.info("New WebSocket connection established. Total: {}", count);
    }

    @Override
    public void handleMessage(WebSocketSession session, WebSocketMessage<?> message) throws Exception {
        log.debug("Received message from client: {}", message.getPayload());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.error("WebSocket transport error", exception);
        if (session.isOpen()) {
            session.close();
        }
        sessions.remove(session);
        connectionCount.decrementAndGet();
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus) throws Exception {
        sessions.remove(session);
        int count = connectionCount.decrementAndGet();
        log.info("WebSocket connection closed. Total: {}", count);
    }

    @Override
    public boolean supportsPartialMessages() {
        return false;
    }

    public void broadcastAnomaly(AnomalyResult anomaly) {
        totalMessages.incrementAndGet();
        if (anomaly.isAnomaly()) {
            totalAnomalies.incrementAndGet();
        }

        String message = JSON.toJSONString(anomaly);
        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                try {
                    session.sendMessage(new TextMessage(message));
                } catch (IOException e) {
                    log.error("Failed to send message to session", e);
                }
            }
        }
    }

    public void broadcastStatistics(StatisticsData stats) {
        String message = JSON.toJSONString(stats);
        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                try {
                    session.sendMessage(new TextMessage(message));
                } catch (IOException e) {
                    log.error("Failed to send stats to session", e);
                }
            }
        }
    }

    public void broadcastRootCause(RootCauseAnalysisResult rootCause) {
        String message = JSON.toJSONString(rootCause);
        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                try {
                    session.sendMessage(new TextMessage(message));
                } catch (IOException e) {
                    log.error("Failed to send root cause to session", e);
                }
            }
        }
    }

    public int getConnectionCount() {
        return connectionCount.get();
    }

    public long getTotalAnomalies() {
        return totalAnomalies.get();
    }

    public long getTotalMessages() {
        return totalMessages.get();
    }
}
