export class MissingValueHandler {
  constructor(options = {}) {
    this.method = options.method || 'linear';
    this.maxGap = options.maxGap || 5;
    this.fillValue = options.fillValue || null;
  }

  handle(data, valueField = 'runoff_value', timeField = 'record_time') {
    if (!data || data.length === 0) return [];

    const sortedData = [...data].sort((a, b) => 
      new Date(a[timeField]) - new Date(b[timeField])
    );

    const result = [];
    let lastValidIndex = -1;

    for (let i = 0; i < sortedData.length; i++) {
      const currentValue = sortedData[i][valueField];
      
      if (currentValue !== null && currentValue !== undefined && !isNaN(currentValue)) {
        result.push({ ...sortedData[i], _filled: false });
        lastValidIndex = i;
      } else {
        const gapStart = lastValidIndex >= 0 ? lastValidIndex : 0;
        const gapEnd = this.findNextValidIndex(sortedData, i, valueField);
        
        if (gapEnd - gapStart <= this.maxGap) {
          const filledValue = this.interpolate(sortedData, gapStart, gapEnd, i, valueField, timeField);
          result.push({ 
            ...sortedData[i], 
            [valueField]: filledValue,
            _filled: true 
          });
        } else {
          result.push({ 
            ...sortedData[i], 
            [valueField]: this.fillValue,
            _filled: true 
          });
        }
      }
    }

    return result;
  }

  findNextValidIndex(data, startIndex, valueField) {
    for (let i = startIndex; i < data.length; i++) {
      const value = data[i][valueField];
      if (value !== null && value !== undefined && !isNaN(value)) {
        return i;
      }
    }
    return data.length - 1;
  }

  interpolate(data, startIndex, endIndex, currentIndex, valueField, timeField) {
    if (startIndex === endIndex) return data[startIndex][valueField];
    if (startIndex < 0) return data[endIndex][valueField];
    if (endIndex >= data.length) return data[startIndex][valueField];

    switch (this.method) {
      case 'linear':
        return this.linearInterpolation(data, startIndex, endIndex, currentIndex, valueField, timeField);
      case 'spline':
        return this.splineInterpolation(data, startIndex, endIndex, currentIndex, valueField);
      case 'mean':
        return this.meanInterpolation(data, startIndex, endIndex, valueField);
      default:
        return this.linearInterpolation(data, startIndex, endIndex, currentIndex, valueField, timeField);
    }
  }

  linearInterpolation(data, startIndex, endIndex, currentIndex, valueField, timeField) {
    const x0 = new Date(data[startIndex][timeField]).getTime();
    const x1 = new Date(data[endIndex][timeField]).getTime();
    const x = new Date(data[currentIndex][timeField]).getTime();
    const y0 = data[startIndex][valueField];
    const y1 = data[endIndex][valueField];
    
    if (x1 === x0) return y0;
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }

  splineInterpolation(data, startIndex, endIndex, currentIndex, valueField) {
    const values = [];
    for (let i = startIndex; i <= endIndex; i++) {
      values.push(data[i][valueField]);
    }
    const pos = currentIndex - startIndex;
    const n = values.length;
    
    if (n < 3 || pos === 0 || pos === n - 1) {
      return values[pos];
    }
    
    const t = pos;
    const p0 = values[Math.max(0, pos - 1)];
    const p1 = values[pos];
    const p2 = values[Math.min(n - 1, pos + 1)];
    const p3 = values[Math.min(n - 1, pos + 2)];
    
    const t2 = t * t;
    const t3 = t2 * t;
    
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  meanInterpolation(data, startIndex, endIndex, valueField) {
    let sum = 0;
    let count = 0;
    for (let i = startIndex; i <= endIndex; i++) {
      const value = data[i][valueField];
      if (value !== null && value !== undefined && !isNaN(value)) {
        sum += value;
        count++;
      }
    }
    return count > 0 ? sum / count : this.fillValue;
  }
}

export default MissingValueHandler;
