package com.anomaly.flink.config

import org.apache.flink.configuration.{Configuration, MemorySize, RestOptions}
import org.apache.flink.streaming.api.CheckpointingMode
import org.apache.flink.streaming.api.environment.CheckpointConfig.ExternalizedCheckpointCleanup
import org.apache.flink.streaming.api.scala.StreamExecutionEnvironment

import java.util.concurrent.TimeUnit

object FlinkConfig {

  def configureEnvironment(env: StreamExecutionEnvironment): Unit = {
    val config = new Configuration()

    config.set(RestOptions.ENABLE_FLAMEGRAPH, true)
    config.setString("taskmanager.network.memory.batch.buffer-timeout", "100ms")
    config.setInteger("taskmanager.network.memory.buffers-per-channel", 8)
    config.setInteger("taskmanager.network.memory.floating-buffers-per-gate", 16)
    config.setBoolean("rest.flamegraph.enabled", true)

    env.configure(config)

    env.enableCheckpointing(
      30000,
      CheckpointingMode.EXACTLY_ONCE
    )

    val checkpointConfig = env.getCheckpointConfig
    checkpointConfig.setCheckpointTimeout(600000)
    checkpointConfig.setMinPauseBetweenCheckpoints(15000)
    checkpointConfig.setMaxConcurrentCheckpoints(2)
    checkpointConfig.setTolerableCheckpointFailureNumber(3)
    checkpointConfig.enableExternalizedCheckpoints(
      ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION
    )

    env.getConfig.setAutoWatermarkInterval(500L)
    env.getConfig.setLatencyTrackingInterval(1000L)
    env.setBufferTimeout(50L)
    env.enableObjectReuse()
    env.setParallelism(4)
    env.setMaxParallelism(128)
  }

  def getKafkaConsumerProps(brokers: String, groupId: String): java.util.Properties = {
    val props = new java.util.Properties()
    props.setProperty("bootstrap.servers", brokers)
    props.setProperty("group.id", groupId)
    props.setProperty("auto.offset.reset", "latest")
    props.setProperty("enable.auto.commit", "false")
    props.setProperty("auto.commit.interval.ms", "5000")
    props.setProperty("fetch.min.bytes", "10240")
    props.setProperty("fetch.max.wait.ms", "500")
    props.setProperty("fetch.max.bytes", "52428800")
    props.setProperty("max.partition.fetch.bytes", "1048576")
    props.setProperty("max.poll.records", "2000")
    props.setProperty("max.poll.interval.ms", "300000")
    props.setProperty("session.timeout.ms", "45000")
    props.setProperty("heartbeat.interval.ms", "15000")
    props.setProperty("client.id", "flink-anomaly-detector")
    props.setProperty("receive.buffer.bytes", "1048576")
    props.setProperty("send.buffer.bytes", "1048576")
    props.setProperty("compression.type", "snappy")
    props
  }

  def getKafkaProducerProps(brokers: String): java.util.Properties = {
    val props = new java.util.Properties()
    props.setProperty("bootstrap.servers", brokers)
    props.setProperty("acks", "1")
    props.setProperty("retries", "3")
    props.setProperty("batch.size", "65536")
    props.setProperty("linger.ms", "50")
    props.setProperty("buffer.memory", "33554432")
    props.setProperty("compression.type", "snappy")
    props.setProperty("max.in.flight.requests.per.connection", "5")
    props.setProperty("enable.idempotence", "false")
    props.setProperty("client.id", "flink-anomaly-producer")
    props.setProperty("send.buffer.bytes", "1048576")
    props.setProperty("receive.buffer.bytes", "1048576")
    props.setProperty("request.timeout.ms", "30000")
    props.setProperty("delivery.timeout.ms", "120000")
    props
  }
}
