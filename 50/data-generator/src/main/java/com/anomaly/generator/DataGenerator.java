package com.anomaly.generator;

import com.alibaba.fastjson.JSON;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerRecord;

import java.util.HashMap;
import java.util.Map;
import java.util.Properties;
import java.util.Random;

public class DataGenerator {

    private static final String[] METRICS = {
        "cpu.usage",
        "memory.usage",
        "network.traffic",
        "disk.io",
        "response.time"
    };

    private static final String[] SOURCES = {"kafka", "mqtt"};

    public static void main(String[] args) throws InterruptedException {
        String kafkaBrokers = System.getenv().getOrDefault("KAFKA_BROKERS", "localhost:9093");
        String topic = System.getenv().getOrDefault("INPUT_TOPIC", "metrics-input");
        long interval = Long.parseLong(System.getenv().getOrDefault("INTERVAL_MS", "1000"));

        Properties props = new Properties();
        props.put("bootstrap.servers", kafkaBrokers);
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("acks", "1");

        Producer<String, String> producer = new KafkaProducer<>(props);
        Random random = new Random();

        Map<String, Double> metricBaselines = new HashMap<>();
        metricBaselines.put("cpu.usage", 45.0);
        metricBaselines.put("memory.usage", 60.0);
        metricBaselines.put("network.traffic", 100.0);
        metricBaselines.put("disk.io", 50.0);
        metricBaselines.put("response.time", 150.0);

        Map<String, Double> metricVolatility = new HashMap<>();
        metricVolatility.put("cpu.usage", 10.0);
        metricVolatility.put("memory.usage", 8.0);
        metricVolatility.put("network.traffic", 30.0);
        metricVolatility.put("disk.io", 15.0);
        metricVolatility.put("response.time", 50.0);

        System.out.println("Starting data generator...");
        System.out.println("Kafka brokers: " + kafkaBrokers);
        System.out.println("Topic: " + topic);
        System.out.println("Interval: " + interval + "ms");

        long count = 0;
        while (true) {
            for (String metric : METRICS) {
                double baseline = metricBaselines.get(metric);
                double volatility = metricVolatility.get(metric);
                double value = baseline + random.nextGaussian() * volatility;

                if (random.nextDouble() < 0.02) {
                    double anomalyMultiplier = 2.5 + random.nextDouble() * 2;
                    if (random.nextBoolean()) {
                        value = baseline + volatility * anomalyMultiplier;
                    } else {
                        value = Math.max(0, baseline - volatility * anomalyMultiplier);
                    }
                    System.out.printf("Generated anomaly for %s: %.2f%n", metric, value);
                }

                Map<String, Object> data = new HashMap<>();
                data.put("metricId", metric);
                data.put("value", Math.round(value * 100.0) / 100.0);
                data.put("timestamp", System.currentTimeMillis());
                data.put("source", SOURCES[random.nextInt(SOURCES.length)]);

                Map<String, String> tags = new HashMap<>();
                tags.put("host", "server-" + random.nextInt(10));
                tags.put("region", random.nextBoolean() ? "us-east" : "us-west");
                data.put("tags", tags);

                String json = JSON.toJSONString(data);
                producer.send(new ProducerRecord<>(topic, metric, json));
                count++;
            }

            if (count % 100 == 0) {
                System.out.printf("Generated %d records...%n", count);
            }

            Thread.sleep(interval);
        }
    }
}
