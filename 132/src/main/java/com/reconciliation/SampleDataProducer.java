package com.reconciliation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.reconciliation.model.OrderEvent;
import org.apache.pulsar.client.api.Producer;
import org.apache.pulsar.client.api.PulsarClient;
import org.apache.pulsar.client.api.PulsarClientException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Random;
import java.util.UUID;

public class SampleDataProducer {

    private static final Logger LOG = LoggerFactory.getLogger(SampleDataProducer.class);
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule());

    private final PulsarClient client;
    private final Producer<byte[]> producerA;
    private final Producer<byte[]> producerB;
    private final Random random = new Random();
    private final double duplicateRate;
    private final double delayedRate;
    private final long maxDelayMs;

    public SampleDataProducer(String serviceUrl, String topicA, String topicB) throws PulsarClientException {
        this(serviceUrl, topicA, topicB, 0.05, 0.1, 60000);
    }

    public SampleDataProducer(String serviceUrl, String topicA, String topicB,
                              double duplicateRate, double delayedRate, long maxDelayMs) throws PulsarClientException {
        this.client = PulsarClient.builder().serviceUrl(serviceUrl).build();
        this.producerA = client.newProducer().topic(topicA).create();
        this.producerB = client.newProducer().topic(topicB).create();
        this.duplicateRate = duplicateRate;
        this.delayedRate = delayedRate;
        this.maxDelayMs = maxDelayMs;
    }

    public void run(int eventCount, long intervalMs) throws Exception {
        LOG.info("Starting sample data producer with {} events, interval {}ms, " +
                        "duplicateRate {}, delayedRate {}, maxDelayMs {}",
                eventCount, intervalMs, duplicateRate, delayedRate, maxDelayMs);

        for (int i = 0; i < eventCount; i++) {
            String orderId = "ORDER-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
            String userId = "USER-" + (1000 + random.nextInt(9000));
            long amount = 1000L + random.nextInt(100000);
            long eventTime = System.currentTimeMillis();

            boolean sendToB = random.nextDouble() > 0.2;
            boolean sendDuplicateToA = random.nextDouble() < duplicateRate;
            boolean sendDuplicateToB = random.nextDouble() < duplicateRate;
            boolean sendDelayedB = sendToB && random.nextDouble() < delayedRate;

            OrderEvent eventA = new OrderEvent(orderId, userId, amount, eventTime, "A");
            byte[] bytesA = MAPPER.writeValueAsBytes(eventA);
            producerA.sendAsync(bytesA)
                    .thenAccept(msgId -> LOG.debug("Sent to A: {}", orderId))
                    .exceptionally(ex -> { LOG.error("Failed to send to A", ex); return null; });

            if (sendDuplicateToA) {
                Thread.sleep(50);
                producerA.sendAsync(bytesA)
                        .thenAccept(msgId -> LOG.info("Sent DUPLICATE to A: {}", orderId))
                        .exceptionally(ex -> { LOG.error("Failed to send duplicate to A", ex); return null; });
            }

            if (sendToB) {
                long delayMs = sendDelayedB ? (long) (random.nextDouble() * maxDelayMs) : 0;
                if (delayMs > 0) {
                    LOG.info("Will send {} to B with {}ms delay", orderId, delayMs);
                }

                long bEventTime = eventTime + delayMs;
                OrderEvent eventB = new OrderEvent(orderId, userId, amount, bEventTime, "B");
                byte[] bytesB = MAPPER.writeValueAsBytes(eventB);

                if (delayMs > 0) {
                    Thread.sleep(delayMs);
                }

                producerB.sendAsync(bytesB)
                        .thenAccept(msgId -> {
                            if (delayMs > 0) {
                                LOG.info("Sent DELAYED to B: {}, delayMs={}", orderId, delayMs);
                            } else {
                                LOG.debug("Sent to B: {}", orderId);
                            }
                        })
                        .exceptionally(ex -> { LOG.error("Failed to send to B", ex); return null; });

                if (sendDuplicateToB) {
                    Thread.sleep(50);
                    producerB.sendAsync(bytesB)
                            .thenAccept(msgId -> LOG.info("Sent DUPLICATE to B: {}", orderId))
                            .exceptionally(ex -> { LOG.error("Failed to send duplicate to B", ex); return null; });
                }
            } else {
                LOG.info("Skipping B for {} (simulating missing order, will trigger timeout after 5m)", orderId);
            }

            Thread.sleep(intervalMs);
        }

        LOG.info("Sample data producer finished");
        shutdown();
    }

    public void shutdown() throws PulsarClientException {
        producerA.close();
        producerB.close();
        client.close();
    }

    public static void main(String[] args) throws Exception {
        String serviceUrl = System.getProperty("pulsar.service.url", "pulsar://localhost:6650");
        String topicA = System.getProperty("pulsar.topic.a", "persistent://public/default/orders-dc-a");
        String topicB = System.getProperty("pulsar.topic.b", "persistent://public/default/orders-dc-b");
        int eventCount = Integer.getInteger("producer.event.count", 100);
        long intervalMs = Long.getLong("producer.interval.ms", 500);
        double duplicateRate = Double.parseDouble(System.getProperty("producer.duplicate.rate", "0.05"));
        double delayedRate = Double.parseDouble(System.getProperty("producer.delayed.rate", "0.1"));
        long maxDelayMs = Long.getLong("producer.max.delay.ms", 60000);

        SampleDataProducer producer = new SampleDataProducer(
                serviceUrl, topicA, topicB, duplicateRate, delayedRate, maxDelayMs);
        producer.run(eventCount, intervalMs);
    }
}
