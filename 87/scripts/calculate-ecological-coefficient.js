const { ecologicalCoefficientCalculator } = require('../src/modules/ecological-calculation/ecological-coefficient-calculator.js');
const { dataSourceAdapter } = require('../src/modules/data-source/data-source-adapter.js');
const { WATERSHED_ZONES } = require('../config/watershed-zones.config.js');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');

async function runCoefficientCalculation(options = {}) {
  const {
    zoneId,
    startTime = dayjs().subtract(3, 'year').format('YYYY-MM-DD'),
    endTime = dayjs().format('YYYY-MM-DD'),
    outputFile = './reports/ecological_coefficients.json'
  } = options;

  console.log('========================================');
  console.log('  生态径流系数演算脚本');
  console.log('========================================');
  console.log(`开始时间: ${startTime}`);
  console.log(`结束时间: ${endTime}`);
  console.log('----------------------------------------');

  try {
    const results = [];
    const zones = zoneId ? [WATERSHED_ZONES.find(z => z.id === zoneId)] : WATERSHED_ZONES;

    for (const zone of zones) {
      if (!zone) {
        console.error(`错误: 未找到流域分区 ${zoneId}`);
        continue;
      }

      console.log(`正在计算: ${zone.name}...`);
      
      const data = await dataSourceAdapter.fetchRunoffData({
        zoneId: zone.id, startTime, endTime, granularity: 'daily'
      });

      const report = ecologicalCoefficientCalculator.generateCoefficientReport(data, zone);
      results.push(report);

      console.log(`  ✓ 生态径流系数: ${report.overall.coefficient.toFixed(4)}`);
      console.log(`  ✓ 年均径流量: ${report.overall.meanAnnualFlow.toFixed(3)} m³/s`);
      console.log(`  ✓ 变化趋势: ${report.trend.trend.direction}`);
    }

    console.log('----------------------------------------');
    console.log('正在保存计算结果...');
    
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputData = {
      metadata: {
        startTime,
        endTime,
        calculatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
      },
      results
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`✓ 结果已保存到: ${outputFile}`);

    console.log('----------------------------------------');
    console.log('生态径流系数演算完成！');
    console.log('========================================');

    return outputData;

  } catch (error) {
    console.error('✗ 演算失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace('--', '');
  options[key] = args[i + 1];
}

runCoefficientCalculation(options);
