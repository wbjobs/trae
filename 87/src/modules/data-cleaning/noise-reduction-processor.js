export class NoiseReductionProcessor {
  constructor(options = {}) {
    this.method = options.method || 'moving-average';
    this.windowSize = Math.min(options.windowSize || 7, 31);
    this.polynomialOrder = Math.min(options.polynomialOrder || 2, 4);
    this.sigma = options.sigma || 1.0;
    this.alpha = options.alpha || 0.3;
    this.enableStreaming = options.enableStreaming !== false;
    this.chunkSize = options.chunkSize || 10000;
  }

  process(data, valueField = 'runoff_value') {
    if (!data || data.length === 0) return [];

    if (this.enableStreaming && data.length > this.chunkSize) {
      return this.processStreaming(data, valueField);
    }

    const values = data.map(d => d[valueField]);
    let smoothedValues;

    switch (this.method) {
      case 'savitzky-golay':
        smoothedValues = this.savitzkyGolayFilter(values, this.windowSize, this.polynomialOrder);
        break;
      case 'moving-average':
        smoothedValues = this.movingAverageFilter(values, this.windowSize);
        break;
      case 'gaussian':
        smoothedValues = this.gaussianFilter(values, this.sigma, this.windowSize);
        break;
      case 'exponential':
        smoothedValues = this.exponentialSmoothing(values, this.alpha);
        break;
      case 'median':
        smoothedValues = this.medianFilter(values, this.windowSize);
        break;
      default:
        smoothedValues = this.movingAverageFilter(values, this.windowSize);
    }

    return data.map((d, i) => ({
      ...d,
      [`${valueField}_raw`]: d[valueField],
      [valueField]: smoothedValues[i],
      _smoothed: true
    }));
  }

  processStreaming(data, valueField) {
    const result = [];
    const halfWindow = Math.floor(this.windowSize / 2);
    
    for (let i = 0; i < data.length; i += this.chunkSize) {
      const chunkStart = Math.max(0, i - halfWindow);
      const chunkEnd = Math.min(data.length, i + this.chunkSize + halfWindow);
      const chunk = data.slice(chunkStart, chunkEnd);
      const chunkValues = chunk.map(d => d[valueField]);
      
      let smoothedChunk;
      switch (this.method) {
        case 'savitzky-golay':
          smoothedChunk = this.savitzkyGolayFilter(chunkValues, this.windowSize, this.polynomialOrder);
          break;
        case 'moving-average':
          smoothedChunk = this.movingAverageFilter(chunkValues, this.windowSize);
          break;
        case 'gaussian':
          smoothedChunk = this.gaussianFilter(chunkValues, this.sigma, this.windowSize);
          break;
        case 'exponential':
          smoothedChunk = this.exponentialSmoothing(chunkValues, this.alpha);
          break;
        case 'median':
          smoothedChunk = this.medianFilter(chunkValues, this.windowSize);
          break;
        default:
          smoothedChunk = this.movingAverageFilter(chunkValues, this.windowSize);
      }
      
      const offset = i - chunkStart;
      const takeCount = Math.min(this.chunkSize, data.length - i);
      for (let j = 0; j < takeCount; j++) {
        const dataIndex = i + j;
        const chunkIndex = offset + j;
        result.push({
          ...data[dataIndex],
          [`${valueField}_raw`]: data[dataIndex][valueField],
          [valueField]: smoothedChunk[chunkIndex],
          _smoothed: true
        });
      }
    }
    
    return result;
  }

  savitzkyGolayFilter(values, windowSize, order) {
    const n = values.length;
    const halfWindow = Math.floor(windowSize / 2);
    const result = new Array(n);

    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(n - 1, i + halfWindow);
      const actualWindow = end - start + 1;

      if (actualWindow < order + 1) {
        result[i] = values[i];
        continue;
      }

      const x = [];
      const y = [];
      for (let j = start; j <= end; j++) {
        x.push(j - start);
        y.push(values[j]);
      }

      const coeffs = this.polynomialFit(x, y, order);
      result[i] = this.polynomialValue(coeffs, i - start);
    }

    return result;
  }

  polynomialFit(x, y, order) {
    const n = x.length;
    const m = order + 1;
    const X = [];
    const Y = [];

    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < m; j++) {
        row.push(Math.pow(x[i], j));
      }
      X.push(row);
      Y.push(y[i]);
    }

    const XtX = this.matrixMultiply(this.transpose(X), X);
    const XtY = this.matrixMultiply(this.transpose(X), Y.map(v => [v]));
    const coeffs = this.solveLinearSystem(XtX, XtY.map(v => v[0]));

    return coeffs;
  }

  polynomialValue(coeffs, x) {
    let result = 0;
    for (let i = 0; i < coeffs.length; i++) {
      result += coeffs[i] * Math.pow(x, i);
    }
    return result;
  }

  transpose(matrix) {
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
  }

  matrixMultiply(a, b) {
    const result = [];
    for (let i = 0; i < a.length; i++) {
      result[i] = [];
      for (let j = 0; j < b[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < a[0].length; k++) {
          sum += a[i][k] * b[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  solveLinearSystem(A, b) {
    const n = A.length;
    const augmented = A.map((row, i) => [...row, b[i]]);

    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(augmented[j][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = j;
        }
      }
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

      const pivot = augmented[i][i];
      for (let j = i; j <= n; j++) {
        augmented[i][j] /= pivot;
      }

      for (let j = 0; j < n; j++) {
        if (j !== i) {
          const factor = augmented[j][i];
          for (let k = i; k <= n; k++) {
            augmented[j][k] -= factor * augmented[i][k];
          }
        }
      }
    }

    return augmented.map(row => row[n]);
  }

  movingAverageFilter(values, windowSize) {
    const n = values.length;
    const halfWindow = Math.floor(windowSize / 2);
    const result = new Array(n);

    for (let i = 0; i < n; i++) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - halfWindow); j <= Math.min(n - 1, i + halfWindow); j++) {
        sum += values[j];
        count++;
      }
      result[i] = sum / count;
    }

    return result;
  }

  gaussianFilter(values, sigma, windowSize) {
    const n = values.length;
    const halfWindow = Math.floor(windowSize / 2);
    const result = new Array(n);
    const kernel = [];

    let sum = 0;
    for (let i = -halfWindow; i <= halfWindow; i++) {
      const value = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel.push(value);
      sum += value;
    }

    for (let i = 0; i < kernel.length; i++) {
      kernel[i] /= sum;
    }

    for (let i = 0; i < n; i++) {
      let weightedSum = 0;
      for (let j = -halfWindow; j <= halfWindow; j++) {
        const idx = Math.max(0, Math.min(n - 1, i + j));
        weightedSum += values[idx] * kernel[j + halfWindow];
      }
      result[i] = weightedSum;
    }

    return result;
  }

  exponentialSmoothing(values, alpha) {
    const n = values.length;
    const result = new Array(n);
    result[0] = values[0];

    for (let i = 1; i < n; i++) {
      result[i] = alpha * values[i] + (1 - alpha) * result[i - 1];
    }

    return result;
  }

  medianFilter(values, windowSize) {
    const n = values.length;
    const halfWindow = Math.floor(windowSize / 2);
    const result = new Array(n);

    for (let i = 0; i < n; i++) {
      const window = [];
      for (let j = Math.max(0, i - halfWindow); j <= Math.min(n - 1, i + halfWindow); j++) {
        window.push(values[j]);
      }
      window.sort((a, b) => a - b);
      const mid = Math.floor(window.length / 2);
      result[i] = window.length % 2 === 0 ? (window[mid - 1] + window[mid]) / 2 : window[mid];
    }

    return result;
  }
}

export default NoiseReductionProcessor;
