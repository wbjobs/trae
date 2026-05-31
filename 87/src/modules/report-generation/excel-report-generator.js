import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import dayjs from 'dayjs';
import { StatisticsUtils } from '@utils/statistics.utils.js';
import { TimeSeriesUtils } from '@utils/time-series.utils.js';

export class ExcelReportGenerator {
  constructor(options = {}) {
    this.outputPath = options.outputPath || './reports';
  }

  generateRunoffReport(data, zoneConfig, options = {}) {
    const workbook = XLSX.utils.book_new();
    
    this.addSummarySheet(workbook, data, zoneConfig);
    this.addDailyDataSheet(workbook, data);
    this.addMonthlyStatsSheet(workbook, data);
    this.addYearlyStatsSheet(workbook, data);
    this.addStatisticalSummarySheet(workbook, data);
    
    if (options.includeAnomalies && options.anomalies) {
      this.addAnomaliesSheet(workbook, options.anomalies);
    }
    
    if (options.includeEcological && options.ecologicalData) {
      this.addEcologicalSheet(workbook, options.ecologicalData);
    }
    
    return workbook;
  }

  addSummarySheet(workbook, data, zoneConfig) {
    const values = data.map(d => d.runoff_value);
    const stats = StatisticsUtils.summary(values);
    const timeRange = {
      start: data[0]?.record_time || 'N/A',
      end: data[data.length - 1]?.record_time || 'N/A'
    };

    const summaryData = [
      ['流域水文径流分析报告'],
      [''],
      ['流域信息'],
      ['流域名称', zoneConfig?.name || '未知流域'],
      ['流域面积', `${zoneConfig?.area || 'N/A'} km²`],
      ['流域描述', zoneConfig?.description || ''],
      [''],
      ['数据时间范围'],
      ['开始时间', timeRange.start],
      ['结束时间', timeRange.end],
      ['数据记录数', data.length],
      [''],
      ['径流量统计摘要'],
      ['统计指标', '数值', '单位'],
      ['平均值', stats.mean.toFixed(3), 'm³/s'],
      ['中位数', stats.median.toFixed(3), 'm³/s'],
      ['最大值', stats.max.toFixed(3), 'm³/s'],
      ['最小值', stats.min.toFixed(3), 'm³/s'],
      ['标准差', stats.std.toFixed(3), 'm³/s'],
      ['变异系数', stats.cv.toFixed(4), ''],
      ['年径流量', (stats.mean * 31536000 / 100000000).toFixed(2), '亿m³'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(summaryData);
    ws['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, ws, '报告摘要');
  }

  addDailyDataSheet(workbook, data) {
    if (!data || data.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([['日数据明细', '暂无数据']]);
      XLSX.utils.book_append_sheet(workbook, ws, '日数据明细');
      return;
    }

    const sheetData = data.map(d => ({
      '日期时间': d.record_time || '',
      '径流量(m³/s)': d.runoff_value != null ? Number(d.runoff_value.toFixed(3)) : '',
      '水位(m)': d.water_level != null ? Number(d.water_level.toFixed(2)) : '',
      '流速(m/s)': d.velocity != null ? Number(d.velocity.toFixed(2)) : '',
      '站点编号': d.station_id || '',
      '数据质量': d.quality_flag || 'normal',
      '是否填充': d._filled ? '是' : '否',
      '是否平滑': d._smoothed ? '是' : '否',
      '是否异常': d._isOutlier ? '是' : '否'
    }));

    const ws = XLSX.utils.json_to_sheet(sheetData);
    
    ws['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
    ];
    
    ws['!freeze'] = { xSplit: 1, ySplit: 1 };
    
    XLSX.utils.book_append_sheet(workbook, ws, '日数据明细');
  }

  addMonthlyStatsSheet(workbook, data) {
    if (!data || data.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([['月度统计', '暂无数据']);
      XLSX.utils.book_append_sheet(workbook, ws, '月度统计');
      return;
    }

    const monthly = TimeSeriesUtils.calculateMonthlyStats(data, 'record_time', 'runoff_value');
    const sheetData = monthly.map(m => ({
      '月份': m.month || '',
      '平均径流量(m³/s)': m.avg != null ? Number(m.avg.toFixed(3)) : 0,
      '最大径流量(m³/s)': m.max != null ? Number(m.max.toFixed(3)) : 0,
      '最小径流量(m³/s)': m.min != null ? Number(m.min.toFixed(3)) : 0,
      '月径流量(万m³)': m.sum != null ? Number((m.sum * 3600 * 24 / 10000).toFixed(2)) : 0,
      '数据天数': m.count || 0
    }));

    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 10 }];
    ws['!freeze'] = { xSplit: 1, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, ws, '月度统计');
  }

  addYearlyStatsSheet(workbook, data) {
    if (!data || data.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([['年度统计', '暂无数据']);
      XLSX.utils.book_append_sheet(workbook, ws, '年度统计');
      return;
    }

    const yearly = TimeSeriesUtils.calculateYearlyStats(data, 'record_time', 'runoff_value');
    const sheetData = yearly.map(y => ({
      '年份': y.year || '',
      '平均径流量(m³/s)': y.avg != null ? Number(y.avg.toFixed(3)) : 0,
      '最大径流量(m³/s)': y.max != null ? Number(y.max.toFixed(3)) : 0,
      '最小径流量(m³/s)': y.min != null ? Number(y.min.toFixed(3)) : 0,
      '年径流量(亿m³)': y.sum != null ? Number((y.sum * 3600 * 24 / 100000000).toFixed(2)) : 0,
      '数据天数': y.count || 0
    }));

    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 10 }];
    ws['!freeze'] = { xSplit: 1, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, ws, '年度统计');
  }

  addStatisticalSummarySheet(workbook, data) {
    const values = data.map(d => d.runoff_value);
    const monthly = TimeSeriesUtils.calculateMonthlyStats(data, 'record_time', 'runoff_value');
    
    const monthlyByMonth = {};
    for (let m = 1; m <= 12; m++) {
      const monthStr = m.toString().padStart(2, '0');
      monthlyByMonth[m] = monthly.filter(d => d.month.endsWith(`-${monthStr}`)).map(d => d.avg);
    }

    const sheetData = [
      ['统计分布特征'],
      [''],
      ['百分位统计'],
      ['P5', StatisticsUtils.percentile(values, 5).toFixed(3)],
      ['P10', StatisticsUtils.percentile(values, 10).toFixed(3)],
      ['P25', StatisticsUtils.percentile(values, 25).toFixed(3)],
      ['P50', StatisticsUtils.percentile(values, 50).toFixed(3)],
      ['P75', StatisticsUtils.percentile(values, 75).toFixed(3)],
      ['P90', StatisticsUtils.percentile(values, 90).toFixed(3)],
      ['P95', StatisticsUtils.percentile(values, 95).toFixed(3)],
      [''],
      ['月份统计（多年平均）'],
      ['月份', '平均径流量(m³/s)', '标准差'],
      ...Object.entries(monthlyByMonth).map(([month, vals]) => [
        `${month}月`,
        StatisticsUtils.mean(vals).toFixed(3),
        StatisticsUtils.standardDeviation(vals).toFixed(3)
      ])
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, ws, '统计分析');
  }

  addAnomaliesSheet(workbook, anomalies) {
    if (!anomalies || !anomalies.periods || anomalies.periods.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([['异常时段', '暂无异常数据']);
      XLSX.utils.book_append_sheet(workbook, ws, '异常时段');
      return;
    }

    const sheetData = anomalies.periods.map((p, idx) => ({
      '序号': idx + 1,
      '开始时间': p.start || '',
      '结束时间': p.end || '',
      '持续天数': p.duration || 0,
      '异常类型': p.type || '未知',
      '严重程度': p.severity?.level || '未知',
      '平均径流量': p.stats?.mean != null ? Number(p.stats.mean.toFixed(3)) : 0,
      '最大径流量': p.stats?.max != null ? Number(p.stats.max.toFixed(3)) : 0,
      '最小径流量': p.stats?.min != null ? Number(p.stats.min.toFixed(3)) : 0,
      '偏离程度(%)': p.stats?.deviationFromBase != null ? Number((p.stats.deviationFromBase * 100).toFixed(1)) : 0,
      '生态影响': p.impact?.ecologicalImpact || '未知',
      '运行影响': p.impact?.operationalImpact || '未知'
    }));

    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [
      { wch: 8 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }
    ];
    ws['!freeze'] = { xSplit: 1, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, ws, '异常时段');
  }

  addEcologicalSheet(workbook, ecologicalData) {
    if (!ecologicalData) {
      const ws = XLSX.utils.aoa_to_sheet([['生态分析', '暂无数据']);
      XLSX.utils.book_append_sheet(workbook, ws, '生态分析');
      return;
    }

    const sheetData = [
      ['生态流量分析'],
      [''],
      ['生态流量计算结果'],
      ['计算方法', ecologicalData.method || 'Tennant法'],
      ['保护等级', ecologicalData.protectionLevel || '标准'],
      [''],
      ['关键阈值'],
      ['最小生态流量(m³/s)', ecologicalData.annualMinimum != null ? Number(ecologicalData.annualMinimum.toFixed(3)) : ecologicalData.ecologicalFlowMin != null ? Number(ecologicalData.ecologicalFlowMin.toFixed(3)) : 'N/A'],
      ['适宜生态流量(m³/s)', ecologicalData.annualOptimal != null ? Number(ecologicalData.annualOptimal.toFixed(3)) : ecologicalData.ecologicalFlowOpt != null ? Number(ecologicalData.ecologicalFlowOpt.toFixed(3)) : 'N/A'],
      ['最大生态流量(m³/s)', ecologicalData.ecologicalFlowMax != null ? Number(ecologicalData.ecologicalFlowMax.toFixed(3)) : 'N/A'],
      [''],
      ['生态径流系数'],
      ['系数值', ecologicalData.coefficient != null ? Number(ecologicalData.coefficient.toFixed(4)) : 'N/A'],
      ['年均径流量(m³/s)', ecologicalData.meanAnnualFlow != null ? Number(ecologicalData.meanAnnualFlow.toFixed(3)) : 'N/A'],
      [''],
      ['逐月生态流量分析'],
      ['月份', '实际流量(m³/s)', '生态流量(m³/s)', '缺水量(m³/s)', '满足度(%)'],
      ...(ecologicalData.seasonalFlows || []).map(s => [
        s.month || '',
        s.actualFlow != null ? Number(s.actualFlow.toFixed(3)) : 0,
        s.ecologicalFlow != null ? Number(s.ecologicalFlow.toFixed(3)) : 0,
        s.deficit != null ? Number(s.deficit.toFixed(3)) : 0,
        s.ecologicalFlow > 0 ? Number(((s.actualFlow / s.ecologicalFlow) * 100).toFixed(1)) : 0
      ])
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, ws, '生态分析');
  }

  downloadReport(workbook, filename) {
    const timestamp = dayjs().format('YYYYMMDD_HHmmss');
    const finalFilename = filename || `runoff_report_${timestamp}.xlsx`;
    XLSX.writeFile(workbook, finalFilename);
    return finalFilename;
  }

  async saveToFile(workbook, filename) {
    if (typeof window !== 'undefined') {
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      saveAs(blob, filename);
      return filename;
    }
    return null;
  }
}

export const excelReportGenerator = new ExcelReportGenerator();
export default ExcelReportGenerator;
