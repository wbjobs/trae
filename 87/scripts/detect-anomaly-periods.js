const { anomalyPeriodAggregator } = require('../src/modules/anomaly-detection/anomaly-period-aggregator.js');
const { dataSourceAdapter } = require('../src/modules/data-source/data-source-adapter.js');
const { WATERSHED_ZONES } = require('../config/watershed-zones.config.js');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');

async function runAnomalyDetection(options = {}) {
  const {
    zoneId,
    startTime = dayjs().subtract(1, 'year').format('YYYY-MM-DD'),
    endTime = dayjs().format('YYYY-MM-DD'),
    outputFile = './reports/anomaly_detection_results.json'
  } = options;

  console.log('========================================');
  console.log('  异常径流时段检测脚本');
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

      console.log(`正在检测: ${zone.name}...`);
      
      const data = await dataSourceAdapter.fetchRunoffData({
        zoneId: zone.id, startTime, endTime, granularity: 'daily'
      });

      const anomalies = anomalyPeriodAggregator.aggregateAnomalies(data, 'runoff_value', 'record_time');
      results.push({
        zoneId: zone.id,
        zoneName: zone.name,
        ...anomalies
      });

      console.log(`  ✓ 检测到 ${anomalies.totalPeriods} 个异常时段`);
      console.log(`    - 严重: ${anomalies.summary.criticalCount || 0}`);
      console.log(`    - 高危: ${anomalies.summary.highCount || 0}`);
      console.log(`    - 异常占比: ${anomalies.summary.percentage?.toFixed(1)}%`);
    }

    console.log('----------------------------------------');
    console.log('正在保存检测结果...');
    
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputData = {
      metadata: {
        startTime,
        endTime,
        detectedAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
      },
      results
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`✓ 结果已保存到: ${outputFile}`);

    console.log('----------------------------------------');
    console.log('异常径流时段检测完成！');
    console.log('========================================');

    return outputData;

  } catch (error) {
    console.error('✗ 检测失败:', error.message);
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

runAnomalyDetection(options);
