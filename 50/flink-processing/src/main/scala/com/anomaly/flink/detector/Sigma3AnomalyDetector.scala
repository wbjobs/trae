package com.anomaly.flink.detector

import com.anomaly.flink.model.{AnomalyResult, MetricData, StatisticsState}
import org.apache.flink.api.common.state.{ValueState, ValueStateDescriptor}
import org.apache.flink.configuration.Configuration
import org.apache.flink.streaming.api.functions.KeyedProcessFunction
import org.apache.flink.util.Collector

class Sigma3AnomalyDetector extends KeyedProcessFunction[String, MetricData, AnomalyResult] {

  @transient private var statsState: ValueState[StatisticsState] = _
  
  private val sigmaMultiplier = 3.0
  private val minSamplesForDetection = 30
  
  @transient private var normalMessage: String = _
  @transient private var stringBuilder: StringBuilder = _

  override def open(parameters: Configuration): Unit = {
    val statsDescriptor = new ValueStateDescriptor[StatisticsState](
      "statistics-state",
      classOf[StatisticsState]
    )
    statsState = getRuntimeContext.getState(statsDescriptor)
    
    normalMessage = "Normal data point"
    stringBuilder = new StringBuilder(256)
  }

  override def processElement(
    value: MetricData,
    ctx: KeyedProcessFunction[String, MetricData, AnomalyResult]#Context,
    out: Collector[AnomalyResult]
  ): Unit = {
    
    var stats = statsState.value()
    if (stats == null) {
      stats = new StatisticsState()
    }

    stats.update(value.value)
    statsState.update(stats)

    val count = stats.count
    val mean = stats.mean
    val stdDev = stats.getStdDev
    
    var score = 0.0
    var isAnomaly = false
    var message = normalMessage

    if (count > minSamplesForDetection && stdDev > 0.0) {
      val deviation = Math.abs(value.value - mean)
      score = deviation / stdDev
      isAnomaly = score > sigmaMultiplier
      
      if (isAnomaly) {
        message = buildAnomalyMessage(value.value, mean, stdDev, sigmaMultiplier * stdDev)
      }
    }

    out.collect(
      AnomalyResult(
        metricId = value.metricId,
        value = value.value,
        timestamp = value.timestamp,
        source = value.source,
        isAnomaly = isAnomaly,
        algorithm = "3sigma",
        score = score,
        threshold = sigmaMultiplier,
        message = message
      )
    )
  }

  private def buildAnomalyMessage(
    value: Double,
    mean: Double,
    stdDev: Double,
    threshold: Double
  ): String = {
    stringBuilder.setLength(0)
    stringBuilder.append("Anomaly detected: value=")
    stringBuilder.append(value)
    stringBuilder.append(", mean=")
    stringBuilder.append("%.2f".format(mean))
    stringBuilder.append(", stdDev=")
    stringBuilder.append("%.2f".format(stdDev))
    stringBuilder.append(", threshold=")
    stringBuilder.append("%.2f".format(threshold))
    stringBuilder.toString()
  }
}
