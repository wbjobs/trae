import { extremeClimateSimulator, EXTREME_CLIMATE_TYPES } from '../src/modules/extreme-climate/extreme-climate-simulator.js';
import { runoffPredictionModel } from '../src/modules/extreme-climate/runoff-prediction-model.js';
import { ecologicalBalanceEvaluator } from '../src/modules/ecological-calculation/ecological-balance-evaluator.js';
import { createRegionAdapter } from '../src/modules/data-source/region-data-adapter.js';
import { timeSeriesChunkReader } from '../src/utils/time-series-chunk-reader.js';
import { listRegions, REGION_CALIBRATION_CONFIG } from '../config/region-calibration.config.js';
import { WATERSHED_ZONES } from '../config/watershed-zones.config.js';

function generateTestData(count = 365) {
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
  console.log('  新增功能验证测试');
  console.log('========================================\n');

  const testData = generateTestData(365);
  console.log('生成测试数据:', testData.length, '条\n');

  console.log('1. 测试极端气候模拟模块...');
  try {
    const climateTypes = Object.values(EXTREME_CLIMATE_TYPES);
    
    for (const climateType of climateTypes.slice(0, 3)) {
      const result = extremeClimateSimulator.simulateExtremeRunoff(
        testData,
        climateType,
        'medium',
        7
      );
      
      console.log(`   ✓ ${result.climateParams.name}模拟成功`);
      console.log(`     - 风险等级: ${result.riskAssessment.level}`);
      console.log(`     - 风险评分: ${result.riskAssessment.score}/100`);
      console.log(`     - 重现期: ${result.returnPeriod?.description || '未知'}`);
      console.log(`     - 模拟峰值: ${result.simulatedStats?.max?.toFixed(2) || 'N/A'} m³/s`);
    }
  } catch (e) {
    console.log('   ✗ 极端气候模拟失败:', e.message);
    console.error(e);
  }

  console.log('\n2. 测试径流预测模型...');
  try {
    const prediction = runoffPredictionModel.predictRunoff(testData, 30);
    
    console.log('   ✓ 径流预测成功');
    console.log('     - 预测天数:', prediction.prediction?.length || 0);
    console.log('     - 预测均值:', prediction.metrics?.mean?.toFixed(3) || 'N/A');
    console.log('     - 预测峰值:', prediction.metrics?.peakOccurrence?.value?.toFixed(3) || 'N/A');
    console.log('     - 置信度:', prediction.confidence);
    console.log('     - 趋势:', prediction.trend?.direction || 'N/A');

    const predictionWithScenario = runoffPredictionModel.predictRunoff(testData, 30, {
      climateType: EXTREME_CLIMATE_TYPES.FLOOD,
      intensity: 'medium'
    });
    
    console.log('   ✓ 气候情景预测成功');
    console.log('     - 气候情景:', predictionWithScenario.climateScenario?.description || 'N/A');
    console.log('     - 风险等级:', predictionWithScenario.riskAssessment?.level || 'N/A');
  } catch (e) {
    console.log('   ✗ 径流预测测试失败:', e.message);
    console.error(e);
  }

  console.log('\n3. 测试生态平衡评估模块...');
  try {
    const zone = WATERSHED_ZONES[0];
    const evaluation = ecologicalBalanceEvaluator.evaluate(testData, zone);
    
    console.log('   ✓ 生态平衡评估成功');
    console.log('     - 综合评分:', evaluation.totalScore.toFixed(1));
    console.log('     - 等级:', evaluation.gradeLabel);
    console.log('     - 流量稳定性:', (evaluation.indicatorScores.flow_stability || 0).toFixed(1));
    console.log('     - 生态流量:', (evaluation.indicatorScores.ecological_flow_satisfaction || 0).toFixed(1));
    console.log('     - 水质状况:', (evaluation.indicatorScores.water_quality || 0).toFixed(1));
    console.log('     - 生境适宜性:', (evaluation.indicatorScores.habitat_suitability || 0).toFixed(1));
    console.log('     - 建议数量:', evaluation.recommendations?.length || 0);
  } catch (e) {
    console.log('   ✗ 生态平衡评估失败:', e.message);
    console.error(e);
  }

  console.log('\n4. 测试地域数据适配模块...');
  try {
    const regions = listRegions();
    console.log('   支持的区域数量:', regions.length);
    
    for (const region of regions.slice(0, 3)) {
      const adapter = createRegionAdapter(region.id);
      const info = adapter.getRegionInfo();
      
      console.log(`   ✓ ${region.name} - ${info.available ? '可用' : '不可用'}`);
      
      if (info.available) {
        const calibrated = adapter.calibrateRunoffData(testData.slice(0, 100));
        console.log(`     - 数据校准: ${calibrated.quality?.processedCount || 0} 条`);
        console.log(`     - 填补缺失: ${calibrated.quality?.gapFilledCount || 0} 条`);
        console.log(`     - 质量状态: ${calibrated.quality?.meetsQualityStandards ? '合格' : '需改善'}`);
      }
    }
  } catch (e) {
    console.log('   ✗ 地域数据适配测试失败:', e.message);
    console.error(e);
  }

  console.log('\n5. 测试时序数据分片读取...');
  try {
    const largeData = generateTestData(50000);
    console.log('   生成大量测试数据:', largeData.length, '条');
    
    const chunkInfo = timeSeriesChunkReader.getChunkInfo(largeData);
    console.log('   ✓ 数据分片信息获取成功');
    console.log('     - 总记录数:', chunkInfo.totalRecords);
    console.log('     - 总分片数:', chunkInfo.totalChunks);
    console.log('     - 分片大小:', chunkInfo.chunkSize);
    console.log('     - 预计内存:', chunkInfo.chunkMemoryEstimate.toFixed(2), 'MB');

    let processedChunks = 0;
    const iterator = timeSeriesChunkReader.createChunkIterator(largeData);
    
    for (const { data, metadata } of iterator) {
      processedChunks++;
      if (processedChunks <= 3) {
        console.log(`     处理分片 ${metadata.chunkIndex + 1}/${metadata.totalChunks}: ${data.length} 条`);
      }
    }
    
    console.log(`   ✓ 分片迭代完成，共处理 ${processedChunks} 个分片`);
  } catch (e) {
    console.log('   ✗ 时序数据分片读取失败:', e.message);
    console.error(e);
  }

  console.log('\n6. 测试多情景分析...');
  try {
    const scenarios = [
      { name: '常规洪水', climateType: EXTREME_CLIMATE_TYPES.FLOOD, intensity: 'medium', duration: 7 },
      { name: '极端干旱', climateType: EXTREME_CLIMATE_TYPES.DROUGHT, intensity: 'high', duration: 30 },
      { name: '台风暴雨', climateType: EXTREME_CLIMATE_TYPES.TYPHOON, intensity: 'extreme', duration: 5 }
    ];

    const multiResults = extremeClimateSimulator.generateMultiScenarioAnalysis(testData, scenarios);
    
    console.log('   ✓ 多情景分析完成');
    for (const result of multiResults) {
      console.log(`     - ${result.scenario}: 风险等级 ${result.result.riskAssessment?.level || '未知'}, 峰值 ${result.result.simulatedStats?.max?.toFixed(2) || 'N/A'} m³/s`);
    }
  } catch (e) {
    console.log('   ✗ 多情景分析失败:', e.message);
    console.error(e);
  }

  console.log('\n7. 测试区域配置...');
  try {
    console.log('   ✓ 区域配置加载成功');
    console.log('     - 配置区域数量:', Object.keys(REGION_CALIBRATION_CONFIG).length);
    
    const southernConfig = REGION_CALIBRATION_CONFIG.southern_hilly;
    console.log('     - 南方丘陵区年均降雨:', southernConfig.avgAnnualRainfall.typical, 'mm');
    console.log('     - 南方丘陵区年均径流:', southernConfig.avgAnnualRunoff.typical, 'mm');
    console.log('     - 雨季月份:', southernConfig.seasonalPattern.wetSeason.months.join(','));
    console.log('     - 洪水预警阈值:', southernConfig.floodCharacteristics.warningThreshold, '倍');
  } catch (e) {
    console.log('   ✗ 区域配置测试失败:', e.message);
    console.error(e);
  }

  console.log('\n========================================');
  console.log('  所有新增功能测试完成！');
  console.log('========================================');
}

runTests().catch(console.error);
