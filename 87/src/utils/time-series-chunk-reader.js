import { TimeSeriesUtils } from './time-series.utils.js';
import { StatisticsUtils } from './statistics.utils.js';

export class TimeSeriesChunkReader {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 10000;
    this.overlapSize = options.overlapSize || 100;
    this.sortRequired = options.sortRequired !== false;
    this.dateField = options.dateField || 'record_time';
    this.valueField = options.valueField || 'runoff_value';
  }

  readInChunks(data, processChunkFn, options = {}) {
    return new Promise((resolve, reject) => {
      if (!data || data.length === 0) {
        resolve({ totalChunks: 0, processedCount: 0 });
        return;
      }

      const sortedData = this.sortRequired 
        ? [...data].sort((a, b) => new Date(a[this.dateField]) - new Date(b[this.dateField]))
        : data;

      const results = [];
      let currentIndex = 0;
      let chunkIndex = 0;

      const processNextChunk = () => {
        try {
          const startIndex = Math.max(0, currentIndex - this.overlapSize);
          const endIndex = Math.min(sortedData.length, currentIndex + this.chunkSize);
          const chunk = sortedData.slice(startIndex, endIndex);

          const chunkResult = processChunkFn(chunk, {
            chunkIndex,
            startIndex,
            endIndex,
            isFirst: chunkIndex === 0,
            isLast: endIndex >= sortedData.length,
            totalChunks: Math.ceil(sortedData.length / this.chunkSize)
          });

          results.push(chunkResult);
          currentIndex = endIndex;
          chunkIndex++;

          if (currentIndex < sortedData.length) {
            setTimeout(processNextChunk, 0);
          } else {
            resolve({
              totalChunks: chunkIndex,
              processedCount: sortedData.length,
              results,
              summary: this.summarizeResults(results)
            });
          }
        } catch (error) {
          reject(error);
        }
      };

      processNextChunk();
    });
  }

  async readInChunksAsync(data, processChunkAsyncFn, options = {}) {
    if (!data || data.length === 0) {
      return { totalChunks: 0, processedCount: 0 };
    }

    const sortedData = this.sortRequired 
      ? [...data].sort((a, b) => new Date(a[this.dateField]) - new Date(b[this.dateField]))
      : data;

    const results = [];
    let currentIndex = 0;
    let chunkIndex = 0;
    const totalChunks = Math.ceil(sortedData.length / this.chunkSize);

    while (currentIndex < sortedData.length) {
      const startIndex = Math.max(0, currentIndex - this.overlapSize);
      const endIndex = Math.min(sortedData.length, currentIndex + this.chunkSize);
      const chunk = sortedData.slice(startIndex, endIndex);

      const chunkResult = await processChunkAsyncFn(chunk, {
        chunkIndex,
        startIndex,
        endIndex,
        isFirst: chunkIndex === 0,
        isLast: endIndex >= sortedData.length,
        totalChunks,
        progress: Math.min(100, ((chunkIndex + 1) / totalChunks) * 100)
      });

      results.push(chunkResult);
      currentIndex = endIndex;
      chunkIndex++;

      if (options.onProgress) {
        options.onProgress({
          chunkIndex,
          totalChunks,
          processedRecords: endIndex,
          totalRecords: sortedData.length,
          progress: Math.min(100, (endIndex / sortedData.length) * 100)
        });
      }

      if (options.delayMs && currentIndex < sortedData.length) {
        await this.sleep(options.delayMs);
      }
    }

    return {
      totalChunks: chunkIndex,
      processedCount: sortedData.length,
      results,
      summary: this.summarizeResults(results)
    };
  }

  createChunkIterator(data, options = {}) {
    if (!data || data.length === 0) {
      return {
        [Symbol.iterator]: function* () {}
      };
    }

    const sortedData = this.sortRequired 
      ? [...data].sort((a, b) => new Date(a[this.dateField]) - new Date(b[this.dateField]))
      : data;

    const self = this;
    let currentIndex = 0;
    let chunkIndex = 0;
    const totalChunks = Math.ceil(sortedData.length / this.chunkSize);

    return {
      [Symbol.iterator]: function* () {
        while (currentIndex < sortedData.length) {
          const startIndex = Math.max(0, currentIndex - self.overlapSize);
          const endIndex = Math.min(sortedData.length, currentIndex + self.chunkSize);
          const chunk = sortedData.slice(startIndex, endIndex);

          yield {
            data: chunk,
            metadata: {
              chunkIndex,
              startIndex,
              endIndex,
              isFirst: chunkIndex === 0,
              isLast: endIndex >= sortedData.length,
              totalChunks,
              progress: Math.min(100, ((chunkIndex + 1) / totalChunks) * 100)
            }
          };

          currentIndex = endIndex;
          chunkIndex++;
        }
      }
    };
  }

  async createAsyncChunkIterator(data, options = {}) {
    if (!data || data.length === 0) {
      return {
        [Symbol.asyncIterator]: async function* () {}
      };
    }

    const sortedData = this.sortRequired 
      ? [...data].sort((a, b) => new Date(a[this.dateField]) - new Date(b[this.dateField]))
      : data;

    const self = this;
    let currentIndex = 0;
    let chunkIndex = 0;
    const totalChunks = Math.ceil(sortedData.length / this.chunkSize);

    return {
      [Symbol.asyncIterator]: async function* () {
        while (currentIndex < sortedData.length) {
          const startIndex = Math.max(0, currentIndex - self.overlapSize);
          const endIndex = Math.min(sortedData.length, currentIndex + self.chunkSize);
          const chunk = sortedData.slice(startIndex, endIndex);

          yield {
            data: chunk,
            metadata: {
              chunkIndex,
              startIndex,
              endIndex,
              isFirst: chunkIndex === 0,
              isLast: endIndex >= sortedData.length,
              totalChunks,
              progress: Math.min(100, ((chunkIndex + 1) / totalChunks) * 100)
            }
          };

          currentIndex = endIndex;
          chunkIndex++;

          if (options.delayMs && currentIndex < sortedData.length) {
            await self.sleep(options.delayMs);
          }
        }
      }
    };
  }

  aggregateChunkResults(results, field = 'value') {
    const allValues = [];
    
    for (const result of results) {
      if (result && result[field] !== undefined) {
        if (Array.isArray(result[field])) {
          allValues.push(...result[field]);
        } else {
          allValues.push(result[field]);
        }
      }
    }

    return {
      values: allValues,
      count: allValues.length,
      summary: allValues.length > 0 ? StatisticsUtils.summary(allValues) : null
    };
  }

  processTimeSeriesChunks(data, aggregationLevel = 'day', processorFn) {
    const groups = TimeSeriesUtils.groupByDate(data, this.dateField, this.valueField, aggregationLevel);
    const results = [];
    const groupChunks = this.chunkArray(groups, this.chunkSize);

    for (let i = 0; i < groupChunks.length; i++) {
      const chunk = groupChunks[i];
      const result = processorFn(chunk, {
        chunkIndex: i,
        totalChunks: groupChunks.length,
        isFirst: i === 0,
        isLast: i === groupChunks.length - 1
      });
      results.push(result);
    }

    return results;
  }

  async processTimeSeriesChunksAsync(data, aggregationLevel = 'day', processorAsyncFn) {
    const groups = TimeSeriesUtils.groupByDate(data, this.dateField, this.valueField, aggregationLevel);
    const results = [];
    const groupChunks = this.chunkArray(groups, this.chunkSize);

    for (let i = 0; i < groupChunks.length; i++) {
      const chunk = groupChunks[i];
      const result = await processorAsyncFn(chunk, {
        chunkIndex: i,
        totalChunks: groupChunks.length,
        isFirst: i === 0,
        isLast: i === groupChunks.length - 1,
        progress: Math.min(100, ((i + 1) / groupChunks.length) * 100)
      });
      results.push(result);
    }

    return results;
  }

  createWindowedChunks(data, windowSize, stepSize = null) {
    if (!data || data.length === 0 || windowSize <= 0) {
      return [];
    }

    const sortedData = this.sortRequired 
      ? [...data].sort((a, b) => new Date(a[this.dateField]) - new Date(b[this.dateField]))
      : data;

    const effectiveStep = stepSize || Math.floor(windowSize / 2);
    const windows = [];

    for (let i = 0; i + windowSize <= sortedData.length; i += effectiveStep) {
      const windowData = sortedData.slice(i, i + windowSize);
      windows.push({
        data: windowData,
        startIndex: i,
        endIndex: i + windowSize,
        startDate: windowData[0][this.dateField],
        endDate: windowData[windowData.length - 1][this.dateField]
      });
    }

    if (windows.length === 0 && sortedData.length > 0) {
      windows.push({
        data: sortedData,
        startIndex: 0,
        endIndex: sortedData.length,
        startDate: sortedData[0][this.dateField],
        endDate: sortedData[sortedData.length - 1][this.dateField]
      });
    }

    return windows;
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  mergeChunkedData(chunks, options = {}) {
    if (!chunks || chunks.length === 0) return [];

    const dedupKey = options.dedupKey || this.dateField;
    const seen = new Set();
    const merged = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const start = i === 0 ? 0 : Math.min(chunk.length, this.overlapSize);
      
      for (let j = start; j < chunk.length; j++) {
        const item = chunk[j];
        const key = item[dedupKey];
        
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(item);
        }
      }
    }

    if (this.sortRequired) {
      merged.sort((a, b) => new Date(a[dedupKey]) - new Date(b[dedupKey]));
    }

    return merged;
  }

  getChunkInfo(data) {
    if (!data || data.length === 0) {
      return {
        totalRecords: 0,
        chunkSize: this.chunkSize,
        overlapSize: this.overlapSize,
        totalChunks: 0,
        estimatedMemory: 0
      };
    }

    const totalChunks = Math.ceil(data.length / this.chunkSize);
    const avgRecordSize = this.estimateRecordSize(data[0]);

    return {
      totalRecords: data.length,
      chunkSize: this.chunkSize,
      overlapSize: this.overlapSize,
      totalChunks,
      chunkMemoryEstimate: (this.chunkSize * avgRecordSize) / 1024 / 1024,
      totalMemoryEstimate: (data.length * avgRecordSize) / 1024 / 1024,
      processingTimeEstimate: this.estimateProcessingTime(data.length)
    };
  }

  estimateRecordSize(record) {
    if (!record) return 100;
    return JSON.stringify(record).length * 2;
  }

  estimateProcessingTime(recordCount) {
    const msPerRecord = 0.01;
    const totalMs = recordCount * msPerRecord;
    
    return {
      milliseconds: totalMs,
      seconds: totalMs / 1000,
      minutes: totalMs / 1000 / 60
    };
  }

  summarizeResults(results) {
    if (!results || results.length === 0) {
      return null;
    }

    const successCount = results.filter(r => r && r.success !== false).length;
    const errorCount = results.filter(r => r && r.error).length;

    return {
      totalResults: results.length,
      successCount,
      errorCount,
      successRate: successCount / results.length,
      hasErrors: errorCount > 0
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const timeSeriesChunkReader = new TimeSeriesChunkReader();
export default TimeSeriesChunkReader;
