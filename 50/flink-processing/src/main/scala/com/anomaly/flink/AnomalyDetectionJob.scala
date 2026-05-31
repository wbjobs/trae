package com.anomaly.flink

import com.alibaba.fastjson.JSON
import com.anomaly.flink.config.FlinkConfig
import com.anomaly.flink.detector.Sigma3AnomalyDetector
import com.anomaly.flink.model.AnomalyResult
import com.anomaly.flink.source.DataSourceFactory
import org.apache.flink.streaming.api.scala._
import org.apache.flink.streaming.api.scala.function.ProcessWindowFunction
import org.apache.flink.streaming.api.windowing.assigners.TumblingProcessingTimeWindows
import org.apache.flink.streaming.api.windowing.time.Time
import org.apache.flink.streaming.api.windowing.windows.TimeWindow
import org.apache.flink.streaming.connectors.kafka.FlinkKafkaProducer
import org.apache.flink.api.common.serialization.SimpleStringSchema
import org.apache.flink.util.Collector
import org.apache.flink.streaming.api.functions.sink.SinkFunction
import org.apache.flink.configuration.Configuration
import org.slf4j.LoggerFactory

import java.util.concurrent.atomic.AtomicLong

object AnomalyDetectionJob {

  private val logger = LoggerFactory.getLogger(this.getClass)

  def main(args: Array[String]): Unit = {
    val env = StreamExecutionEnvironment.getExecutionEnvironment
    
    FlinkConfig.configureEnvironment(env)

    val kafkaBrokers = sys.env.getOrElse("KAFKA_BROKERS", "localhost:9092")
    val inputTopic = sys.env.getOrElse("INPUT_TOPIC", "metrics-input")
    val outputTopic = sys.env.getOrElse("OUTPUT_TOPIC", "anomaly-output")
    val alertTopic = sys.env.getOrElse("ALERT_TOPIC", "anomaly-alerts")

    logger.info(s"Starting Anomaly Detection Job with brokers: $kafkaBrokers")
    logger.info(s"Input topic: $inputTopic, Output topic: $outputTopic, Alert topic: $alertTopic")

    val kafkaStream = DataSourceFactory.createKafkaSource(env, inputTopic, kafkaBrokers)

    val anomalyStream = kafkaStream
      .keyBy(_.metricId)
      .process(new Sigma3AnomalyDetector())
      .name("3σ Anomaly Detector")
      .uid("sigma3-anomaly-detector")

    val producerProps = FlinkConfig.getKafkaProducerProps(kafkaBrokers)

    val outputProducer = new FlinkKafkaProducer[String](
      outputTopic,
      new SimpleStringSchema(),
      producerProps
    )

    val alertProducer = new FlinkKafkaProducer[String](
      alertTopic,
      new SimpleStringSchema(),
      producerProps
    )

    anomalyStream
      .map { result =>
        val json = JSON.toJSONString(result)
        json
      }
      .name("Serialize AnomalyResult")
      .uid("serialize-anomaly-result")
      .addSink(outputProducer)
      .name("Kafka Sink - Output")
      .uid("kafka-sink-output")

    anomalyStream
      .filter(_.isAnomaly)
      .name("Filter Anomalies")
      .uid("filter-anomalies")
      .map { result =>
        val json = JSON.toJSONString(result)
        json
      }
      .name("Serialize Alert")
      .uid("serialize-alert")
      .addSink(alertProducer)
      .name("Kafka Sink - Alerts")
      .uid("kafka-sink-alerts")

    env.addSource(new LatencyMetricsSource)
      .name("Latency Metrics Source")
      .uid("latency-metrics-source")
      .addSink(new StatsDSink)
      .name("StatsD Sink")
      .uid("statsd-sink")

    logger.info("Job execution plan:")
    logger.info(env.getExecutionPlan)

    env.execute("Real-time Anomaly Detection")
  }

  class LatencyMetricsSource extends org.apache.flink.streaming.api.functions.source.SourceFunction[Long] {
    private var running = true
    private val counter = new AtomicLong(0)

    override def run(ctx: org.apache.flink.streaming.api.functions.source.SourceFunction.SourceContext[Long]): Unit = {
      while (running) {
        Thread.sleep(10000)
        ctx.collect(counter.incrementAndGet())
      }
    }

    override def cancel(): Unit = {
      running = false
    }
  }

  class StatsDSink extends SinkFunction[Long] {
    @transient private var lastLogTime: Long = _

    override def invoke(value: Long, context: SinkFunction.Context): Unit = {
      val now = System.currentTimeMillis()
      if (lastLogTime == 0 || now - lastLogTime > 60000) {
        logger.info(s"Heartbeat: job running, sequence=$value")
        lastLogTime = now
      }
    }
  }
}
