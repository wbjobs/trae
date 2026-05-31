export * from './config/index.js';
export * from './src/utils/index.js';
export * from './src/components/charts/index.js';
export * from './src/modules/data-source/index.js';
export * from './src/modules/data-cleaning/index.js';
export * from './src/modules/ecological-calculation/index.js';
export * from './src/modules/anomaly-detection/index.js';
export * from './src/modules/report-generation/index.js';

import { WatershedAnalysisApp } from './src/app.js';
export { WatershedAnalysisApp };

export const SYSTEM_VERSION = '1.0.0';

export const MODULES = {
  dataSource: '流域数据源接入模块',
  dataCleaning: '时序径流数据清洗模块',
  ecologicalCalculation: '生态径流系数演算模块',
  anomalyDetection: '异常径流时段归集模块',
  reportGeneration: '离线分析报表生成模块',
  visualization: '多维流域图表渲染模块'
};
