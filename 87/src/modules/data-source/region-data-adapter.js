import { 
  REGION_CALIBRATION_CONFIG,
  getRegionConfig,
  getCalibrationFactor,
  getAdaptedRunoffCoefficient,
  getSeasonalFactor,
  calculateAdaptedFlowThresholds,
  getDataQualityParams
} from '@config/region-calibration.config.js';
import { StatisticsUtils } from '@utils/statistics.utils.js';

export class RegionDataAdapter {
  constructor(regionId, options = {}) {
    this.regionId = regionId;
    this.options = options;
    this.regionConfig = getRegionConfig(regionId);
    
    if (!this.regionConfig) {
      console.warn(`Region configuration not found for: ${regionId}, using defaults`);
    }
  }

  calibrateRunoffData(rawData, options = {}) {
    if (!rawData || rawData.length === 0) {
      return { calibrated: [], stats: null, quality: null };
    }

    const calibrationFactors = this.getCalibrationFactors();
    const qualityParams = getDataQualityParams(this.regionId);

    let processedCount = 0;
    let gapFilledCount = 0;
    let outlierCount = 0;
    let adjustedCount = 0;

    const calibrated = rawData.map(item => {
      const calibratedItem = { ...item };
      
      if (calibratedItem.runoff_value !== null && calibratedItem.runoff_value !== undefined) {
        const originalValue = Number(calibratedItem.runoff_value);
        
        if (!isNaN(originalValue) && originalValue >= 0) {
          const adjustedValue = this.adjustRunoffValue(
            originalValue, 
            calibratedItem.record_time,
            calibrationFactors
          );
          
          calibratedItem.runoff_value = Number(adjustedValue.toFixed(4));
          calibratedItem.original_runoff_value = originalValue;
          calibratedItem.calibrated = true;
          calibratedItem.calibration_factor = Number((adjustedValue / originalValue).toFixed(4));
          adjustedCount++;
        }
      }

      if (options.fillGaps && this.isGap(calibratedItem)) {
        calibratedItem.runoff_value = this.estimateMissingValue(calibratedItem, rawData);
        calibratedItem.gap_filled = true;
        gapFilledCount++;
      }

      if (options.removeOutliers && this.isOutlier(calibratedItem, rawData)) {
        calibratedItem.outlier = true;
        outlierCount++;
      }

      if (calibratedItem.runoff_value !== undefined) {
        processedCount++;
      }

      return calibratedItem;
    });

    const validValues = calibrated
      .filter(d => d.runoff_value !== null && !isNaN(d.runoff_value) && d.runoff_value >= 0)
      .map(d => d.runoff_value);

    return {
      calibrated,
      stats: validValues.length > 0 ? StatisticsUtils.summary(validValues) : null,
      quality: {
        regionId: this.regionId,
        totalRecords: rawData.length,
        processedCount,
        gapFilledCount,
        outlierCount,
        adjustedCount,
        gapRate: gapFilledCount / rawData.length,
        outlierRate: outlierCount / rawData.length,
        meetsQualityStandards: (
          gapFilledCount / rawData.length <= qualityParams.maxGapRate &&
          outlierCount / rawData.length <= qualityParams.maxOutlierRate
        )
      },
      calibrationFactors
    };
  }

  getCalibrationFactors() {
    if (!this.regionConfig) {
      return {
        rainfallRunoff: 1.0,
        temperatureEvaporation: 1.0,
        snowmeltContribution: 0.0,
        regionalAdjustment: 1.0
      };
    }

    return {
      ...this.regionConfig.calibrationFactors,
      regionalAdjustment: this.options.regionalAdjustment || 1.0
    };
  }

  adjustRunoffValue(value, recordTime, factors) {
    if (!recordTime) return value;

    let adjusted = value;
    const date = new Date(recordTime);
    const month = date.getMonth() + 1;

    const seasonalFactor = getSeasonalFactor(this.regionId, month);
    adjusted *= seasonalFactor;

    if (factors.rainfallRunoff) {
      adjusted *= factors.rainfallRunoff;
    }

    if (factors.temperatureEvaporation) {
      adjusted *= factors.temperatureEvaporation;
    }

    if (factors.snowmeltContribution && this.isSnowmeltSeason(month)) {
      adjusted *= (1 + factors.snowmeltContribution);
    }

    if (factors.regionalAdjustment) {
      adjusted *= factors.regionalAdjustment;
    }

    return Math.max(0, adjusted);
  }

  isSnowmeltSeason(month) {
    if (!this.regionConfig?.seasonalPattern?.snowmeltSeason) {
      return month >= 3 && month <= 5;
    }
    return this.regionConfig.seasonalPattern.snowmeltSeason.months.includes(month);
  }

  isGap(item) {
    return item.runoff_value === null || 
           item.runoff_value === undefined || 
           isNaN(Number(item.runoff_value));
  }

  estimateMissingValue(item, allData) {
    const date = new Date(item.record_time);
    const month = date.getMonth() + 1;
    const dayOfYear = this.getDayOfYear(date);

    const sameMonthData = allData.filter(d => {
      const dDate = new Date(d.record_time);
      return dDate.getMonth() + 1 === month && 
             d.runoff_value !== null && 
             !isNaN(d.runoff_value);
    });

    if (sameMonthData.length >= 5) {
      const values = sameMonthData.map(d => Number(d.runoff_value));
      return StatisticsUtils.mean(values);
    }

    const nearestData = this.findNearestRecords(item, allData, 10);
    if (nearestData.length >= 3) {
      const values = nearestData.map(d => Number(d.runoff_value));
      return StatisticsUtils.mean(values);
    }

    if (this.regionConfig?.avgAnnualRunoff?.typical) {
      const seasonalFactor = getSeasonalFactor(this.regionId, month);
      return this.regionConfig.avgAnnualRunoff.typical / 365 * seasonalFactor;
    }

    return 0;
  }

  getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  findNearestRecords(targetItem, allData, count) {
    const targetDate = new Date(targetItem.record_time);
    
    return allData
      .filter(d => d.runoff_value !== null && !isNaN(d.runoff_value))
      .map(d => ({
        ...d,
        diff: Math.abs(new Date(d.record_time) - targetDate)
      }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, count);
  }

  isOutlier(item, allData) {
    const value = Number(item.runoff_value);
    if (value === null || isNaN(value)) return false;

    const values = allData
      .filter(d => d.runoff_value !== null && !isNaN(d.runoff_value))
      .map(d => Number(d.runoff_value));

    if (values.length < 10) return false;

    const q1 = StatisticsUtils.percentile(values, 25);
    const q3 = StatisticsUtils.percentile(values, 75);
    const iqr = q3 - q1;
    
    const lowerBound = q1 - 3 * iqr;
    const upperBound = q3 + 3 * iqr;

    return value < lowerBound || value > upperBound;
  }

  adaptToRegion(data, sourceRegionId, targetRegionId) {
    if (sourceRegionId === targetRegionId) {
      return data;
    }

    const sourceConfig = getRegionConfig(sourceRegionId);
    const targetConfig = getRegionConfig(targetRegionId);

    if (!sourceConfig || !targetConfig) {
      return data;
    }

    const sourceRainfall = sourceConfig.avgAnnualRainfall.typical;
    const targetRainfall = targetConfig.avgAnnualRainfall.typical;
    const rainfallRatio = targetRainfall / sourceRainfall;

    const sourceRunoff = sourceConfig.avgAnnualRunoff.typical;
    const targetRunoff = targetConfig.avgAnnualRunoff.typical;
    const runoffRatio = targetRunoff / sourceRunoff;

    return data.map(item => {
      const adapted = { ...item };
      
      if (adapted.runoff_value !== null && adapted.runoff_value !== undefined) {
        const original = Number(adapted.runoff_value);
        if (!isNaN(original)) {
          adapted.runoff_value = Number((original * runoffRatio).toFixed(4));
          adapted.adapted_from = sourceRegionId;
          adapted.adapted_to = targetRegionId;
          adapted.adaptation_factor = runoffRatio;
        }
      }

      if (adapted.rainfall_value !== null && adapted.rainfall_value !== undefined) {
        const original = Number(adapted.rainfall_value);
        if (!isNaN(original)) {
          adapted.rainfall_value = Number((original * rainfallRatio).toFixed(4));
        }
      }

      return adapted;
    });
  }

  generateBaselineData(days = 365, options = {}) {
    const baseline = [];
    const startDate = options.startDate || new Date();
    const config = this.regionConfig;

    if (!config) {
      return baseline;
    }

    const avgDailyRunoff = config.avgAnnualRunoff.typical / 365;

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const month = date.getMonth() + 1;

      const seasonalFactor = getSeasonalFactor(this.regionId, month);
      const randomFactor = 0.9 + Math.random() * 0.2;
      const runoff = avgDailyRunoff * seasonalFactor * randomFactor;

      baseline.push({
        record_time: date.toISOString().replace('T', ' ').substring(0, 19),
        runoff_value: Number(Math.max(0, runoff).toFixed(4)),
        baseline: true,
        region_id: this.regionId
      });
    }

    return baseline;
  }

  getFlowThresholds(baseFlow) {
    return calculateAdaptedFlowThresholds(this.regionId, baseFlow);
  }

  getRunoffCoefficient(landUseType) {
    return getAdaptedRunoffCoefficient(this.regionId, landUseType);
  }

  validateDataQuality(data) {
    const qualityParams = getDataQualityParams(this.regionId);
    
    let gapCount = 0;
    let outlierCount = 0;
    const values = [];

    for (const item of data) {
      const value = item.runoff_value;
      if (value === null || value === undefined || isNaN(value)) {
        gapCount++;
      } else {
        values.push(Number(value));
      }
    }

    if (values.length >= 10) {
      const q1 = StatisticsUtils.percentile(values, 25);
      const q3 = StatisticsUtils.percentile(values, 75);
      const iqr = q3 - q1;
      const upperBound = q3 + 3 * iqr;
      const lowerBound = q1 - 3 * iqr;

      for (const value of values) {
        if (value > upperBound || value < lowerBound) {
          outlierCount++;
        }
      }
    }

    const gapRate = gapCount / data.length;
    const outlierRate = outlierCount / data.length;

    return {
      regionId: this.regionId,
      totalRecords: data.length,
      validRecords: values.length,
      gapCount,
      outlierCount,
      gapRate,
      outlierRate,
      maxAllowedGapRate: qualityParams.maxGapRate,
      maxAllowedOutlierRate: qualityParams.maxOutlierRate,
      gapQuality: gapRate <= qualityParams.maxGapRate ? 'good' : gapRate <= qualityParams.maxGapRate * 2 ? 'warning' : 'poor',
      outlierQuality: outlierRate <= qualityParams.maxOutlierRate ? 'good' : outlierRate <= qualityParams.maxOutlierRate * 2 ? 'warning' : 'poor',
      overallQuality: (
        gapRate <= qualityParams.maxGapRate && 
        outlierRate <= qualityParams.maxOutlierRate
      ) ? 'good' : (
        gapRate <= qualityParams.maxGapRate * 2 && 
        outlierRate <= qualityParams.maxOutlierRate * 2
      ) ? 'warning' : 'poor'
    };
  }

  getRegionInfo() {
    if (!this.regionConfig) {
      return { id: this.regionId, name: '未知区域', available: false };
    }

    return {
      id: this.regionConfig.id,
      name: this.regionConfig.name,
      description: this.regionConfig.description,
      climate: this.regionConfig.climate,
      avgAnnualRainfall: this.regionConfig.avgAnnualRainfall,
      avgAnnualRunoff: this.regionConfig.avgAnnualRunoff,
      available: true
    };
  }
}

export const createRegionAdapter = (regionId, options) => {
  return new RegionDataAdapter(regionId, options);
};

export default RegionDataAdapter;
