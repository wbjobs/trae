import { MissingValueHandler } from './missing-value-handler.js';
import { NoiseReductionProcessor } from './noise-reduction-processor.js';
import { OutlierDetector } from './outlier-detector.js';

export class RunoffDataCleaner {
  constructor(options = {}) {
    this.missingValueHandler = new MissingValueHandler(options.missingValue || {});
    this.noiseReductionProcessor = new NoiseReductionProcessor(options.noiseReduction || {});
    this.outlierDetector = new OutlierDetector(options.outlier || {});
    this.enableStreaming = options.enableStreaming !== false;
    this.chunkSize = options.chunkSize || 50000;
    
    this.pipeline = options.pipeline || [
      'handleMissingValues',
      'detectOutliers',
      'reduceNoise'
    ];
  }

  async clean(data, options = {}) {
    if (!data || data.length === 0) {
      return {
        cleanedData: [],
        stats: this.generateEmptyStats()
      };
    }

    if (this.enableStreaming && data.length > this.chunkSize) {
      return this.cleanStreaming(data, options);
    }

    let currentData = [...data];
    const stats = {
      originalCount: data.length,
      processedCount: 0,
      outlierCount: 0,
      missingValueCount: 0,
      noiseReduced: false,
      processingSteps: []
    };

    for (const step of this.pipeline) {
      switch (step) {
        case 'handleMissingValues':
          currentData = this.handleMissingValues(currentData, options.valueField);
          stats.missingValueCount = currentData.filter(d => d._filled).length;
          stats.processingSteps.push({
            step: 'handleMissingValues',
            count: stats.missingValueCount
          });
          break;
        case 'detectOutliers':
          currentData = this.detectOutliers(currentData, options.valueField, options.outlierAction);
          stats.outlierCount = currentData.filter(d => d._isOutlier || d._outlierReplaced).length;
          stats.processingSteps.push({
            step: 'detectOutliers',
            count: stats.outlierCount
          });
          break;
        case 'reduceNoise':
          currentData = this.reduceNoise(currentData, options.valueField);
          stats.noiseReduced = true;
          stats.processingSteps.push({
            step: 'reduceNoise',
            count: currentData.filter(d => d._smoothed).length
          });
          break;
      }
    }

    stats.processedCount = currentData.length;

    return {
      cleanedData: currentData,
      stats
    };
  }

  async cleanStreaming(data, options = {}) {
    const result = [];
    const totalStats = {
      originalCount: data.length,
      processedCount: 0,
      outlierCount: 0,
      missingValueCount: 0,
      noiseReduced: false,
      processingSteps: []
    };

    const overlap = 100;
    
    for (let i = 0; i < data.length; i += this.chunkSize) {
      const chunkStart = Math.max(0, i - overlap);
      const chunkEnd = Math.min(data.length, i + this.chunkSize + overlap);
      const chunk = data.slice(chunkStart, chunkEnd);
      
      let processedChunk = [...chunk];
      
      for (const step of this.pipeline) {
        switch (step) {
          case 'handleMissingValues':
            processedChunk = this.handleMissingValues(processedChunk, options.valueField);
            break;
          case 'detectOutliers':
            processedChunk = this.detectOutliers(processedChunk, options.valueField, options.outlierAction);
            break;
          case 'reduceNoise':
            processedChunk = this.reduceNoise(processedChunk, options.valueField);
            totalStats.noiseReduced = true;
            break;
        }
      }
      
      const offset = i - chunkStart;
      const takeCount = Math.min(this.chunkSize, data.length - i);
      for (let j = 0; j < takeCount; j++) {
        result.push(processedChunk[offset + j]);
      }
      
      totalStats.missingValueCount += processedChunk.filter(d => d._filled).length;
      totalStats.outlierCount += processedChunk.filter(d => d._isOutlier || d._outlierReplaced).length;
    }
    
    totalStats.processedCount = result.length;
    totalStats.processingSteps = this.pipeline.map(step => ({ step }));

    return {
      cleanedData: result,
      stats: totalStats
    };
  }

  handleMissingValues(data, valueField = 'runoff_value') {
    return this.missingValueHandler.handle(data, valueField);
  }

  detectOutliers(data, valueField = 'runoff_value', action = 'flag') {
    if (action === 'remove') {
      return this.outlierDetector.removeOutliers(data, valueField);
    } else if (action === 'replace') {
      return this.outlierDetector.replaceOutliers(data, valueField);
    } else {
      return this.outlierDetector.detect(data, valueField);
    }
  }

  reduceNoise(data, valueField = 'runoff_value') {
    return this.noiseReductionProcessor.process(data, valueField);
  }

  generateEmptyStats() {
    return {
      originalCount: 0,
      processedCount: 0,
      outlierCount: 0,
      missingValueCount: 0,
      noiseReduced: false,
      processingSteps: []
    };
  }

  validateData(data, valueField = 'runoff_value') {
    const issues = [];
    
    if (!data || data.length === 0) {
      issues.push({ type: 'empty', message: '数据集为空' });
      return { valid: false, issues };
    }

    const nullCount = data.filter(d => d[valueField] === null || d[valueField] === undefined).length;
    if (nullCount > 0) {
      issues.push({ type: 'missing', message: `发现 ${nullCount} 个缺失值` });
    }

    const nanCount = data.filter(d => isNaN(d[valueField])).length;
    if (nanCount > 0) {
      issues.push({ type: 'invalid', message: `发现 ${nanCount} 个无效值` });
    }

    const negativeCount = data.filter(d => d[valueField] < 0).length;
    if (negativeCount > 0) {
      issues.push({ type: 'negative', message: `发现 ${negativeCount} 个负值（径流量不能为负）` });
    }

    const detected = this.outlierDetector.detect(data, valueField);
    const outlierCount = detected.filter(d => d._isOutlier).length;
    if (outlierCount > data.length * 0.1) {
      issues.push({ type: 'outlier', message: `异常值比例较高: ${(outlierCount / data.length * 100).toFixed(1)}%` });
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

export const runoffDataCleaner = new RunoffDataCleaner();
export default RunoffDataCleaner;
