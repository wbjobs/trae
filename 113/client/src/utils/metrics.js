export function calculatePSNR(originalData, compressedData) {
  if (originalData.length !== compressedData.length) {
    console.warn('数据长度不匹配，无法计算 PSNR')
    return null
  }

  let mse = 0
  const length = originalData.length

  for (let i = 0; i < length; i++) {
    const diff = originalData[i] - compressedData[i]
    mse += diff * diff
  }

  mse /= length

  if (mse === 0) {
    return Infinity
  }

  const maxPixelValue = 255
  const psnr = 10 * Math.log10((maxPixelValue * maxPixelValue) / mse)

  return parseFloat(psnr.toFixed(2))
}

export function calculateMSE(originalData, compressedData) {
  if (originalData.length !== compressedData.length) {
    return null
  }

  let mse = 0
  const length = originalData.length

  for (let i = 0; i < length; i++) {
    const diff = originalData[i] - compressedData[i]
    mse += diff * diff
  }

  return mse / length
}

export function calculateSSIM(originalData, compressedData, width, height) {
  const windowSize = 8
  const L = 255
  const K1 = 0.01
  const K2 = 0.03
  const C1 = (K1 * L) ** 2
  const C2 = (K2 * L) ** 2

  let ssimSum = 0
  let windowCount = 0

  for (let y = 0; y < height - windowSize; y += windowSize) {
    for (let x = 0; x < width - windowSize; x += windowSize) {
      const result = _calculateWindowSSIM(
        originalData, compressedData,
        x, y, width, height,
        windowSize, C1, C2
      )
      
      if (result !== null) {
        ssimSum += result
        windowCount++
      }
    }
  }

  return windowCount > 0 ? parseFloat((ssimSum / windowCount).toFixed(4)) : null
}

function _calculateWindowSSIM(orig, comp, x, y, width, height, windowSize, C1, C2) {
  let sumX = 0, sumY = 0
  let sumXY = 0, sumX2 = 0, sumY2 = 0
  const n = windowSize * windowSize

  for (let j = 0; j < windowSize; j++) {
    for (let i = 0; i < windowSize; i++) {
      const idx = ((y + j) * width + (x + i)) * 4
      
      if (idx >= orig.length || idx >= comp.length) continue

      const origGray = 0.299 * orig[idx] + 0.587 * orig[idx + 1] + 0.114 * orig[idx + 2]
      const compGray = 0.299 * comp[idx] + 0.587 * comp[idx + 1] + 0.114 * comp[idx + 2]

      sumX += origGray
      sumY += compGray
      sumXY += origGray * compGray
      sumX2 += origGray * origGray
      sumY2 += compGray * compGray
    }
  }

  const meanX = sumX / n
  const meanY = sumY / n
  const varX = sumX2 / n - meanX * meanX
  const varY = sumY2 / n - meanY * meanY
  const covXY = sumXY / n - meanX * meanY

  const numerator = (2 * meanX * meanY + C1) * (2 * covXY + C2)
  const denominator = (meanX * meanX + meanY * meanY + C1) * (varX + varY + C2)

  if (denominator === 0) return null
  
  return numerator / denominator
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatBitrate(bitsPerSecond) {
  if (bitsPerSecond >= 1_000_000) {
    return (bitsPerSecond / 1_000_000).toFixed(2) + ' Mbps'
  } else if (bitsPerSecond >= 1_000) {
    return (bitsPerSecond / 1_000).toFixed(2) + ' Kbps'
  }
  return bitsPerSecond + ' bps'
}
