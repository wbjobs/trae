export const SYSTEM_CONFIG = {
  timeZone: 'Asia/Shanghai',
  dateFormat: 'YYYY-MM-DD',
  dateTimeFormat: 'YYYY-MM-DD HH:mm:ss',
  dataRetentionYears: 10,
  reportOutputPath: './reports',
  dataExportPath: './data/export',
  chartTheme: 'light',
  enableAnimation: true,
  animationDuration: 800
};

export const ANALYSIS_CONFIG = {
  anomalyThreshold: 2.5,
  movingAverageWindow: 7,
  seasonalCycleMonths: 12,
  noiseReductionMethod: 'savitzky-golay',
  ecologicalCoefficientPeriod: 'monthly'
};

export const VISUALIZATION_CONFIG = {
  defaultTimeRange: 'year',
  chartColors: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4'],
  tooltipFormatter: 'standard',
  enableZoom: true,
  enableDataZoom: true
};
