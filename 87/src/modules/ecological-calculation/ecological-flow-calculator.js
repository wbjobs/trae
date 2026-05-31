import { StatisticsUtils } from '@utils/statistics.utils.js';
import { TimeSeriesUtils } from '@utils/time-series.utils.js';
import { HydrologyUtils } from '@utils/hydrology.utils.js';

export class EcologicalFlowCalculator {
  constructor(options = {}) {
    this.method = options.method || 'tennant';
    this.protectionLevel = options.protectionLevel || 'standard';
    this.fishSpawningPeriod = options.fishSpawningPeriod || [3, 4, 5];
    this.drySeasonPeriod = options.drySeasonPeriod || [11, 12, 1, 2];
    this.wetSeasonPeriod = options.wetSeasonPeriod || [6, 7, 8, 9, 10];
  }

  calculateEcologicalFlow(data, zoneConfig) {
    if (!data || data.length === 0) {
      return {
        zoneId: zoneConfig.id,
        zoneName: zoneConfig.name,
        method: this.method,
        protectionLevel: this.protectionLevel,
        meanAnnualFlow: 0,
        annualMinimum: 0,
        annualOptimal: 0
      };
    }

    const values = data.map(d => d.runoff_value);
    const daily = TimeSeriesUtils.calculateDailyStats(data, 'record_time', 'runoff_value');
    
    let results;
    
    switch (this.method) {
      case 'tennant':
        results = this.tennantMethod(values, data, zoneConfig);
        break;
      case 'q90':
        results = this.q90Method(data, zoneConfig);
        break;
      case 'flow-duration':
        results = this.flowDurationMethod(data, zoneConfig);
        break;
      case 'habitat-suitability':
        results = this.habitatSuitabilityMethod(data, zoneConfig);
        break;
      default:
        results = this.tennantMethod(values, data, zoneConfig);
    }
    
    return {
      ...results,
      zoneId: zoneConfig.id,
      zoneName: zoneConfig.name,
      method: this.method,
      protectionLevel: this.protectionLevel
    };
  }

  tennantMethod(values, data, zoneConfig) {
    if (values.length === 0) {
      return {
        meanAnnualFlow: 0,
        drySeasonFlow: 0,
        wetSeasonFlow: 0,
        annualMinimum: 0,
        annualOptimal: 0,
        protectionRatio: { dry: 0, wet: 0 },
        seasonalFlows: []
      };
    }

    const meanAnnualFlow = StatisticsUtils.mean(values);
    
    const protectionLevels = {
      'minimum': { dry: 0.1, wet: 0.2 },
      'standard': { dry: 0.3, wet: 0.4 },
      'good': { dry: 0.4, wet: 0.6 },
      'excellent': { dry: 0.6, wet: 0.8 }
    };
    
    const levels = protectionLevels[this.protectionLevel] || protectionLevels.standard;
    
    const drySeasonFlow = meanAnnualFlow * levels.dry;
    const wetSeasonFlow = meanAnnualFlow * levels.wet;
    
    return {
      meanAnnualFlow,
      drySeasonFlow,
      wetSeasonFlow,
      annualMinimum: Math.min(drySeasonFlow, wetSeasonFlow),
      annualOptimal: (drySeasonFlow + wetSeasonFlow) / 2,
      protectionRatio: {
        dry: levels.dry,
        wet: levels.wet
      },
      seasonalFlows: this.calculateSeasonalFlows(data, meanAnnualFlow, levels)
    };
  }

  q90Method(data, zoneConfig) {
    const fdc = HydrologyUtils.calculateFlowDurationCurve(data, 'runoff_value');
    const q90 = HydrologyUtils.getFlowPercentile(fdc, 90);
    const q75 = HydrologyUtils.getFlowPercentile(fdc, 75);
    const q50 = HydrologyUtils.getFlowPercentile(fdc, 50);
    
    return {
      q90,
      q75,
      q50,
      ecologicalFlowMin: q90,
      ecologicalFlowOpt: q75,
      ecologicalFlowMax: q50,
      flowDurationCurve: fdc
    };
  }

  flowDurationMethod(data, zoneConfig) {
    const daily = TimeSeriesUtils.calculateDailyStats(data, 'record_time', 'runoff_value');
    const fdc = HydrologyUtils.calculateFlowDurationCurve(data, 'runoff_value');
    
    const lowFlow = HydrologyUtils.getFlowPercentile(fdc, 90);
    const mediumFlow = HydrologyUtils.getFlowPercentile(fdc, 60);
    const highFlow = HydrologyUtils.getFlowPercentile(fdc, 30);
    
    const monthlyFDC = {};
    for (let month = 1; month <= 12; month++) {
      const monthData = data.filter(item => {
        const date = new Date(item.record_time);
        return date.getMonth() + 1 === month;
      });
      if (monthData.length > 0) {
        const monthFdc = HydrologyUtils.calculateFlowDurationCurve(monthData, 'runoff_value');
        monthlyFDC[month] = {
          q90: HydrologyUtils.getFlowPercentile(monthFdc, 90),
          q70: HydrologyUtils.getFlowPercentile(monthFdc, 70),
          q50: HydrologyUtils.getFlowPercentile(monthFdc, 50)
        };
      }
    }
    
    return {
      lowFlow,
      mediumFlow,
      highFlow,
      ecologicalFlow: lowFlow,
      monthlyFDC,
      flowDurationCurve: fdc
    };
  }

  habitatSuitabilityMethod(data, zoneConfig) {
    const lowFlowIndices = HydrologyUtils.calculateLowFlowIndices(data, 'runoff_value', 'record_time');
    const floodIndices = HydrologyUtils.calculateFloodIndices(data, 'runoff_value', 'record_time');
    
    const spawningFlow = this.calculateSpawningFlow(data);
    const baseFlow = lowFlowIndices.q90;
    const optimalFlow = baseFlow * 2;
    const maximumFlow = floodIndices.q10;
    
    return {
      baseFlow,
      optimalFlow,
      maximumFlow,
      spawningFlow,
      lowFlowIndices,
      floodIndices,
      habitatRequirements: {
        spawning: spawningFlow,
        rearing: baseFlow * 1.5,
        adult: optimalFlow
      }
    };
  }

  calculateSeasonalFlows(data, meanAnnualFlow, levels) {
    const monthly = TimeSeriesUtils.calculateMonthlyStats(data, 'record_time', 'runoff_value');
    
    return monthly.map(m => {
      const monthNum = parseInt(m.month.split('-')[1]);
      const isDrySeason = this.drySeasonPeriod.includes(monthNum);
      const isWetSeason = this.wetSeasonPeriod.includes(monthNum);
      const isSpawning = this.fishSpawningPeriod.includes(monthNum);
      
      let ecologicalFlow;
      if (isSpawning) {
        ecologicalFlow = meanAnnualFlow * Math.max(levels.wet, 0.4);
      } else if (isDrySeason) {
        ecologicalFlow = meanAnnualFlow * levels.dry;
      } else if (isWetSeason) {
        ecologicalFlow = meanAnnualFlow * levels.wet;
      } else {
        ecologicalFlow = meanAnnualFlow * (levels.dry + levels.wet) / 2;
      }
      
      return {
        month: m.month,
        actualFlow: m.avg,
        ecologicalFlow,
        deficit: Math.max(0, ecologicalFlow - m.avg),
        surplus: Math.max(0, m.avg - ecologicalFlow),
        isDrySeason,
        isWetSeason,
        isSpawning
      };
    });
  }

  calculateSpawningFlow(data) {
    const spawningData = data.filter(d => {
      const month = new Date(d.record_time).getMonth() + 1;
      return this.fishSpawningPeriod.includes(month);
    });
    
    if (spawningData.length === 0) return 0;
    
    const values = spawningData.map(d => d.runoff_value);
    return StatisticsUtils.percentile(values, 30);
  }

  calculateEcologicalDeficit(data, ecologicalFlow) {
    return data.map(d => ({
      ...d,
      ecologicalFlow,
      deficit: Math.max(0, ecologicalFlow - d.runoff_value),
      surplus: Math.max(0, d.runoff_value - ecologicalFlow),
      isDeficit: d.runoff_value < ecologicalFlow,
      satisfaction: Math.min(100, (d.runoff_value / ecologicalFlow) * 100)
    }));
  }

  calculateEcologicalSatisfactionIndex(data, ecologicalFlow) {
    const deficitData = this.calculateEcologicalDeficit(data, ecologicalFlow);
    const deficitDays = deficitData.filter(d => d.isDeficit).length;
    const totalDays = deficitData.length;
    
    const avgSatisfaction = StatisticsUtils.mean(deficitData.map(d => d.satisfaction));
    const maxDeficit = StatisticsUtils.max(deficitData.map(d => d.deficit));
    const totalDeficit = StatisticsUtils.sum(deficitData.map(d => d.deficit));
    
    return {
      totalDays,
      deficitDays,
      satisfactionDays: totalDays - deficitDays,
      satisfactionRate: ((totalDays - deficitDays) / totalDays) * 100,
      avgSatisfaction,
      maxDeficit,
      totalDeficit,
      deficitData
    };
  }
}

export const ecologicalFlowCalculator = new EcologicalFlowCalculator();
export default EcologicalFlowCalculator;
