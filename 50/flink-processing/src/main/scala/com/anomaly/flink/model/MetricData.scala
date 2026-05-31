package com.anomaly.flink.model

case class MetricData(
  metricId: String,
  value: Double,
  timestamp: Long,
  source: String,
  tags: Map[String, String] = Map.empty
)

case class AnomalyResult(
  metricId: String,
  value: Double,
  timestamp: Long,
  source: String,
  isAnomaly: Boolean,
  algorithm: String,
  score: Double,
  threshold: Double,
  message: String
)

case class StatisticsState(
  var count: Long = 0L,
  var mean: Double = 0.0,
  var m2: Double = 0.0
) {
  def update(value: Double): Unit = {
    count += 1
    val delta = value - mean
    mean += delta / count
    val delta2 = value - mean
    m2 += delta * delta2
  }

  def getVariance: Double = if (count > 1) m2 / (count - 1) else 0.0
  def getStdDev: Double = Math.sqrt(getVariance)
}
