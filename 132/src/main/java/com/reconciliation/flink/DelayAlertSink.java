package com.reconciliation.flink;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.reconciliation.model.DelayAlertEvent;
import com.reconciliation.model.DelayDistributionStats;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.sink.RichSinkFunction;
import org.apache.pulsar.client.api.Producer;
import org.apache.pulsar.client.api.PulsarClient;
import org.apache.pulsar.client.api.PulsarClientException;
import org.apache.pulsar.client.api.Schema;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class DelayAlertSink extends RichSinkFunction<DelayAlertEvent> {

    private static final long serialVersionUID = 1L;
    private static final Logger LOG = LoggerFactory.getLogger(DelayAlertSink.class);
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule());

    private final String pulsarServiceUrl;
    private final String alertTopic;

    private static volatile DelayDistributionStats sharedStats;
    private static volatile PulsarClient pulsarClient;
    private static volatile Producer<byte[]> producer;

    public DelayAlertSink(String pulsarServiceUrl, String alertTopic) {
        this.pulsarServiceUrl = pulsarServiceUrl;
        this.alertTopic = alertTopic;
    }

    public static void setSharedStats(DelayDistributionStats stats) {
        sharedStats = stats;
    }

    public static DelayDistributionStats getSharedStats() {
        return sharedStats;
    }

    @Override
    public void open(Configuration parameters) throws Exception {
        if (pulsarClient == null) {
            synchronized (DelayAlertSink.class) {
                if (pulsarClient == null) {
                    pulsarClient = PulsarClient.builder()
                            .serviceUrl(pulsarServiceUrl)
                            .build();
                    producer = pulsarClient.newProducer(Schema.BYTES)
                            .topic(alertTopic)
                            .blockIfQueueFull(true)
                            .enableBatching(true)
                            .batchingMaxMessages(1000)
                            .batchingMaxPublishDelay(1, java.util.concurrent.TimeUnit.MILLISECONDS)
                            .create();
                }
            }
        }
    }

    @Override
    public void invoke(DelayAlertEvent alert, Context context) throws Exception {
        if (sharedStats != null) {
            sharedStats.recordAlert(alert);
        }

        if (producer != null) {
            try {
                byte[] bytes = MAPPER.writeValueAsBytes(alert);
                producer.sendAsync(bytes)
                        .thenAccept(msgId -> LOG.debug("Alert sent to Pulsar: alertId={}, type={}",
                                alert.getAlertId(), alert.getType()))
                        .exceptionally(ex -> {
                            LOG.error("Failed to send alert to Pulsar: alertId={}", alert.getAlertId(), ex);
                            return null;
                        });
            } catch (Exception e) {
                LOG.error("Error serializing alert: {}", alert, e);
            }
        } else {
            LOG.warn("Pulsar producer not initialized, alert not sent: {}", alert);
        }

        if (alert.getType() == DelayAlertEvent.AlertType.TIMEOUT_TRIGGERED) {
            LOG.warn("TIMEOUT ALERT: orderId={}, delayMs={}, bucket={}",
                    alert.getOrderId(), alert.getDelayMs(), alert.getDelayBucket());
        } else if (alert.getType() == DelayAlertEvent.AlertType.DELAY_RESOLVED) {
            LOG.info("DELAY RESOLVED: orderId={}, delayMs={}, bucket={}",
                    alert.getOrderId(), alert.getDelayMs(), alert.getDelayBucket());
        }
    }

    @Override
    public void close() {
        try {
            if (producer != null) {
                producer.close();
                producer = null;
            }
            if (pulsarClient != null) {
                pulsarClient.close();
                pulsarClient = null;
            }
        } catch (PulsarClientException e) {
            LOG.error("Error closing Pulsar producer/client", e);
        }
    }
}
