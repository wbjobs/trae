package com.example.flink.iceberg;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.connector.file.src.FileSource;
import org.apache.flink.connector.file.src.reader.TextLineInputFormat;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.contrib.streaming.state.EmbeddedRocksDBStateBackend;
import org.apache.flink.contrib.streaming.state.PredefinedOptions;
import org.apache.flink.core.fs.Path;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.ProcessFunction;
import org.apache.flink.types.Row;
import org.apache.flink.util.Collector;
import org.apache.flink.util.OutputTag;
import org.apache.iceberg.*;
import org.apache.iceberg.catalog.Catalog;
import org.apache.iceberg.catalog.TableIdentifier;
import org.apache.iceberg.flink.CatalogLoader;
import org.apache.iceberg.flink.TableLoader;
import org.apache.iceberg.flink.sink.FlinkSink;
import org.apache.iceberg.types.Types;
import org.apache.iceberg.types.Types.NestedField;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

public class FlinkIcebergSyncJob {

    private static final Logger LOG = LoggerFactory.getLogger(FlinkIcebergSyncJob.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final String METRICS_LOG_PATH = "metrics.log";
    private static final long SCHEMA_REFRESH_INTERVAL_MS = 60000;
    private static final String DEFAULT_AUDIT_TOPIC = "flink-iceberg-audit";
    private static final String DEFAULT_KAFKA_BROKERS = "localhost:9092";

    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        configureStateBackend(env);
        configureCheckpoint(env);

        String inputPath = args.length > 0 ? args[0] : "input/";
        String warehousePath = args.length > 1 ? args[1] : "./iceberg-warehouse";
        String tableName = args.length > 2 ? args[2] : "default.sync_table";
        String primaryKey = args.length > 3 ? args[3] : "id";
        int parallelism = args.length > 4 ? Integer.parseInt(args[4]) : 1;
        String kafkaBrokers = args.length > 5 ? args[5] : DEFAULT_KAFKA_BROKERS;
        String auditTopic = args.length > 6 ? args[6] : DEFAULT_AUDIT_TOPIC;
        boolean enableAudit = args.length > 7 ? Boolean.parseBoolean(args[7]) : true;

        env.setParallelism(parallelism);

        Map<String, String> catalogProps = new HashMap<>();
        catalogProps.put("type", "hadoop");
        catalogProps.put("warehouse", new java.io.File(warehousePath).toURI().toString());

        TableIdentifier tableId = TableIdentifier.parse(tableName);
        Catalog catalog = CatalogLoader.load("iceberg", catalogProps);

        if (!catalog.tableExists(tableId)) {
            Schema initialSchema = new Schema(
                    NestedField.required(1, "id", Types.LongType.get()),
                    NestedField.optional(2, "name", Types.StringType.get())
            );
            catalog.createTable(tableId, initialSchema);
            LOG.info("Created initial Iceberg table: {}", tableId);
        }

        FileSource<String> source = FileSource
                .forRecordStreamFormat(new TextLineInputFormat(), new Path(inputPath))
                .build();

        DataStream<String> stream = env.fromSource(
                source,
                WatermarkStrategy.noWatermarks(),
                "Debezium Source");

        final OutputTag<String> auditTag = new OutputTag<String>("audit-log") {
        };

        SingleOutputStreamOperator<Row> rowStream = stream.process(
                new DebeziumToRowFunction(
                        catalogProps,
                        tableId,
                        primaryKey,
                        auditTag,
                        enableAudit
                ));

        if (enableAudit) {
            DataStream<String> auditStream = rowStream.getSideOutput(auditTag);
            KafkaSink<String> kafkaSink = KafkaSink.<String>builder()
                    .setBootstrapServers(kafkaBrokers)
                    .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                            .setTopic(auditTopic)
                            .setValueSerializationSchema(new SimpleStringSchema())
                            .build())
                    .build();
            auditStream.sinkTo(kafkaSink).name("Kafka Audit Sink");
            LOG.info("Audit log enabled, sending to Kafka topic: {}", auditTopic);
        }

        TableLoader tableLoader = TableLoader.fromCatalog(
                CatalogLoader.load("iceberg", catalogProps),
                tableId
        );

        FlinkSink.forRowData(rowStream)
                .tableLoader(tableLoader)
                .upsert(true)
                .equalityFieldColumns(Collections.singletonList(primaryKey))
                .build();

        LOG.info("Starting Flink Iceberg Sync Job with parallelism={}, auditEnabled={}", parallelism, enableAudit);
        env.execute("Flink Iceberg Sync Job");
    }

    private static void configureStateBackend(StreamExecutionEnvironment env) {
        EmbeddedRocksDBStateBackend rocksDBStateBackend = new EmbeddedRocksDBStateBackend(true);
        rocksDBStateBackend.setPredefinedOptions(PredefinedOptions.SPINNING_DISK_OPTIMIZED_HIGH_MEM);
        rocksDBStateBackend.setPriorityQueueSize(10000);
        env.setStateBackend(rocksDBStateBackend);
        LOG.info("Configured RocksDB state backend with incremental checkpointing enabled");
    }

    private static void configureCheckpoint(StreamExecutionEnvironment env) {
        CheckpointConfig checkpointConfig = env.getCheckpointConfig();
        checkpointConfig.setCheckpointInterval(60000);
        checkpointConfig.setCheckpointingMode(CheckpointingMode.EXACTLY_ONCE);
        checkpointConfig.setCheckpointTimeout(300000);
        checkpointConfig.setMinPauseBetweenCheckpoints(30000);
        checkpointConfig.setMaxConcurrentCheckpoints(1);
        checkpointConfig.setTolerableCheckpointFailureNumber(3);
        checkpointConfig.enableExternalizedCheckpoints(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);
        env.getConfiguration().set(
                org.apache.flink.configuration.CheckpointingOptions.CHECKPOINTING_PREFER_EXACTLY_ONCE_ALIGNED,
                true);
        env.getConfiguration().set(
                org.apache.flink.configuration.CheckpointingOptions.ALIGNED_CHECKPOINT_TIMEOUT,
                java.time.Duration.ofMinutes(1));
        LOG.info("Configured checkpoint: interval=60s, timeout=300s, max-concurrent=1");
    }

    public static class DebeziumToRowFunction extends ProcessFunction<String, Row> {
        private final Map<String, String> catalogProps;
        private final TableIdentifier tableId;
        private final String primaryKey;
        private final OutputTag<String> auditTag;
        private final boolean enableAudit;
        private transient Catalog catalog;
        private transient Schema currentSchema;
        private transient Map<String, Integer> fieldNameToIndex;
        private transient long lastSchemaRefreshTime;

        public DebeziumToRowFunction(
                Map<String, String> catalogProps,
                TableIdentifier tableId,
                String primaryKey,
                OutputTag<String> auditTag,
                boolean enableAudit) {
            this.catalogProps = catalogProps;
            this.tableId = tableId;
            this.primaryKey = primaryKey;
            this.auditTag = auditTag;
            this.enableAudit = enableAudit;
        }

        @Override
        public void open(Configuration parameters) throws Exception {
            catalog = CatalogLoader.load("iceberg", catalogProps);
            refreshSchema();
            lastSchemaRefreshTime = System.currentTimeMillis();
            LOG.info("DebeziumToRowFunction initialized successfully, auditEnabled={}", enableAudit);
        }

        private synchronized void refreshSchema() {
            Table table = catalog.loadTable(tableId);
            currentSchema = table.schema();
            fieldNameToIndex = new HashMap<>();
            List<NestedField> fields = currentSchema.columns();
            for (int i = 0; i < fields.size(); i++) {
                fieldNameToIndex.put(fields.get(i).name(), i);
            }
            LOG.info("Schema refreshed. Columns: {}", currentSchema.names());
            lastSchemaRefreshTime = System.currentTimeMillis();
        }

        private void checkAndRefreshSchemaIfNeeded() {
            long now = System.currentTimeMillis();
            if (now - lastSchemaRefreshTime > SCHEMA_REFRESH_INTERVAL_MS) {
                LOG.debug("Refreshing schema due to refresh interval elapsed");
                refreshSchema();
            }
        }

        @Override
        public void processElement(String jsonStr, Context ctx, Collector<Row> out) throws Exception {
            ThroughputCounter.increment();

            try {
                checkAndRefreshSchemaIfNeeded();

                JsonNode json = OBJECT_MAPPER.readTree(jsonStr);
                String op = json.has("op") ? json.get("op").asText() : "c";
                JsonNode data = "d".equals(op) ? json.get("before") : json.get("after");

                if (data == null) {
                    LOG.debug("Skipping record with null data, op={}", op);
                    return;
                }

                if (enableAudit) {
                    String auditLog = buildAuditLog(json, op, data);
                    ctx.output(auditTag, auditLog);
                }

                List<NestedField> fields = currentSchema.columns();
                Row row = new Row(fields.size());
                Set<String> droppedColumns = new HashSet<>();

                Iterator<String> dataFieldNames = data.fieldNames();
                while (dataFieldNames.hasNext()) {
                    String fieldName = dataFieldNames.next();
                    if (fieldNameToIndex.containsKey(fieldName)) {
                        int index = fieldNameToIndex.get(fieldName);
                        NestedField field = fields.get(index);
                        JsonNode valueNode = data.get(fieldName);
                        if (valueNode != null && !valueNode.isNull()) {
                            Object value = convertValue(valueNode, field.type());
                            row.setField(index, value);
                        } else {
                            row.setField(index, null);
                        }
                    } else {
                        droppedColumns.add(fieldName);
                    }
                }

                if (!droppedColumns.isEmpty()) {
                    LOG.debug("Ignored {} dropped columns: {}", droppedColumns.size(), droppedColumns);
                }

                out.collect(row);
            } catch (Exception e) {
                LOG.error("Error processing record: {}", e.getMessage(), e);
            }
        }

        private String buildAuditLog(JsonNode json, String op, JsonNode data) {
            try {
                Map<String, Object> audit = new LinkedHashMap<>();
                audit.put("timestamp", System.currentTimeMillis());
                audit.put("timestamp_formatted",
                        LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));

                JsonNode source = json.get("source");
                if (source != null) {
                    String sourceDb = source.has("db") ? source.get("db").asText() : "unknown";
                    String sourceTable = source.has("table") ? source.get("table").asText() : "unknown";
                    audit.put("source_table", sourceDb + "." + sourceTable);
                } else {
                    audit.put("source_table", "unknown.unknown");
                }

                audit.put("target_table", tableId.toString());

                String operation = "UNKNOWN";
                switch (op) {
                    case "c":
                        operation = "INSERT";
                        break;
                    case "u":
                        operation = "UPDATE";
                        break;
                    case "d":
                        operation = "DELETE";
                        break;
                    case "r":
                        operation = "READ";
                        break;
                }
                audit.put("operation", operation);

                if (data.has(primaryKey)) {
                    audit.put("row_id", data.get(primaryKey).asText());
                }

                Map<String, Object> changedColumns = new LinkedHashMap<>();
                if ("u".equals(op) && json.has("before") && json.get("before") != null) {
                    JsonNode before = json.get("before");
                    Iterator<String> fieldNames = data.fieldNames();
                    while (fieldNames.hasNext()) {
                        String fieldName = fieldNames.next();
                        JsonNode afterValue = data.get(fieldName);
                        JsonNode beforeValue = before.get(fieldName);
                        if (beforeValue != null && !beforeValue.equals(afterValue)) {
                            Map<String, Object> change = new LinkedHashMap<>();
                            change.put("old", beforeValue.isNull() ? null : beforeValue.asText());
                            change.put("new", afterValue.isNull() ? null : afterValue.asText());
                            changedColumns.put(fieldName, change);
                        }
                    }
                }
                audit.put("changed_columns", changedColumns);

                return OBJECT_MAPPER.writeValueAsString(audit);
            } catch (Exception e) {
                LOG.warn("Failed to build audit log: {}", e.getMessage());
                return "{}";
            }
        }

        private Object convertValue(JsonNode valueNode, org.apache.iceberg.types.Type type) {
            if (valueNode == null || valueNode.isNull()) {
                return null;
            }
            try {
                switch (type.typeId()) {
                    case LONG:
                        return valueNode.asLong();
                    case INTEGER:
                        return valueNode.asInt();
                    case FLOAT:
                        return valueNode.floatValue();
                    case DOUBLE:
                        return valueNode.asDouble();
                    case BOOLEAN:
                        return valueNode.asBoolean();
                    case STRING:
                        return valueNode.asText();
                    case DATE:
                        return valueNode.asInt();
                    case TIMESTAMP:
                    case TIMESTAMP_NANO:
                        return valueNode.asLong();
                    case DECIMAL:
                        return new java.math.BigDecimal(valueNode.asText());
                    case BINARY:
                    case FIXED:
                        return valueNode.binaryValue();
                    default:
                        return valueNode.asText();
                }
            } catch (Exception e) {
                LOG.warn("Failed to convert value '{}' to type {}, returning null: {}",
                        valueNode.asText(), type, e.getMessage());
                return null;
            }
        }
    }

    public static class ThroughputCounter {
        private static final AtomicLong TOTAL_COUNT = new AtomicLong(0);
        private static final AtomicLong LAST_MINUTE_COUNT = new AtomicLong(0);
        private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

        public static void increment() {
            TOTAL_COUNT.incrementAndGet();
            LAST_MINUTE_COUNT.incrementAndGet();
        }

        static {
            Thread reporter = new Thread(() -> {
                while (!Thread.currentThread().isInterrupted()) {
                    try {
                        Thread.sleep(60000);
                        long count = LAST_MINUTE_COUNT.getAndSet(0);
                        long total = TOTAL_COUNT.get();
                        String timestamp = LocalDateTime.now().format(FORMATTER);
                        String logLine = String.format("[%s] Throughput: %d records/minute (total: %d)%n",
                                timestamp, count, total);
                        try (BufferedWriter writer = new BufferedWriter(new FileWriter(METRICS_LOG_PATH, true))) {
                            writer.write(logLine);
                        } catch (IOException e) {
                            System.err.println("Failed to write metrics: " + e.getMessage());
                        }
                        System.out.print(logLine);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }, "Throughput-Reporter");
            reporter.setDaemon(true);
            reporter.start();
        }
    }
}
