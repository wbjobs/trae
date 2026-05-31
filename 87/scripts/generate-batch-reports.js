const { batchReportGenerator } = require('../src/modules/report-generation/batch-report-generator.js');
const dayjs = require('dayjs');

async function runReportGeneration(options = {}) {
  const {
    mode = 'all',
    startTime = dayjs().subtract(1, 'year').format('YYYY-MM-DD'),
    endTime = dayjs().format('YYYY-MM-DD'),
    zoneId,
    year,
    download = 'true'
  } = options;

  console.log('========================================');
  console.log('  批量报表生成脚本');
  console.log('========================================');
  console.log(`生成模式: ${mode}`);
  console.log(`开始时间: ${startTime}`);
  console.log(`结束时间: ${endTime}`);
  console.log('----------------------------------------');

  try {
    let result;

    switch (mode) {
      case 'zone':
        if (!zoneId) {
          console.error('错误: 单流域模式需要指定 --zoneId 参数');
          process.exit(1);
        }
        console.log(`正在生成单流域报告: ${zoneId}...`);
        result = await batchReportGenerator.generateZoneReport(zoneId, startTime, endTime, {
          download: download === 'true'
        });
        console.log(`✓ 报告生成完成: ${result.filename}`);
        break;

      case 'all':
        console.log('正在生成全流域报告...');
        result = await batchReportGenerator.generateAllZonesReports(startTime, endTime, {
          download: download === 'true'
        });
        console.log(`✓ 成功生成 ${result.successful} 个流域报告`);
        if (result.failed > 0) {
          console.log(`✗ 失败 ${result.failed} 个流域报告`);
        }
        break;

      case 'monthly':
        const reportYear = year || dayjs().year();
        console.log(`正在生成 ${reportYear} 年月度报告...`);
        result = await batchReportGenerator.generateMonthlyReports(reportYear, {
          download: download === 'true'
        });
        console.log(`✓ 月度报告生成完成，共 ${result.length} 个月`);
        break;

      case 'yearly':
        const startYear = year ? parseInt(year) : dayjs().subtract(3, 'year').year();
        const endYear = dayjs().year();
        console.log(`正在生成 ${startYear}-${endYear} 年年度报告...`);
        result = await batchReportGenerator.generateYearlyReports(startYear, endYear, {
          download: download === 'true'
        });
        console.log(`✓ 年度报告生成完成，共 ${result.length} 年`);
        break;

      default:
        console.error(`错误: 未知模式 ${mode}`);
        console.log('支持的模式: zone, all, monthly, yearly');
        process.exit(1);
    }

    console.log('----------------------------------------');
    console.log('报表生成完成！');
    console.log('========================================');

    return result;

  } catch (error) {
    console.error('✗ 报表生成失败:', error.message);
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

runReportGeneration(options);
