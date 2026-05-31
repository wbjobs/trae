import dayjs from 'dayjs';
import { ExcelReportGenerator } from './excel-report-generator.js';
import { dataSourceAdapter } from '@modules/data-source/data-source-adapter.js';
import { runoffDataCleaner } from '@modules/data-cleaning/runoff-data-cleaner.js';
import { ecologicalCoefficientCalculator } from '@modules/ecological-calculation/ecological-coefficient-calculator.js';
import { anomalyPeriodAggregator } from '@modules/anomaly-detection/anomaly-period-aggregator.js';
import { WATERSHED_ZONES } from '@config/watershed-zones.config.js';

export class BatchReportGenerator {
  constructor(options = {}) {
    this.reportGenerator = new ExcelReportGenerator(options.reportOptions || {});
    this.cleanerOptions = options.cleanerOptions || {};
    this.ecologicalOptions = options.ecologicalOptions || {};
    this.anomalyOptions = options.anomalyOptions || {};
  }

  async generateZoneReport(zoneId, startTime, endTime, options = {}) {
    const zone = WATERSHED_ZONES.find(z => z.id === zoneId);
    if (!zone) {
      throw new Error(`Zone not found: ${zoneId}`);
    }

    console.log(`正在生成流域报告: ${zone.name}...`);

    try {
      const rawData = await dataSourceAdapter.fetchRunoffData({
        zoneId,
        startTime,
        endTime,
        granularity: 'daily'
      });

      if (!rawData || rawData.length === 0) {
        console.warn(`警告: 流域 ${zone.name} 没有可用数据`);
        const emptyWorkbook = this.reportGenerator.generateRunoffReport([], zone, {});
        return {
          zone,
          filename: `${zoneId}_runoff_report_empty.xlsx`,
          workbook: emptyWorkbook,
          rawData: [],
          cleanedData: [],
          cleaningStats: { originalCount: 0, processedCount: 0 },
          ecologicalData: null,
          anomalies: null,
          generatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
          isEmpty: true
        };
      }

      const { cleanedData, stats } = await runoffDataCleaner.clean(rawData, {
        valueField: 'runoff_value',
        outlierAction: 'flag'
      });

      const ecologicalData = ecologicalCoefficientCalculator.generateCoefficientReport(cleanedData, zone);

      const anomalies = anomalyPeriodAggregator.aggregateAnomalies(cleanedData, 'runoff_value', 'record_time');

      const workbook = this.reportGenerator.generateRunoffReport(cleanedData, zone, {
        includeAnomalies: true,
        anomalies,
        includeEcological: true,
        ecologicalData: ecologicalData.overall
      });

      const timestamp = dayjs().format('YYYYMMDD_HHmmss');
      const filename = `${zoneId}_runoff_report_${timestamp}.xlsx`;

      if (options.download && typeof window !== 'undefined') {
        await this.reportGenerator.saveToFile(workbook, filename);
      }

      return {
        zone,
        filename,
        workbook,
        rawData,
        cleanedData,
        cleaningStats: stats,
        ecologicalData,
        anomalies,
        generatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        isEmpty: false
      };
    } catch (error) {
      console.error(`生成流域报告失败 ${zone.name}:`, error.message);
      throw error;
    }
  }

  async generateAllZonesReports(startTime, endTime, options = {}) {
    const results = [];
    const errors = [];

    for (const zone of WATERSHED_ZONES) {
      try {
        const result = await this.generateZoneReport(zone.id, startTime, endTime, options);
        results.push(result);
        console.log(`✓ 流域报告生成完成: ${zone.name}`);
      } catch (error) {
        console.error(`✗ 流域报告生成失败: ${zone.name}`, error.message);
        errors.push({ zoneId: zone.id, zoneName: zone.name, error: error.message });
      }
    }

    return {
      totalZones: WATERSHED_ZONES.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
      summary: this.generateSummary(results)
    };
  }

  async generateMonthlyReports(year, options = {}) {
    const results = [];
    
    for (let month = 1; month <= 12; month++) {
      const startTime = dayjs(`${year}-${month.toString().padStart(2, '0')}-01`);
      const endTime = startTime.endOf('month');
      
      console.log(`正在生成 ${year}年${month}月 月度报告...`);
      
      const monthResults = [];
      for (const zone of WATERSHED_ZONES) {
        try {
          const result = await this.generateZoneReport(zone.id, startTime.format(), endTime.format(), options);
          monthResults.push(result);
        } catch (error) {
          console.error(`月度报告生成失败: ${zone.name} - ${month}月`, error.message);
        }
      }
      
      results.push({
        year,
        month,
        startTime: startTime.format(),
        endTime: endTime.format(),
        zoneResults: monthResults
      });
    }
    
    return results;
  }

  async generateYearlyReports(startYear, endYear, options = {}) {
    const results = [];
    
    for (let year = startYear; year <= endYear; year++) {
      const startTime = dayjs(`${year}-01-01`);
      const endTime = startTime.endOf('year');
      
      console.log(`正在生成 ${year}年度 报告...`);
      
      const yearResult = await this.generateAllZonesReports(startTime.format(), endTime.format(), options);
      results.push({
        year,
        startTime: startTime.format(),
        endTime: endTime.format(),
        ...yearResult
      });
    }
    
    return results;
  }

  generateSummary(results) {
    const totalRecords = results.reduce((sum, r) => sum + r.cleanedData.length, 0);
    const totalAnomalies = results.reduce((sum, r) => sum + (r.anomalies?.totalPeriods || 0), 0);
    const avgSatisfaction = results.length > 0
      ? results.reduce((sum, r) => sum + (r.ecologicalData?.overall?.coefficient || 0), 0) / results.length
      : 0;

    return {
      totalZones: results.length,
      totalRecords,
      totalAnomalies,
      avgEcologicalCoefficient: avgSatisfaction.toFixed(4),
      dataRange: {
        earliest: results[0]?.cleanedData[0]?.record_time,
        latest: results[0]?.cleanedData[results[0]?.cleanedData.length - 1]?.record_time
      }
    };
  }

  generateReportIndex(results) {
    return {
      generatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      totalReports: results.length,
      reports: results.map(r => ({
        zoneId: r.zone.id,
        zoneName: r.zone.name,
        filename: r.filename,
        recordCount: r.cleanedData.length,
        anomalyCount: r.anomalies?.totalPeriods || 0
      }))
    };
  }

  async generateComparisonReport(zoneIds, startTime, endTime, options = {}) {
    const zoneResults = [];
    
    for (const zoneId of zoneIds) {
      try {
        const result = await this.generateZoneReport(zoneId, startTime, endTime, { ...options, download: false });
        zoneResults.push(result);
      } catch (error) {
        console.error(`对比报告生成失败: ${zoneId}`, error.message);
      }
    }

    const comparisonData = this.generateComparisonData(zoneResults);
    
    return {
      zoneResults,
      comparisonData,
      generatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
    };
  }

  generateComparisonData(zoneResults) {
    return zoneResults.map(r => ({
      zoneId: r.zone.id,
      zoneName: r.zone.name,
      area: r.zone.area,
      avgRunoff: r.ecologicalData?.overall?.meanAnnualFlow?.toFixed(3) || 'N/A',
      ecologicalCoefficient: r.ecologicalData?.overall?.coefficient?.toFixed(4) || 'N/A',
      anomalyCount: r.anomalies?.totalPeriods || 0,
      recordCount: r.cleanedData.length
    }));
  }
}

export const batchReportGenerator = new BatchReportGenerator();
export default BatchReportGenerator;
