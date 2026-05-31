import { StatisticsUtils } from '../src/utils/statistics.utils.js';
import { runoffDataCleaner } from '../src/modules/data-cleaning/runoff-data-cleaner.js';
import { ecologicalCoefficientCalculator } from '../src/modules/ecological-calculation/ecological-coefficient-calculator.js';
import { anomalyPeriodAggregator } from '../src/modules/anomaly-detection/anomaly-period-aggregator.js';
import { WATERSHED_ZONES } from '../config/watershed-zones.config.js';

function generateTestData(count = 1000) {
  const data = [];
  const baseDate = new Date('2023-01-01');
  
  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    
    const seasonalFactor = 1 + 0.6 * Math.sin((i / 365) * Math.PI * 2);
    const randomFactor = 0.8 + Math.random() * 0.4;
    const runoff = 10 * seasonalFactor * randomFactor;
    
    data.push({
      record_time: date.toISOString().replace('T', ' ').substring(0, 19),
      runoff_value: Number(runoff.toFixed(3)),
      water_level: Number((1.2 + runoff * 0.15).toFixed(2)),
      velocity: Number((0.5 + runoff * 0.08).toFixed(2)),
      station_id: 'ST001',
      quality_flag: Math.random() > 0.05 ? 'normal' : 'suspect'
    });
  }
  
  return data;
}

async function runTests() {
  console.log('========================================');
  console.log('  水文径流分析系统 - 修复验证测试');
  console.log('========================================\n');

  console.log('1. 测试统计工具类...');
  try {
    const testValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const summary = StatisticsUtils.summary(testValues);
    console.log('   ✓ 统计摘要计算成功');
    console.log('     - 平均值:', summary.mean.toFixed(2));
    console.log('     - 中位数:', summary.median.toFixed(2));
    console.log('     - 最小值:', summary.min);
    console.log('     - 最大值:', summary.max);
    console.log('     - 标准差:', summary.std.toFixed(4));
  } catch (e) {
    console.log('   ✗ 统计工具类测试失败:', e.message);
  }

  console.log('\n2. 测试数据清洗模块...');
  try {
    const testData = generateTestData(365);
    console.log('   生成测试数据:', testData.length, '条');
    
    const result = await runoffDataCleaner.clean(testData, {
      valueField: 'runoff_value'
    });
    
    console.log('   ✓ 数据清洗成功');
    console.log('     - 原始数据:', result.stats.originalCount, '条');
    console.log('     - 处理数据:', result.stats.processedCount, '条');
    console.log('     - 缺失值处理:', result.stats.missingValueCount, '条');
    console.log('     - 异常值检测:', result.stats.outlierCount, '条');
  } catch (e) {
    console.log('   ✗ 数据清洗测试失败:', e.message);
    console.error(e);
  }

  console.log('\n3. 测试海量数据清洗（内存测试）...');
  try {
    const largeData = generateTestData(10000);
    console.log('   生成海量测试数据:', largeData.length, '条');
    
    console.time('dataCleaning');
    const result = await runoffDataCleaner.clean(largeData, {
      valueField: 'runoff_value'
    });
    console.timeEnd('dataCleaning');
    
    console.log('   ✓ 海量数据清洗成功');
    console.log('     - 处理数据量:', result.stats.processedCount, '条');
    console.log('     - 未发生内存溢出');
  } catch (e) {
    console.log('   ✗ 海量数据清洗测试失败:', e.message);
    console.error(e);
  }

  console.log('\n4. 测试生态径流系数计算...');
  try {
    const testData = generateTestData(365 * 3);
    const zone = WATERSHED_ZONES[0];
    
    const result = ecologicalCoefficientCalculator.generateCoefficientReport(testData, zone);
    
    console.log('   ✓ 生态径流系数计算成功');
    console.log('     - 流域:', zone.name);
    console.log('     - 整体系数:', result.overall.coefficient.toFixed(4));
    console.log('     - 年均径流量:', result.overall.meanAnnualFlow.toFixed(3), 'm³/s');
    console.log('     - 年度系数数量:', result.annual.length);
    console.log('     - 月度系数数量:', result.monthly.length);
  } catch (e) {
    console.log('   ✗ 生态径流系数测试失败:', e.message);
    console.error(e);
  }

  console.log('\n5. 测试异常时段检测...');
  try {
    const testData = generateTestData(365);
    const result = anomalyPeriodAggregator.aggregateAnomalies(testData, 'runoff_value', 'record_time');
    
    console.log('   ✓ 异常时段检测成功');
    console.log('     - 检测到异常时段:', result.totalPeriods, '个');
    console.log('     - 严重异常:', result.summary?.criticalCount || 0, '个');
    console.log('     - 高危异常:', result.summary?.highCount || 0, '个');
  } catch (e) {
    console.log('   ✗ 异常时段检测测试失败:', e.message);
    console.error(e);
  }

  console.log('\n========================================');
  console.log('  所有测试完成！');
  console.log('========================================');
}

runTests().catch(console.error);
