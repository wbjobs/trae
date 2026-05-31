package com.reconciliation;

import com.reconciliation.config.ReconciliationConfig;
import com.reconciliation.flink.DeduplicationProcessFunction;
import com.reconciliation.flink.DelayAlertSink;
import com.reconciliation.flink.DelayDetectionProcessFunction;
import com.reconciliation.flink.LocalAlertStoreSink;
import com.reconciliation.flink.OrderEventPulsarDeserializationSchema;
import com.reconciliation.flink.ReconciliationResultSink;
import com.reconciliation.flink.ReconciliationWindowJoinFunction;
import com.reconciliation.http.QueryHttpServer;
import com.reconciliation.model.DelayAlertEvent;
import com.reconciliation.model.DelayDistributionStats;
import com.reconciliation.model.OrderEvent;
import com.reconciliation.store.DelayAlertStore;
import com.reconciliation.store.InMemoryDelayAlertStore;
import com.reconciliation.store.InMemoryResultStore;
import com.reconciliation.store.ReconciliationResultStore;
import org.apache.flink.api.common.CheckpointingMode;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.java.functions.KeySelector;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.contrib.streaming.state.EmbeddedRocksDBStateBackend;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;
import org.apache.flink.connector.pulsar.source.PulsarSource;
import org.apache.pulsar.client.api.SubscriptionInitialPosition;
import org.apache.pulsar.client.api.SubscriptionType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.Collections;

public class ReconciliationJob {

    private static final Logger LOG = LoggerFactory.getLogger(ReconciliationJob.class);

    public static void main(String[] args) throws Exception {
        ReconciliationConfig config = ReconciliationConfig.fromSystemProperties();

        LOG.info("Starting Cross-Cluster Reconciliation Service (Exactly-Once + Delay Alert Mode)...");
        LOG.info("Pulsar Service URL: {}", config.getPulsarServiceUrl());
        LOG.info("Topic A: {}", config.getTopicA());
        LOG.info("Topic B: {}", config.getTopicB());
        LOG.info("Window size: {} seconds", config.getWindowSizeSeconds());
        LOG.info("RocksDB path: {}", config.getRocksDbPath());
        LOG.info("HTTP Port: {}", config.getHttpPort());
        LOG.info("Checkpoint interval: {}ms", config.getCheckpointIntervalMs());
        LOG.info("Delay threshold: {} seconds", config.getDelayThresholdSeconds());
        LOG.info("Alert topic: {}", config.getAlertTopic());

        ReconciliationResultStore resultStore = new InMemoryResultStore(config.getMaxHistorySize());
        DelayAlertStore alertStore = new InMemoryDelayAlertStore(config.getAlertHistorySize());
        DelayDistributionStats delayStats = new DelayDistributionStats();

        ReconciliationResultSink.setSharedStore(resultStore);
        LocalAlertStoreSink.setSharedStore(alertStore);
        DelayAlertSink.setSharedStats(delayStats);

        QueryHttpServer httpServer = new QueryHttpServer(config.getHttpPort(), resultStore, alertStore, delayStats);
        httpServer.start();

        StreamExecutionEnvironment env = createExecutionEnvironment(config);

        DataStream<OrderEvent> streamA = createPulsarSource(env, config, config.getTopicA(), "A");
        DataStream<OrderEvent> streamB = createPulsarSource(env, config, config.getTopicB(), "B");

        DataStream<OrderEvent> mergedStream = streamA.union(streamB);

        DataStream<OrderEvent> deduplicatedStream = mergedStream
                .keyBy((KeySelector<OrderEvent, String>) DeduplicationProcessFunction::getDeduplicationKey)
                .process(new DeduplicationProcessFunction(config.getDedupStateTtlHours()))
                .name("Deduplication")
                .uid("deduplication-process");

        long delayThresholdMs = config.getDelayThresholdSeconds() * 1000L;

        SingleOutputStreamOperator<OrderEvent> delayDetectedStream = deduplicatedStream
                .keyBy((KeySelector<OrderEvent, String>) OrderEvent::getOrderId)
                .process(new DelayDetectionProcessFunction(delayThresholdMs, config.getDedupStateTtlHours()))
                .name("DelayDetection")
                .uid("delay-detection-process");

        DataStream<DelayAlertEvent> alertStream = delayDetectedStream
                .getSideOutput(DelayDetectionProcessFunction.ALERT_OUTPUT_TAG);

        alertStream
                .addSink(new DelayAlertSink(config.getPulsarServiceUrl(), config.getAlertTopic()))
                .name("PulsarAlertSink")
                .uid("pulsar-alert-sink");

        alertStream
                .addSink(new LocalAlertStoreSink())
                .name("LocalAlertStoreSink")
                .uid("local-alert-store-sink");

        SingleOutputStreamOperator<com.reconciliation.model.ReconciliationResult> resultStream =
                delayDetectedStream
                        .keyBy((KeySelector<OrderEvent, String>) OrderEvent::getOrderId)
                        .window(TumblingEventTimeWindows.of(Time.seconds(config.getWindowSizeSeconds())))
                        .apply(new ReconciliationWindowJoinFunction())
                        .name("WindowJoin")
                        .uid("window-join");

        resultStream
                .addSink(new ReconciliationResultSink())
                .name("ResultSink")
                .uid("result-sink");

        LOG.info("Submitting Flink job with Exactly-Once guarantee and Delay Alerts...");
        try {
            env.execute("Cross-Cluster Reconciliation Job (Exactly-Once + Delay Alerts)");
        } catch (Exception e) {
            LOG.error("Flink job execution failed", e);
            httpServer.stop(0);
            throw e;
        }
    }

    private static StreamExecutionEnvironment createExecutionEnvironment(ReconciliationConfig config) {
        Configuration flinkConfig = new Configuration();
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment(flinkConfig);

        env.enableCheckpointing(config.getCheckpointIntervalMs());
        CheckpointConfig checkpointConfig = env.getCheckpointConfig();
        checkpointConfig.setCheckpointingMode(CheckpointingMode.EXACTLY_ONCE);
        checkpointConfig.setCheckpointStorage(config.getRocksDbPath());
        checkpointConfig.setTolerableCheckpointFailureNumber(3);
        checkpointConfig.enableExternalizedCheckpoints(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        EmbeddedRocksDBStateBackend rocksDBStateBackend = new EmbeddedRocksDBStateBackend(true);
        rocksDBStateBackend.setDbStoragePath(config.getRocksDbPath());
        env.setStateBackend(rocksDBStateBackend);

        env.getConfig().setAutoWatermarkInterval(200L);
        env.getConfig().enableObjectReuse();

        return env;
    }

    private static DataStream<OrderEvent> createPulsarSource(
            StreamExecutionEnvironment env,
            ReconciliationConfig config,
            String topic,
            String sourceLabel) {

        PulsarSource<OrderEvent> pulsarSource = PulsarSource.builder()
                .setServiceUrl(config.getPulsarServiceUrl())
                .setTopics(Collections.singletonList(topic))
                .setSubscriptionName(config.getSubscriptionName() + "-" + sourceLabel)
                .setSubscriptionType(SubscriptionType.Failover)
                .setSubscriptionInitialPosition(SubscriptionInitialPosition.Earliest)
                .setDeserializationSchema(new OrderEventPulsarDeserializationSchema(sourceLabel))
                .setDiscoveryInterval(Duration.ofSeconds(30))
                .build();

        WatermarkStrategy<OrderEvent> watermarkStrategy = WatermarkStrategy
                .<OrderEvent>forBoundedOutOfOrderness(Duration.ofSeconds(5))
                .withTimestampAssigner((event, recordTimestamp) -> event.getEventTime())
                .withIdleness(Duration.ofSeconds(10));

        return env.fromSource(pulsarSource, watermarkStrategy, "Pulsar-" + sourceLabel)
                .filter(event -> event != null)
                .name("FilterNull-" + sourceLabel);
    }
}
