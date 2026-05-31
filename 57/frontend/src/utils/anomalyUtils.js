export function detectAnomaliesBatch(prices, windowSize = 100, sigmaThreshold = 3) {
  const results = []
  const window = []

  for (let i = 0; i < prices.length; i++) {
    const price = prices[i]
    window.push(price)
    if (window.length > windowSize) {
      window.shift()
    }

    if (window.length < 30) {
      results.push({ isAnomaly: false, mean: 0, std: 0, zScore: 0 })
      continue
    }

    const mean = window.reduce((a, b) => a + b, 0) / window.length
    const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length
    const std = Math.sqrt(variance)

    if (std < 1e-9) {
      results.push({ isAnomaly: false, mean, std, zScore: 0 })
      continue
    }

    const zScore = (price - mean) / std
    const isAnomaly = Math.abs(zScore) > sigmaThreshold

    results.push({ isAnomaly, mean, std, zScore })
  }

  return results
}

export function recalculateDataPoints(dataPoints, sigmaThreshold) {
  const prices = dataPoints.map(d => d.price)
  const results = detectAnomaliesBatch(prices, 100, sigmaThreshold)

  return dataPoints.map((point, index) => ({
    ...point,
    isAnomaly: results[index].isAnomaly,
    anomaly_info: results[index].isAnomaly
      ? {
          mean: Math.round(results[index].mean * 100) / 100,
          std: Math.round(results[index].std * 100) / 100,
          z_score: Math.round(results[index].zScore * 100) / 100
        }
      : null
  }))
}
