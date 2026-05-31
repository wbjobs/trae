package com.anomaly.flink.source

import com.alibaba.fastjson.JSON
import com.anomaly.flink.config.FlinkConfig
import com.anomaly.flink.model.MetricData
import org.apache.flink.api.common.eventtime.{SerializableTimestampAssigner, WatermarkStrategy}
import org.apache.flink.api.common.serialization.SimpleStringSchema
import org.apache.flink.streaming.api.scala._
import org.apache.flink.streaming.connectors.kafka.FlinkKafkaConsumer

import java.time.Duration
import java.util.Properties

object DataSourceFactory {

  private val MAX_OUT_OF_ORDERNESS_SECONDS = 5

  def createKafkaSource(env: StreamExecutionEnvironment, topic: String, brokers: String): DataStream[MetricData] = {
    val props = FlinkConfig.getKafkaConsumerProps(brokers, "anomaly-detection-group")

    val kafkaConsumer = new FlinkKafkaConsumer[String](
      topic,
      new SimpleStringSchema(),
      props
    )
    kafkaConsumer.setStartFromLatest()
    kafkaConsumer.setCommitOffsetsOnCheckpoints(true)

    val watermarkStrategy = WatermarkStrategy
      .forBoundedOutOfOrderness[String](Duration.ofSeconds(MAX_OUT_OF_ORDERNESS_SECONDS))
      .withTimestampAssigner(new SerializableTimestampAssigner[String] {
        override def extractTimestamp(element: String, recordTimestamp: Long): Long = {
          try {
            val obj = JSON.parseObject(element)
            if (obj.containsKey("timestamp")) {
              obj.getLongValue("timestamp")
            } else {
              System.currentTimeMillis()
            }
          } catch {
            case _: Exception => System.currentTimeMillis()
          }
        }
      })
      .withIdleness(Duration.ofMinutes(1))

    kafkaConsumer.assignTimestampsAndWatermarks(watermarkStrategy)

    env.addSource(kafkaConsumer)
      .map(parseMetricData)
      .name("Kafka Source -> MetricData")
      .uid("kafka-source-metric-data")
  }

  private def parseMetricData(json: String): MetricData = {
    try {
      val obj = JSON.parseObject(json)
      val metricId = obj.getString("metricId")
      val value = obj.getDoubleValue("value")
      val timestamp = if (obj.containsKey("timestamp")) obj.getLongValue("timestamp") else System.currentTimeMillis()
      val tags = if (obj.containsKey("tags")) {
        import scala.collection.JavaConverters._
        obj.getJSONObject("tags").asScala.toMap.asInstanceOf[Map[String, String]]
      } else Map.empty[String, String]
      MetricData(metricId, value, timestamp, "kafka", tags)
    } catch {
      case e: Exception =>
        MetricData(
          "parse_error",
          0.0,
          System.currentTimeMillis(),
          "kafka",
          Map("error" -> e.getMessage)
        )
    }
  }
}
