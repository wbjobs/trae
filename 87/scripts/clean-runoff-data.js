const { runoffDataCleaner } = require('../src/modules/data-cleaning/runoff-data-cleaner.js');
const { dataSourceAdapter } = require('../src/modules/data-source/data-source-adapter.js');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

async function runCleaningProcess(options = {}) {
  const {
    zoneId = 'zone_a',
    startTime = dayjs().subtract(1, 'year').format('YYYY-MM-DD'),
    endTime = dayjs().format('YYYY-MM-DD'),
    outputFile = `./data/cleaned/cleaned_data_${zoneId}_${Date.now()}.json`
  } = options;

  console.log('========================================');
  console.log('  水文径流数据清洗脚本');
  console.log('========================================');
  console.log(`流域分区: ${zoneId}`);
  console.log(`开始时间: ${startTime}`);
  console.log(`结束时间: ${endTime}`);
  console.log('----------------------------------------');

  try {
    console.log('1. 正在获取原始数据...');
    const rawData = await dataSourceAdapter.fetchRunoffData({
      zoneId, startTime, endTime, granularity: 'daily'
    });
    console.log(`   ✓ 获取到 ${rawData.length} 条原始数据`);

    console.log('2. 正在验证数据质量...');
    const validation = runoffDataCleaner.validateData(rawData, 'runoff_value');
    if (!validation.valid) {
      console.log('   数据质量问题:');
      validation.issues.forEach(issue => console.log(`     - ${issue.message}`));
    } else {
      console.log('   ✓ 数据质量验证通过');
    }

    console.log('3. 正在执行数据清洗...');
    const { cleanedData, stats } = await runoffDataCleaner.clean(rawData, {
      valueField: 'runoff_value',
      outlierAction: 'flag'
    });
    console.log(`   ✓ 清洗完成，处理 ${stats.processedCount} 条数据`);
    console.log(`     - 缺失值填充: ${stats.missingValueCount} 条`);
    console.log(`     - 异常值检测: ${stats.outlierCount} 条`);
    console.log(`     - 降噪处理: ${stats.noiseReduced ? '已启用' : '未启用'}`);

    console.log('4. 正在保存清洗结果...');
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputData = {
      metadata: {
        zoneId, startTime, endTime,
        cleanedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        cleaningStats: stats
      },
      data: cleanedData
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`   ✓ 结果已保存到: ${outputFile}`);

    console.log('----------------------------------------');
    console.log('数据清洗完成！');
    console.log('========================================');

    return outputData;

  } catch (error) {
    console.error('✗ 数据清洗失败:', error.message);
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

runCleaningProcess(options);
