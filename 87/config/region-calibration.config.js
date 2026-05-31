export const REGION_CALIBRATION_CONFIG = {
  northern_plains: {
    id: 'northern_plains',
    name: '北方平原区',
    description: '北方半干旱半湿润平原地区',
    climate: 'temperate_monsoon',
    avgAnnualRainfall: { min: 400, max: 800, typical: 600 },
    avgAnnualRunoff: { min: 50, max: 200, typical: 100 },
    seasonalPattern: {
      wetSeason: { months: [6, 7, 8, 9], rainfallRatio: 0.7 },
      drySeason: { months: [12, 1, 2, 3], rainfallRatio: 0.1 }
    },
    runoffCoefficient: {
      agricultural: 0.15,
      forest: 0.35,
      urban: 0.60,
      wetland: 0.25
    },
    floodCharacteristics: {
      typicalDuration: 3,
      peakMultiplier: 5,
      warningThreshold: 2.5
    },
    droughtCharacteristics: {
      typicalDuration: 30,
      lowFlowThreshold: 0.2,
      criticalThreshold: 0.1
    },
    ecologicalParameters: {
      baseFlowIndex: 0.3,
      environmentalFlowRatio: 0.3,
      sedimentYield: 200
    },
    calibrationFactors: {
      rainfallRunoff: 0.85,
      temperatureEvaporation: 1.0,
      snowmeltContribution: 0.15
    },
    dataQuality: {
      typicalGapRate: 0.05,
      outlierRate: 0.02,
      measurementUncertainty: 0.08
    }
  },
  southern_hilly: {
    id: 'southern_hilly',
    name: '南方丘陵区',
    description: '南方湿润丘陵地区',
    climate: 'subtropical_monsoon',
    avgAnnualRainfall: { min: 1000, max: 1800, typical: 1400 },
    avgAnnualRunoff: { min: 300, max: 800, typical: 500 },
    seasonalPattern: {
      wetSeason: { months: [4, 5, 6, 7, 8, 9], rainfallRatio: 0.75 },
      drySeason: { months: [11, 12, 1, 2], rainfallRatio: 0.12 }
    },
    runoffCoefficient: {
      agricultural: 0.25,
      forest: 0.45,
      urban: 0.65,
      wetland: 0.30
    },
    floodCharacteristics: {
      typicalDuration: 5,
      peakMultiplier: 8,
      warningThreshold: 3.0
    },
    droughtCharacteristics: {
      typicalDuration: 20,
      lowFlowThreshold: 0.25,
      criticalThreshold: 0.12
    },
    ecologicalParameters: {
      baseFlowIndex: 0.4,
      environmentalFlowRatio: 0.35,
      sedimentYield: 150
    },
    calibrationFactors: {
      rainfallRunoff: 0.92,
      temperatureEvaporation: 0.9,
      snowmeltContribution: 0.0
    },
    dataQuality: {
      typicalGapRate: 0.03,
      outlierRate: 0.015,
      measurementUncertainty: 0.05
    }
  },
  southwest_mountain: {
    id: 'southwest_mountain',
    name: '西南山区',
    description: '西南高山峡谷地区',
    climate: 'plateau_monsoon',
    avgAnnualRainfall: { min: 600, max: 1200, typical: 900 },
    avgAnnualRunoff: { min: 200, max: 600, typical: 350 },
    seasonalPattern: {
      wetSeason: { months: [5, 6, 7, 8, 9, 10], rainfallRatio: 0.80 },
      drySeason: { months: [11, 12, 1, 2, 3], rainfallRatio: 0.08 }
    },
    runoffCoefficient: {
      agricultural: 0.20,
      forest: 0.50,
      urban: 0.55,
      wetland: 0.28
    },
    floodCharacteristics: {
      typicalDuration: 2,
      peakMultiplier: 12,
      warningThreshold: 4.0
    },
    droughtCharacteristics: {
      typicalDuration: 45,
      lowFlowThreshold: 0.15,
      criticalThreshold: 0.08
    },
    ecologicalParameters: {
      baseFlowIndex: 0.35,
      environmentalFlowRatio: 0.40,
      sedimentYield: 500
    },
    calibrationFactors: {
      rainfallRunoff: 0.88,
      temperatureEvaporation: 0.85,
      snowmeltContribution: 0.25
    },
    dataQuality: {
      typicalGapRate: 0.08,
      outlierRate: 0.025,
      measurementUncertainty: 0.10
    }
  },
  northwest_arid: {
    id: 'northwest_arid',
    name: '西北干旱区',
    description: '西北内陆干旱半干旱地区',
    climate: 'temperate_arid',
    avgAnnualRainfall: { min: 50, max: 300, typical: 150 },
    avgAnnualRunoff: { min: 5, max: 50, typical: 20 },
    seasonalPattern: {
      wetSeason: { months: [6, 7, 8], rainfallRatio: 0.60 },
      drySeason: { months: [11, 12, 1, 2, 3, 4], rainfallRatio: 0.15 }
    },
    runoffCoefficient: {
      agricultural: 0.10,
      forest: 0.25,
      urban: 0.45,
      wetland: 0.15
    },
    floodCharacteristics: {
      typicalDuration: 1,
      peakMultiplier: 15,
      warningThreshold: 5.0
    },
    droughtCharacteristics: {
      typicalDuration: 90,
      lowFlowThreshold: 0.10,
      criticalThreshold: 0.03
    },
    ecologicalParameters: {
      baseFlowIndex: 0.20,
      environmentalFlowRatio: 0.50,
      sedimentYield: 800
    },
    calibrationFactors: {
      rainfallRunoff: 0.75,
      temperatureEvaporation: 1.2,
      snowmeltContribution: 0.40
    },
    dataQuality: {
      typicalGapRate: 0.10,
      outlierRate: 0.03,
      measurementUncertainty: 0.12
    }
  },
  east_coastal: {
    id: 'east_coastal',
    name: '东部沿海区',
    description: '东部沿海平原三角洲地区',
    climate: 'subtropical_maritime',
    avgAnnualRainfall: { min: 1200, max: 2000, typical: 1600 },
    avgAnnualRunoff: { min: 400, max: 1000, typical: 700 },
    seasonalPattern: {
      wetSeason: { months: [4, 5, 6, 7, 8, 9], rainfallRatio: 0.70 },
      drySeason: { months: [10, 11, 12, 1], rainfallRatio: 0.18 }
    },
    runoffCoefficient: {
      agricultural: 0.28,
      forest: 0.40,
      urban: 0.70,
      wetland: 0.32
    },
    floodCharacteristics: {
      typicalDuration: 7,
      peakMultiplier: 6,
      warningThreshold: 2.8,
      stormSurgeRisk: true
    },
    droughtCharacteristics: {
      typicalDuration: 15,
      lowFlowThreshold: 0.30,
      criticalThreshold: 0.15
    },
    ecologicalParameters: {
      baseFlowIndex: 0.45,
      environmentalFlowRatio: 0.32,
      sedimentYield: 100,
      tidalInfluence: true
    },
    calibrationFactors: {
      rainfallRunoff: 0.95,
      temperatureEvaporation: 0.88,
      snowmeltContribution: 0.0,
      tidalEffect: 0.15
    },
    dataQuality: {
      typicalGapRate: 0.02,
      outlierRate: 0.01,
      measurementUncertainty: 0.04
    }
  },
  northeast_forest: {
    id: 'northeast_forest',
    name: '东北森林区',
    description: '东北森林湿地平原地区',
    climate: 'temperate_continental',
    avgAnnualRainfall: { min: 400, max: 700, typical: 550 },
    avgAnnualRunoff: { min: 80, max: 250, typical: 150 },
    seasonalPattern: {
      wetSeason: { months: [7, 8, 9], rainfallRatio: 0.55 },
      drySeason: { months: [12, 1, 2, 3], rainfallRatio: 0.12 },
      snowmeltSeason: { months: [4, 5], runoffRatio: 0.30 }
    },
    runoffCoefficient: {
      agricultural: 0.18,
      forest: 0.42,
      urban: 0.55,
      wetland: 0.22
    },
    floodCharacteristics: {
      typicalDuration: 10,
      peakMultiplier: 4,
      warningThreshold: 2.2,
      springFloodRisk: true
    },
    droughtCharacteristics: {
      typicalDuration: 40,
      lowFlowThreshold: 0.18,
      criticalThreshold: 0.09
    },
    ecologicalParameters: {
      baseFlowIndex: 0.38,
      environmentalFlowRatio: 0.38,
      sedimentYield: 80,
      wetlandCoverage: 0.15
    },
    calibrationFactors: {
      rainfallRunoff: 0.82,
      temperatureEvaporation: 0.95,
      snowmeltContribution: 0.35,
      frozenSoilEffect: 0.10
    },
    dataQuality: {
      typicalGapRate: 0.06,
      outlierRate: 0.02,
      measurementUncertainty: 0.07
    }
  },
  loess_plateau: {
    id: 'loess_plateau',
    name: '黄土高原区',
    description: '黄土高原水土保持重点区',
    climate: 'temperate_semiarid',
    avgAnnualRainfall: { min: 200, max: 600, typical: 400 },
    avgAnnualRunoff: { min: 20, max: 100, typical: 50 },
    seasonalPattern: {
      wetSeason: { months: [7, 8, 9], rainfallRatio: 0.65 },
      drySeason: { months: [11, 12, 1, 2, 3], rainfallRatio: 0.10 }
    },
    runoffCoefficient: {
      agricultural: 0.12,
      forest: 0.30,
      urban: 0.50,
      wetland: 0.18
    },
    floodCharacteristics: {
      typicalDuration: 2,
      peakMultiplier: 20,
      warningThreshold: 6.0,
      mudflowRisk: true
    },
    droughtCharacteristics: {
      typicalDuration: 60,
      lowFlowThreshold: 0.10,
      criticalThreshold: 0.05
    },
    ecologicalParameters: {
      baseFlowIndex: 0.22,
      environmentalFlowRatio: 0.45,
      sedimentYield: 2000,
      soilErosionRate: 'high'
    },
    calibrationFactors: {
      rainfallRunoff: 0.78,
      temperatureEvaporation: 1.05,
      snowmeltContribution: 0.10,
      soilConservationEffect: 0.15
    },
    dataQuality: {
      typicalGapRate: 0.07,
      outlierRate: 0.025,
      measurementUncertainty: 0.09
    }
  }
};

export const getRegionConfig = (regionId) => {
  return REGION_CALIBRATION_CONFIG[regionId] || null;
};

export const getRegionByClimate = (climateType) => {
  return Object.values(REGION_CALIBRATION_CONFIG).find(r => r.climate === climateType);
};

export const getCalibrationFactor = (regionId, factorName) => {
  const config = getRegionConfig(regionId);
  if (!config) return null;
  
  const parts = factorName.split('.');
  let current = config;
  
  for (const part of parts) {
    if (current[part] === undefined) return null;
    current = current[part];
  }
  
  return current;
};

export const getAdaptedRunoffCoefficient = (regionId, landUseType) => {
  const config = getRegionConfig(regionId);
  if (!config || !config.runoffCoefficient) return 0.3;
  return config.runoffCoefficient[landUseType] || config.runoffCoefficient.agricultural || 0.3;
};

export const getSeasonalFactor = (regionId, month) => {
  const config = getRegionConfig(regionId);
  if (!config || !config.seasonalPattern) return 1.0;
  
  const { wetSeason, drySeason } = config.seasonalPattern;
  
  if (wetSeason.months.includes(month)) {
    return wetSeason.rainfallRatio / (wetSeason.months.length / 12);
  }
  
  if (drySeason.months.includes(month)) {
    return drySeason.rainfallRatio / (drySeason.months.length / 12);
  }
  
  return 1.0;
};

export const calculateAdaptedFlowThresholds = (regionId, baseFlow) => {
  const config = getRegionConfig(regionId);
  if (!config) {
    return {
      warning: baseFlow * 2.5,
      critical: baseFlow * 4.0,
      lowFlow: baseFlow * 0.2,
      noFlow: baseFlow * 0.05
    };
  }

  const flood = config.floodCharacteristics || {};
  const drought = config.droughtCharacteristics || {};

  return {
    warning: baseFlow * (flood.warningThreshold || 2.5),
    critical: baseFlow * (flood.peakMultiplier || 4.0),
    lowFlow: baseFlow * (drought.lowFlowThreshold || 0.2),
    noFlow: baseFlow * (drought.criticalThreshold || 0.05),
    typicalFloodDuration: flood.typicalDuration || 3,
    typicalDroughtDuration: drought.typicalDuration || 30
  };
};

export const getDataQualityParams = (regionId) => {
  const config = getRegionConfig(regionId);
  if (!config) {
    return {
      maxGapRate: 0.1,
      maxOutlierRate: 0.03,
      maxUncertainty: 0.1
    };
  }

  return config.dataQuality || {
    maxGapRate: 0.1,
    maxOutlierRate: 0.03,
    maxUncertainty: 0.1
  };
};

export const listRegions = () => {
  return Object.values(REGION_CALIBRATION_CONFIG).map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    climate: r.climate
  }));
};

export default REGION_CALIBRATION_CONFIG;
