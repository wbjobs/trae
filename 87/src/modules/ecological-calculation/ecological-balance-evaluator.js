import { StatisticsUtils } from '@utils/statistics.utils.js';
import { TimeSeriesUtils } from '@utils/time-series.utils.js';
import { WATERSHED_ZONES } from '@config/watershed-zones.config.js';

export const ECOLOGICAL_INDICATORS = {
  FLOW_STABILITY: 'flow_stability',
  ECOLOGICAL_FLOW_SATISFACTION: 'ecological_flow_satisfaction',
  WATER_QUALITY: 'water_quality',
  HABITAT_SUITABILITY: 'habitat_suitability',
  SPECIES_DIVERSITY: 'species_diversity',
  RIPARIAN_VEGETATION: 'riparian_vegetation',
  FLOOD_PLAIN_CONNECTIVITY: 'flood_plain_connectivity',
  SEDIMENT_TRANSPORT: 'sediment_transport'
};

export const EVALUATION_GRADES = {
  EXCELLENT: { grade: 'excellent', score: 90, label: '优秀', color: '#52c41a' },
  GOOD: { grade: 'good', score: 75, label: '良好', color: '#73d13d' },
  MODERATE: { grade: 'moderate', score: 60, label: '中等', color: '#faad14' },
  POOR: { grade: 'poor', score: 40, label: '较差', color: '#ff4d4f' },
  CRITICAL: { grade: 'critical', score: 0, label: '严重', color: '#a8071a' }
};

export class EcologicalBalanceEvaluator {
  constructor(options = {}) {
    this.options = options;
    this.indicators = options.indicators || Object.values(ECOLOGICAL_INDICATORS);
    this.weights = options.weights || this.getDefaultWeights();
    this.evaluationPeriod = options.evaluationPeriod || 'yearly';
  }

  getDefaultWeights() {
    return {
      [ECOLOGICAL_INDICATORS.FLOW_STABILITY]: 0.20,
      [ECOLOGICAL_INDICATORS.ECOLOGICAL_FLOW_SATISFACTION]: 0.25,
      [ECOLOGICAL_INDICATORS.WATER_QUALITY]: 0.15,
      [ECOLOGICAL_INDICATORS.HABITAT_SUITABILITY]: 0.12,
      [ECOLOGICAL_INDICATORS.SPECIES_DIVERSITY]: 0.10,
      [ECOLOGICAL_INDICATORS.RIPARIAN_VEGETATION]: 0.08,
      [ECOLOGICAL_INDICATORS.FLOOD_PLAIN_CONNECTIVITY]: 0.05,
      [ECOLOGICAL_INDICATORS.SEDIMENT_TRANSPORT]: 0.05
    };
  }

  evaluate(runoffData, zoneConfig, additionalData = {}) {
    if (!runoffData || runoffData.length === 0) {
      return this.createEmptyResult(zoneConfig);
    }

    const values = runoffData.map(d => d.runoff_value).filter(v => v !== null && !isNaN(v));
    if (values.length === 0) {
      return this.createEmptyResult(zoneConfig);
    }

    const baseStats = StatisticsUtils.summary(values);
    const monthlyStats = TimeSeriesUtils.groupByMonth(runoffData, 'record_time', 'runoff_value');

    const indicatorScores = {};
    const indicatorDetails = {};

    for (const indicator of this.indicators) {
      const result = this.calculateIndicator(
        indicator,
        runoffData,
        baseStats,
        monthlyStats,
        zoneConfig,
        additionalData
      );
      indicatorScores[indicator] = result.score;
      indicatorDetails[indicator] = result;
    }

    const totalScore = this.calculateWeightedScore(indicatorScores);
    const grade = this.determineGrade(totalScore);

    return {
      zoneId: zoneConfig.id,
      zoneName: zoneConfig.name,
      evaluationDate: new Date().toISOString(),
      period: this.evaluationPeriod,
      totalScore: Number(totalScore.toFixed(2)),
      grade: grade.grade,
      gradeLabel: grade.label,
      gradeColor: grade.color,
      indicatorScores,
      indicatorDetails,
      weights: this.weights,
      baseStats,
      recommendations: this.generateRecommendations(indicatorScores, zoneConfig),
      trendAnalysis: this.analyzeTrend(runoffData, zoneConfig)
    };
  }

  createEmptyResult(zoneConfig) {
    return {
      zoneId: zoneConfig?.id,
      zoneName: zoneConfig?.name,
      evaluationDate: new Date().toISOString(),
      period: this.evaluationPeriod,
      totalScore: 0,
      grade: 'unknown',
      gradeLabel: '数据不足',
      gradeColor: '#bfbfbf',
      indicatorScores: {},
      indicatorDetails: {},
      weights: this.weights,
      baseStats: null,
      recommendations: ['数据不足，无法进行有效评估'],
      trendAnalysis: null
    };
  }

  calculateIndicator(indicator, runoffData, baseStats, monthlyStats, zoneConfig, additionalData) {
    const calculators = {
      [ECOLOGICAL_INDICATORS.FLOW_STABILITY]: () => this.calculateFlowStability(baseStats, monthlyStats, zoneConfig),
      [ECOLOGICAL_INDICATORS.ECOLOGICAL_FLOW_SATISFACTION]: () => this.calculateEcologicalFlowSatisfaction(runoffData, zoneConfig),
      [ECOLOGICAL_INDICATORS.WATER_QUALITY]: () => this.calculateWaterQuality(additionalData.waterQuality, zoneConfig),
      [ECOLOGICAL_INDICATORS.HABITAT_SUITABILITY]: () => this.calculateHabitatSuitability(runoffData, zoneConfig, additionalData),
      [ECOLOGICAL_INDICATORS.SPECIES_DIVERSITY]: () => this.calculateSpeciesDiversity(additionalData.speciesData, zoneConfig),
      [ECOLOGICAL_INDICATORS.RIPARIAN_VEGETATION]: () => this.calculateRiparianVegetation(additionalData.vegetationData, zoneConfig),
      [ECOLOGICAL_INDICATORS.FLOOD_PLAIN_CONNECTIVITY]: () => this.calculateFloodPlainConnectivity(runoffData, zoneConfig, additionalData),
      [ECOLOGICAL_INDICATORS.SEDIMENT_TRANSPORT]: () => this.calculateSedimentTransport(runoffData, additionalData.sedimentData, zoneConfig)
    };

    const calculator = calculators[indicator];
    if (calculator) {
      try {
        return calculator();
      } catch (e) {
        return { score: 0, details: { error: e.message } };
      }
    }

    return { score: 50, details: { note: '使用默认分数' } };
  }

  calculateFlowStability(baseStats, monthlyStats, zoneConfig) {
    const cv = baseStats.std / baseStats.mean;
    const monthlyMeans = monthlyStats.map(m => m.mean);
    const monthlyCv = StatisticsUtils.standardDeviation(monthlyMeans) / StatisticsUtils.mean(monthlyMeans);

    const stabilityScore = Math.max(0, 100 - cv * 100);
    const seasonalScore = Math.max(0, 100 - monthlyCv * 80);

    const score = stabilityScore * 0.6 + seasonalScore * 0.4;

    return {
      score: Number(score.toFixed(2)),
      details: {
        coefficientOfVariation: Number(cv.toFixed(4)),
        monthlyVariation: Number(monthlyCv.toFixed(4)),
        stabilityScore: Number(stabilityScore.toFixed(2)),
        seasonalScore: Number(seasonalScore.toFixed(2))
      },
      description: `流量稳定性评估：变异系数 ${cv.toFixed(4)}，月度变异 ${monthlyCv.toFixed(4)}`
    };
  }

  calculateEcologicalFlowSatisfaction(runoffData, zoneConfig) {
    const ecoFlow = zoneConfig.ecologicalFlow || { min: 1.0, optimal: 3.0 };
    let satisfactionCount = 0;
    let optimalCount = 0;
    let deficitSum = 0;

    for (const data of runoffData) {
      const value = data.runoff_value;
      if (value >= ecoFlow.min) {
        satisfactionCount++;
        if (value >= ecoFlow.optimal && value <= ecoFlow.max) {
          optimalCount++;
        }
      } else {
        deficitSum += ecoFlow.min - value;
      }
    }

    const satisfactionRate = satisfactionCount / runoffData.length;
    const optimalRate = optimalCount / runoffData.length;
    const avgDeficit = satisfactionCount < runoffData.length ? deficitSum / (runoffData.length - satisfactionCount) : 0;

    const score = satisfactionRate * 60 + optimalRate * 40 - Math.min(20, avgDeficit * 2);

    return {
      score: Number(Math.max(0, Math.min(100, score)).toFixed(2)),
      details: {
        satisfactionRate: Number(satisfactionRate.toFixed(4)),
        optimalRate: Number(optimalRate.toFixed(4)),
        avgDeficit: Number(avgDeficit.toFixed(3)),
        ecologicalFlow: ecoFlow,
        satisfiedDays: satisfactionCount,
        totalDays: runoffData.length
      },
      description: `生态流量满足率 ${(satisfactionRate * 100).toFixed(1)}%，适宜率 ${(optimalRate * 100).toFixed(1)}%`
    };
  }

  calculateWaterQuality(waterQualityData, zoneConfig) {
    if (!waterQualityData || waterQualityData.length === 0) {
      return { score: 60, details: { note: '使用默认水质评分' } };
    }

    const metrics = ['ph', 'dissolved_oxygen', 'turbidity', 'conductivity'];
    let totalScore = 0;
    let validMetrics = 0;

    for (const metric of metrics) {
      const values = waterQualityData
        .map(d => d[metric])
        .filter(v => v !== null && !isNaN(v));
      
      if (values.length > 0) {
        const avg = StatisticsUtils.mean(values);
        totalScore += this.scoreWaterQualityMetric(metric, avg);
        validMetrics++;
      }
    }

    const score = validMetrics > 0 ? totalScore / validMetrics : 60;

    return {
      score: Number(score.toFixed(2)),
      details: {
        sampleCount: waterQualityData.length,
        validMetrics,
        metrics: this.getWaterQualitySummary(waterQualityData)
      },
      description: `水质综合评分基于 ${validMetrics} 项指标`
    };
  }

  scoreWaterQualityMetric(metric, value) {
    const standards = {
      ph: { min: 6.5, max: 8.5, optimal: 7.5 },
      dissolved_oxygen: { min: 5, max: 20, optimal: 8 },
      turbidity: { min: 0, max: 50, optimal: 5 },
      conductivity: { min: 100, max: 1000, optimal: 300 }
    };

    const std = standards[metric];
    if (!std) return 60;

    if (metric === 'turbidity') {
      if (value <= std.optimal) return 100;
      if (value <= std.max * 0.5) return 80;
      if (value <= std.max) return 60;
      return 40;
    }

    if (metric === 'dissolved_oxygen') {
      if (value >= std.optimal) return 100;
      if (value >= std.min) return 60 + (value - std.min) / (std.optimal - std.min) * 40;
      return Math.max(0, value / std.min * 60);
    }

    if (value >= std.min && value <= std.max) {
      const distance = Math.abs(value - std.optimal);
      const range = std.max - std.min;
      return 100 - (distance / range) * 40;
    }

    return 40;
  }

  getWaterQualitySummary(waterQualityData) {
    const summary = {};
    const metrics = ['ph', 'dissolved_oxygen', 'turbidity', 'conductivity'];

    for (const metric of metrics) {
      const values = waterQualityData
        .map(d => d[metric])
        .filter(v => v !== null && !isNaN(v));
      
      if (values.length > 0) {
        summary[metric] = {
          mean: StatisticsUtils.mean(values),
          min: Math.min(...values),
          max: Math.max(...values),
          count: values.length
        };
      }
    }

    return summary;
  }

  calculateHabitatSuitability(runoffData, zoneConfig, additionalData) {
    const values = runoffData.map(d => d.runoff_value);
    const ecoFlow = zoneConfig.ecologicalFlow || { min: 1.0, optimal: 3.0, max: 15 };

    let suitableHours = 0;
    for (const value of values) {
      if (value >= ecoFlow.optimal * 0.7 && value <= ecoFlow.optimal * 1.5) {
        suitableHours++;
      }
    }

    const suitabilityRate = suitableHours / values.length;
    const diversityBonus = additionalData.habitatDiversity ? additionalData.habitatDiversity * 10 : 0;

    const score = suitabilityRate * 80 + diversityBonus;

    return {
      score: Number(Math.min(100, score).toFixed(2)),
      details: {
        suitabilityRate: Number(suitabilityRate.toFixed(4)),
        suitableHours,
        totalHours: values.length,
        habitatDiversityBonus: diversityBonus
      },
      description: `生境适宜率 ${(suitabilityRate * 100).toFixed(1)}%`
    };
  }

  calculateSpeciesDiversity(speciesData, zoneConfig) {
    if (!speciesData) {
      return { score: 50, details: { note: '无物种数据，使用默认评分' } };
    }

    const { observedSpecies, expectedSpecies, endangeredSpecies } = speciesData;
    
    let score = 50;
    if (expectedSpecies > 0) {
      const completeness = observedSpecies / expectedSpecies;
      score = Math.min(100, completeness * 80);
    }

    if (endangeredSpecies > 0) {
      score += 10;
    }

    return {
      score: Number(Math.min(100, score).toFixed(2)),
      details: {
        observedSpecies: observedSpecies || 0,
        expectedSpecies: expectedSpecies || 0,
        endangeredSpecies: endangeredSpecies || 0
      },
      description: `观测物种 ${observedSpecies || 0} 种，预期 ${expectedSpecies || 0} 种`
    };
  }

  calculateRiparianVegetation(vegetationData, zoneConfig) {
    if (!vegetationData) {
      return { score: 55, details: { note: '无植被数据，使用默认评分' } };
    }

    const { coverageRatio, nativeSpeciesRatio, healthStatus } = vegetationData;
    
    let score = 0;
    if (coverageRatio !== undefined) {
      score += coverageRatio * 40;
    } else {
      score += 20;
    }

    if (nativeSpeciesRatio !== undefined) {
      score += nativeSpeciesRatio * 30;
    } else {
      score += 15;
    }

    if (healthStatus !== undefined) {
      score += healthStatus * 30;
    } else {
      score += 15;
    }

    return {
      score: Number(Math.min(100, score).toFixed(2)),
      details: vegetationData,
      description: `河岸带植被评估`
    };
  }

  calculateFloodPlainConnectivity(runoffData, zoneConfig, additionalData) {
    const values = runoffData.map(d => d.runoff_value);
    const maxFlow = Math.max(...values);
    const bankfullFlow = additionalData.bankfullFlow || maxFlow * 0.7;

    let overflowDays = 0;
    for (const value of values) {
      if (value >= bankfullFlow * 0.8) {
        overflowDays++;
      }
    }

    const connectivityRatio = overflowDays / values.length;
    const optimalRatio = 0.05;

    const score = 100 - Math.abs(connectivityRatio - optimalRatio) * 1000;

    return {
      score: Number(Math.max(0, Math.min(100, score)).toFixed(2)),
      details: {
        connectivityRatio: Number(connectivityRatio.toFixed(4)),
        overflowDays,
        totalDays: values.length,
        bankfullFlow,
        optimalRatio
      },
      description: `洪泛平原连通性：漫溢频率 ${(connectivityRatio * 100).toFixed(2)}%`
    };
  }

  calculateSedimentTransport(runoffData, sedimentData, zoneConfig) {
    const values = runoffData.map(d => d.runoff_value);
    const avgFlow = StatisticsUtils.mean(values);

    let sedimentScore = 50;
    if (sedimentData && sedimentData.sedimentConcentration !== undefined) {
      const concentration = sedimentData.sedimentConcentration;
      if (concentration < 100) {
        sedimentScore = 90;
      } else if (concentration < 300) {
        sedimentScore = 70;
      } else if (concentration < 500) {
        sedimentScore = 50;
      } else {
        sedimentScore = 30;
      }
    }

    const flowRegimeScore = avgFlow > zoneConfig.ecologicalFlow?.optimal ? 80 : 60;

    return {
      score: Number(((sedimentScore + flowRegimeScore) / 2).toFixed(2)),
      details: {
        sedimentConcentration: sedimentData?.sedimentConcentration,
        avgFlow: Number(avgFlow.toFixed(3)),
        sedimentScore,
        flowRegimeScore
      },
      description: `泥沙输运评估`
    };
  }

  calculateWeightedScore(indicatorScores) {
    let totalScore = 0;
    let totalWeight = 0;

    for (const [indicator, score] of Object.entries(indicatorScores)) {
      const weight = this.weights[indicator] || 0;
      totalScore += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  determineGrade(totalScore) {
    if (totalScore >= EVALUATION_GRADES.EXCELLENT.score) return EVALUATION_GRADES.EXCELLENT;
    if (totalScore >= EVALUATION_GRADES.GOOD.score) return EVALUATION_GRADES.GOOD;
    if (totalScore >= EVALUATION_GRADES.MODERATE.score) return EVALUATION_GRADES.MODERATE;
    if (totalScore >= EVALUATION_GRADES.POOR.score) return EVALUATION_GRADES.POOR;
    return EVALUATION_GRADES.CRITICAL;
  }

  generateRecommendations(indicatorScores, zoneConfig) {
    const recommendations = [];
    const lowIndicators = Object.entries(indicatorScores)
      .filter(([_, score]) => score < 60)
      .sort((a, b) => a[1] - b[1]);

    const indicatorNames = {
      [ECOLOGICAL_INDICATORS.FLOW_STABILITY]: '流量稳定性',
      [ECOLOGICAL_INDICATORS.ECOLOGICAL_FLOW_SATISFACTION]: '生态流量满足度',
      [ECOLOGICAL_INDICATORS.WATER_QUALITY]: '水质状况',
      [ECOLOGICAL_INDICATORS.HABITAT_SUITABILITY]: '生境适宜性',
      [ECOLOGICAL_INDICATORS.SPECIES_DIVERSITY]: '物种多样性',
      [ECOLOGICAL_INDICATORS.RIPARIAN_VEGETATION]: '河岸带植被',
      [ECOLOGICAL_INDICATORS.FLOOD_PLAIN_CONNECTIVITY]: '洪泛平原连通性',
      [ECOLOGICAL_INDICATORS.SEDIMENT_TRANSPORT]: '泥沙输运'
    };

    const recommendationTexts = {
      [ECOLOGICAL_INDICATORS.FLOW_STABILITY]: '建议优化水库调度方案，维持流量稳定',
      [ECOLOGICAL_INDICATORS.ECOLOGICAL_FLOW_SATISFACTION]: '建议保障最小生态流量，可考虑实施生态补水',
      [ECOLOGICAL_INDICATORS.WATER_QUALITY]: '建议加强污染源管控，开展水质监测与治理',
      [ECOLOGICAL_INDICATORS.HABITAT_SUITABILITY]: '建议开展生境修复工程，改善生物栖息地条件',
      [ECOLOGICAL_INDICATORS.SPECIES_DIVERSITY]: '建议开展生物多样性调查，实施物种保护措施',
      [ECOLOGICAL_INDICATORS.RIPARIAN_VEGETATION]: '建议开展河岸带植被恢复工程，提高本土物种覆盖率',
      [ECOLOGICAL_INDICATORS.FLOOD_PLAIN_CONNECTIVITY]: '建议评估洪泛平原连通性，必要时实施生态补水',
      [ECOLOGICAL_INDICATORS.SEDIMENT_TRANSPORT]: '建议开展泥沙监测，评估水库排沙效果'
    };

    for (const [indicator, score] of lowIndicators) {
      recommendations.push({
        indicator,
        name: indicatorNames[indicator] || indicator,
        score: Number(score.toFixed(2)),
        recommendation: recommendationTexts[indicator] || `建议改善${indicatorNames[indicator] || indicator}`
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        indicator: 'overall',
        name: '总体状况',
        score: 100,
        recommendation: '生态系统状况良好，建议持续监测'
      });
    }

    return recommendations;
  }

  analyzeTrend(runoffData, zoneConfig) {
    const yearlyStats = TimeSeriesUtils.groupByYear(runoffData, 'record_time', 'runoff_value');
    
    if (yearlyStats.length < 2) {
      return { trend: 'insufficient_data', years: yearlyStats.length };
    }

    const recentYears = yearlyStats.slice(-3);
    const earlierYears = yearlyStats.slice(0, Math.max(1, yearlyStats.length - 3));

    const recentMean = StatisticsUtils.mean(recentYears.map(y => y.mean));
    const earlierMean = StatisticsUtils.mean(earlierYears.map(y => y.mean));

    const changeRatio = (recentMean - earlierMean) / earlierMean;

    let trend;
    if (changeRatio > 0.1) trend = 'improving';
    else if (changeRatio < -0.1) trend = 'deteriorating';
    else trend = 'stable';

    return {
      trend,
      changeRatio: Number(changeRatio.toFixed(4)),
      recentMean: Number(recentMean.toFixed(3)),
      earlierMean: Number(earlierMean.toFixed(3)),
      yearsAnalyzed: yearlyStats.length
    };
  }

  generateRadarChartData(evaluationResult) {
    const indicatorNames = {
      [ECOLOGICAL_INDICATORS.FLOW_STABILITY]: '流量稳定性',
      [ECOLOGICAL_INDICATORS.ECOLOGICAL_FLOW_SATISFACTION]: '生态流量',
      [ECOLOGICAL_INDICATORS.WATER_QUALITY]: '水质状况',
      [ECOLOGICAL_INDICATORS.HABITAT_SUITABILITY]: '生境适宜',
      [ECOLOGICAL_INDICATORS.SPECIES_DIVERSITY]: '物种多样',
      [ECOLOGICAL_INDICATORS.RIPARIAN_VEGETATION]: '河岸植被',
      [ECOLOGICAL_INDICATORS.FLOOD_PLAIN_CONNECTIVITY]: '洪泛连通',
      [ECOLOGICAL_INDICATORS.SEDIMENT_TRANSPORT]: '泥沙输运'
    };

    const indicators = [];
    const values = [];

    for (const [key, score] of Object.entries(evaluationResult.indicatorScores)) {
      indicators.push(indicatorNames[key] || key);
      values.push(Number(score.toFixed(2)));
    }

    return {
      indicators,
      values,
      color: evaluationResult.gradeColor
    };
  }
}

export const ecologicalBalanceEvaluator = new EcologicalBalanceEvaluator();
export default EcologicalBalanceEvaluator;
