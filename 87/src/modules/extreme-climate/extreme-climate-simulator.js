import { StatisticsUtils } from '@utils/statistics.utils.js';
import { TimeSeriesUtils } from '@utils/time-series.utils.js';
import { HydrologyUtils } from '@utils/hydrology.utils.js';

export const EXTREME_CLIMATE_TYPES = {
  DROUGHT: 'drought',
  FLOOD: 'flood',
  HEATWAVE: 'heatwave',
  COLD_SNAP: 'cold_snap',
  TYPHOON: 'typhoon',
  RAINSTORM: 'rainstorm'
};

export class ExtremeClimateSimulator {
  constructor(options = {}) {
    this.options = options;
    this.defaultReturnPeriod = options.defaultReturnPeriod || 100;
    this.simulationRuns = options.simulationRuns || 1000;
  }

  simulateExtremeRunoff(historicalData, climateType, intensity = 'medium', duration = 7) {
    if (!historicalData || historicalData.length === 0) {
      return this.createEmptyResult(climateType, intensity, duration);
    }

    const values = historicalData.map(d => d.runoff_value).filter(v => v !== null && !isNaN(v));
    if (values.length === 0) {
      return this.createEmptyResult(climateType, intensity, duration);
    }

    const baseStats = StatisticsUtils.summary(values);
    const climateParams = this.getClimateParameters(climateType, intensity);
    
    const simulatedData = this.generateSimulatedData(
      historicalData,
      climateParams,
      duration,
      baseStats
    );

    const riskAssessment = this.assessRisk(simulatedData, baseStats, climateType);
    const impactAnalysis = this.analyzeImpact(simulatedData, climateType);

    return {
      climateType,
      intensity,
      duration,
      baseStats,
      climateParams,
      simulatedData,
      simulatedStats: StatisticsUtils.summary(simulatedData.map(d => d.runoff_value)),
      riskAssessment,
      impactAnalysis,
      returnPeriod: this.calculateReturnPeriod(simulatedData, baseStats)
    };
  }

  createEmptyResult(climateType, intensity, duration) {
    return {
      climateType,
      intensity,
      duration,
      baseStats: null,
      climateParams: this.getClimateParameters(climateType, intensity),
      simulatedData: [],
      simulatedStats: null,
      riskAssessment: { level: 'unknown', score: 0 },
      impactAnalysis: null,
      returnPeriod: null
    };
  }

  getClimateParameters(climateType, intensity) {
    const intensityMultipliers = {
      low: 0.5,
      medium: 1.0,
      high: 1.5,
      extreme: 2.0
    };

    const multiplier = intensityMultipliers[intensity] || 1.0;

    const climateConfigs = {
      [EXTREME_CLIMATE_TYPES.DROUGHT]: {
        name: '极端干旱',
        runoffMultiplier: 0.1 + (1 - multiplier) * 0.3,
        durationEffect: 0.02,
        recoveryRate: 0.05,
        impactAreas: ['农业', '生态', '供水'],
        color: '#ee6666'
      },
      [EXTREME_CLIMATE_TYPES.FLOOD]: {
        name: '特大洪水',
        runoffMultiplier: 2.0 + multiplier * 3.0,
        durationEffect: 0.1,
        recoveryRate: 0.15,
        impactAreas: ['防洪', '交通', '居民区'],
        color: '#5470c6'
      },
      [EXTREME_CLIMATE_TYPES.HEATWAVE]: {
        name: '高温热浪',
        runoffMultiplier: 0.4 + (1 - multiplier) * 0.3,
        durationEffect: 0.03,
        recoveryRate: 0.08,
        impactAreas: ['生态', '农业', '供水'],
        color: '#fac858'
      },
      [EXTREME_CLIMATE_TYPES.COLD_SNAP]: {
        name: '寒潮低温',
        runoffMultiplier: 0.7,
        durationEffect: 0.05,
        recoveryRate: 0.1,
        impactAreas: ['生态', '航运'],
        color: '#91cc75'
      },
      [EXTREME_CLIMATE_TYPES.TYPHOON]: {
        name: '台风暴雨',
        runoffMultiplier: 3.0 + multiplier * 4.0,
        durationEffect: 0.15,
        recoveryRate: 0.2,
        impactAreas: ['防洪', '基础设施', '居民区'],
        color: '#73c0de'
      },
      [EXTREME_CLIMATE_TYPES.RAINSTORM]: {
        name: '暴雨洪涝',
        runoffMultiplier: 2.5 + multiplier * 2.5,
        durationEffect: 0.12,
        recoveryRate: 0.18,
        impactAreas: ['防洪', '农业', '交通'],
        color: '#3ba272'
      }
    };

    return climateConfigs[climateType] || climateConfigs[EXTREME_CLIMATE_TYPES.FLOOD];
  }

  generateSimulatedData(historicalData, climateParams, duration, baseStats) {
    const simulated = [];
    const lastDate = historicalData[historicalData.length - 1].record_time;
    const startDate = new Date(lastDate);

    for (let i = 0; i < duration; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i + 1);

      const baseValue = baseStats.mean;
      const randomFactor = 0.8 + Math.random() * 0.4;
      
      let runoffMultiplier = climateParams.runoffMultiplier;
      if (i < duration * 0.3) {
        runoffMultiplier *= (i / (duration * 0.3));
      } else if (i > duration * 0.7) {
        runoffMultiplier *= (1 - (i - duration * 0.7) / (duration * 0.3));
      }

      const simulatedRunoff = baseValue * runoffMultiplier * randomFactor;
      const baseFlow = baseStats.mean * 0.3;

      simulated.push({
        record_time: date.toISOString().replace('T', ' ').substring(0, 19),
        runoff_value: Number(Math.max(0, simulatedRunoff).toFixed(3)),
        base_flow: Number(baseFlow.toFixed(3)),
        anomaly_ratio: Number((simulatedRunoff / baseStats.mean).toFixed(2)),
        simulation_day: i + 1,
        is_simulated: true
      });
    }

    return simulated;
  }

  assessRisk(simulatedData, baseStats, climateType) {
    if (simulatedData.length === 0) {
      return { level: 'unknown', score: 0, factors: [] };
    }

    const values = simulatedData.map(d => d.runoff_value);
    const maxSimulated = StatisticsUtils.max(values);
    const meanSimulated = StatisticsUtils.mean(values);

    const deviationRatio = Math.abs(meanSimulated - baseStats.mean) / baseStats.mean;
    const peakRatio = maxSimulated / baseStats.mean;

    let riskScore = 0;
    const factors = [];

    if (climateType === EXTREME_CLIMATE_TYPES.DROUGHT || climateType === EXTREME_CLIMATE_TYPES.HEATWAVE) {
      if (meanSimulated < baseStats.mean * 0.2) {
        riskScore += 40;
        factors.push({ name: '流量严重不足', weight: 40 });
      } else if (meanSimulated < baseStats.mean * 0.5) {
        riskScore += 25;
        factors.push({ name: '流量显著减少', weight: 25 });
      }
    } else {
      if (peakRatio > 5) {
        riskScore += 45;
        factors.push({ name: '洪峰流量超标', weight: 45 });
      } else if (peakRatio > 3) {
        riskScore += 30;
        factors.push({ name: '流量显著增加', weight: 30 });
      }
    }

    const durationFactor = simulatedData.length > 15 ? 25 : simulatedData.length > 7 ? 15 : 5;
    riskScore += durationFactor;
    factors.push({ name: '持续时间', weight: durationFactor });

    let level;
    if (riskScore >= 70) level = 'critical';
    else if (riskScore >= 50) level = 'high';
    else if (riskScore >= 30) level = 'medium';
    else level = 'low';

    return {
      level,
      score: Math.min(100, riskScore),
      factors
    };
  }

  analyzeImpact(simulatedData, climateType) {
    if (simulatedData.length === 0) return null;

    const values = simulatedData.map(d => d.runoff_value);
    const totalRunoff = StatisticsUtils.sum(values);
    const peakValue = StatisticsUtils.max(values);
    const meanValue = StatisticsUtils.mean(values);

    return {
      totalRunoff,
      peakValue,
      meanValue,
      duration: simulatedData.length,
      affectedAreas: this.getClimateParameters(climateType, 'medium').impactAreas,
      economicImpact: this.estimateEconomicImpact(peakValue, simulatedData.length, climateType),
      ecologicalImpact: this.estimateEcologicalImpact(meanValue, climateType),
      mitigationMeasures: this.getMitigationMeasures(climateType)
    };
  }

  estimateEconomicImpact(peakValue, duration, climateType) {
    let baseImpact = peakValue * duration * 1000;
    
    const multipliers = {
      [EXTREME_CLIMATE_TYPES.FLOOD]: 2.5,
      [EXTREME_CLIMATE_TYPES.TYPHOON]: 3.0,
      [EXTREME_CLIMATE_TYPES.RAINSTORM]: 2.0,
      [EXTREME_CLIMATE_TYPES.DROUGHT]: 1.5,
      [EXTREME_CLIMATE_TYPES.HEATWAVE]: 1.2,
      [EXTREME_CLIMATE_TYPES.COLD_SNAP]: 1.0
    };

    const impact = baseImpact * (multipliers[climateType] || 1);
    
    return {
      estimatedLoss: Number(impact.toFixed(0)),
      currency: 'CNY',
      confidence: 'medium'
    };
  }

  estimateEcologicalImpact(meanValue, climateType) {
    let impactScore;
    
    if (climateType === EXTREME_CLIMATE_TYPES.DROUGHT || climateType === EXTREME_CLIMATE_TYPES.HEATWAVE) {
      impactScore = meanValue < 1 ? 90 : meanValue < 2 ? 60 : 30;
    } else {
      impactScore = meanValue > 30 ? 85 : meanValue > 15 ? 55 : 25;
    }

    let level;
    if (impactScore >= 70) level = 'severe';
    else if (impactScore >= 40) level = 'moderate';
    else level = 'mild';

    return {
      score: impactScore,
      level,
      affectedSpecies: this.getAffectedSpecies(climateType)
    };
  }

  getAffectedSpecies(climateType) {
    const species = {
      [EXTREME_CLIMATE_TYPES.DROUGHT]: ['鱼类', '两栖类', '水生植物'],
      [EXTREME_CLIMATE_TYPES.FLOOD]: ['底栖生物', '河岸植被', '鸟类栖息地'],
      [EXTREME_CLIMATE_TYPES.HEATWAVE]: ['冷水性鱼类', '浮游生物'],
      [EXTREME_CLIMATE_TYPES.COLD_SNAP]: ['暖水性鱼类', '无脊椎动物'],
      [EXTREME_CLIMATE_TYPES.TYPHOON]: ['河岸生态系统', '湿地物种'],
      [EXTREME_CLIMATE_TYPES.RAINSTORM]: ['水体生物', '岸线植被']
    };
    return species[climateType] || [];
  }

  getMitigationMeasures(climateType) {
    const measures = {
      [EXTREME_CLIMATE_TYPES.DROUGHT]: [
        '启动应急供水预案',
        '加强水资源统一调度',
        '实施人工增雨作业',
        '限制高耗水行业用水'
      ],
      [EXTREME_CLIMATE_TYPES.FLOOD]: [
        '启动防汛应急预案',
        '加强水库调度',
        '组织危险区域人员转移',
        '加强巡查值守'
      ],
      [EXTREME_CLIMATE_TYPES.HEATWAVE]: [
        '加强防暑降温工作',
        '保障城乡供水安全',
        '关注弱势群体健康',
        '做好抗旱准备'
      ],
      [EXTREME_CLIMATE_TYPES.COLD_SNAP]: [
        '做好防寒防冻工作',
        '保障交通畅通',
        '关注供暖供气安全',
        '做好农作物防寒'
      ],
      [EXTREME_CLIMATE_TYPES.TYPHOON]: [
        '启动防台风应急预案',
        '组织人员转移避险',
        '停止户外作业',
        '加强基础设施防护'
      ],
      [EXTREME_CLIMATE_TYPES.RAINSTORM]: [
        '启动暴雨应急预案',
        '加强城市排涝',
        '防范地质灾害',
        '做好交通疏导'
      ]
    };
    return measures[climateType] || [];
  }

  calculateReturnPeriod(simulatedData, baseStats) {
    if (simulatedData.length === 0) return null;

    const maxSimulated = StatisticsUtils.max(simulatedData.map(d => d.runoff_value));
    const ratio = maxSimulated / baseStats.mean;

    if (ratio > 10) return { years: 1000, description: '千年一遇' };
    if (ratio > 7) return { years: 500, description: '五百年一遇' };
    if (ratio > 5) return { years: 200, description: '两百年一遇' };
    if (ratio > 4) return { years: 100, description: '百年一遇' };
    if (ratio > 3) return { years: 50, description: '五十年一遇' };
    if (ratio > 2.5) return { years: 20, description: '二十年一遇' };
    if (ratio > 2) return { years: 10, description: '十年一遇' };
    return { years: 5, description: '五年一遇' };
  }

  generateMultiScenarioAnalysis(historicalData, scenarios) {
    return scenarios.map(scenario => ({
      scenario: scenario.name,
      climateType: scenario.climateType,
      intensity: scenario.intensity,
      duration: scenario.duration,
      result: this.simulateExtremeRunoff(
        historicalData,
        scenario.climateType,
        scenario.intensity,
        scenario.duration
      )
    }));
  }
}

export const extremeClimateSimulator = new ExtremeClimateSimulator();
export default ExtremeClimateSimulator;
