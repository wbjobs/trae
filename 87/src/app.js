import dayjs from 'dayjs';
import { 
  TimeSeriesChart, 
  MultiZoneComparisonChart, 
  StatisticalChart, 
  EcologicalFlowChart,
  StationHeatmapChart,
  EcologicalRadarChart
} from './components/charts/index.js';
import { dataSourceAdapter } from './modules/data-source/data-source-adapter.js';
import { RegionDataAdapter, createRegionAdapter } from './modules/data-source/region-data-adapter.js';
import { runoffDataCleaner } from './modules/data-cleaning/runoff-data-cleaner.js';
import { ecologicalCoefficientCalculator } from './modules/ecological-calculation/ecological-coefficient-calculator.js';
import { ecologicalBalanceEvaluator, ECOLOGICAL_INDICATORS } from './modules/ecological-calculation/ecological-balance-evaluator.js';
import { extremeClimateSimulator, runoffPredictionModel, EXTREME_CLIMATE_TYPES } from './modules/extreme-climate/index.js';
import { anomalyPeriodAggregator } from './modules/anomaly-detection/anomaly-period-aggregator.js';
import { batchReportGenerator } from './modules/report-generation/batch-report-generator.js';
import { WATERSHED_ZONES } from '../config/watershed-zones.config.js';
import { REGION_CALIBRATION_CONFIG, listRegions } from '../config/region-calibration.config.js';
import { StatisticsUtils } from './utils/statistics.utils.js';
import { TimeSeriesUtils } from './utils/time-series.utils.js';
import { timeSeriesChunkReader } from './utils/time-series-chunk-reader.js';

export class WatershedAnalysisApp {
  constructor() {
    this.currentZone = 'all';
    this.currentTimeRange = 'year';
    this.currentRegion = 'southern_hilly';
    this.currentClimateScenario = null;
    this.charts = {};
    this.data = {
      raw: null,
      cleaned: null,
      stats: null,
      ecological: null,
      anomalies: null,
      prediction: null,
      extremeClimate: null,
      ecologicalEvaluation: null,
      calibrated: null
    };
    this.regionAdapter = createRegionAdapter(this.currentRegion);
  }

  async init() {
    this.bindEvents();
    await this.loadData();
    this.initCharts();
    this.render();
  }

  bindEvents() {
    document.getElementById('zoneSelector').addEventListener('change', (e) => {
      this.currentZone = e.target.value;
      this.loadData();
    });

    document.getElementById('timeRangeSelector').addEventListener('change', (e) => {
      this.currentTimeRange = e.target.value;
      this.loadData();
    });

    document.getElementById('regionSelector')?.addEventListener('change', (e) => {
      this.currentRegion = e.target.value;
      this.regionAdapter = createRegionAdapter(this.currentRegion);
      this.calibrateData();
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.loadData();
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportReport();
    });

    document.getElementById('predictBtn')?.addEventListener('click', () => {
      this.runPrediction();
    });

    document.getElementById('evaluateBtn')?.addEventListener('click', () => {
      this.runEcologicalEvaluation();
    });

    document.getElementById('climateSimulateBtn')?.addEventListener('click', () => {
      this.runClimateSimulation();
    });

    document.getElementById('calibrateBtn')?.addEventListener('click', () => {
      this.calibrateData();
    });

    document.querySelectorAll('.chart-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const chartType = e.target.dataset.chart;
        this.switchChart(chartType, e.target);
      });
    });
  }

  getTimeRange() {
    const end = dayjs();
    let start;
    
    switch (this.currentTimeRange) {
      case 'week':
        start = end.subtract(7, 'day');
        break;
      case 'month':
        start = end.subtract(30, 'day');
        break;
      case 'quarter':
        start = end.subtract(90, 'day');
        break;
      case 'year':
        start = end.subtract(1, 'year');
        break;
      case 'all':
        start = end.subtract(5, 'year');
        break;
      default:
        start = end.subtract(1, 'year');
    }
    
    return { start: start.format('YYYY-MM-DD'), end: end.format('YYYY-MM-DD') };
  }

  async loadData() {
    this.showLoading();
    
    try {
      const timeRange = this.getTimeRange();
      
      if (this.currentZone === 'all') {
        this.data.raw = await dataSourceAdapter.fetchMultipleZonesData(
          WATERSHED_ZONES.map(z => z.id),
          timeRange.start,
          timeRange.end,
          'daily'
        );
        
        const allZoneData = this.data.raw.flatMap(z => z.data);
        const cleanResult = await runoffDataCleaner.clean(allZoneData, {
          valueField: 'runoff_value',
          outlierAction: 'flag'
        });
        this.data.cleaned = cleanResult.cleanedData;
        this.data.stats = cleanResult.stats;
      } else {
        const rawData = await dataSourceAdapter.fetchRunoffData({
          zoneId: this.currentZone,
          startTime: timeRange.start,
          endTime: timeRange.end,
          granularity: 'daily'
        });
        
        this.data.raw = [{ zoneId: this.currentZone, data: rawData }];
        
        const cleanResult = await runoffDataCleaner.clean(rawData, {
          valueField: 'runoff_value',
          outlierAction: 'flag'
        });
        this.data.cleaned = cleanResult.cleanedData;
        this.data.stats = cleanResult.stats;
      }
      
      this.calculateDerivedData();
      this.render();
      
    } catch (error) {
      console.error('数据加载失败:', error);
      this.showError('数据加载失败，请稍后重试');
    } finally {
      this.hideLoading();
    }
  }

  calculateDerivedData() {
    const zone = WATERSHED_ZONES.find(z => z.id === this.currentZone) || WATERSHED_ZONES[0];
    
    if (this.data.cleaned && this.data.cleaned.length > 0) {
      this.data.ecological = ecologicalCoefficientCalculator.generateCoefficientReport(
        this.data.cleaned,
        zone
      );
      
      this.data.anomalies = anomalyPeriodAggregator.aggregateAnomalies(
        this.data.cleaned,
        'runoff_value',
        'record_time'
      );

      this.data.ecologicalEvaluation = ecologicalBalanceEvaluator.evaluate(
        this.data.cleaned,
        zone
      );
    }
  }

  async runPrediction() {
    if (!this.data.cleaned || this.data.cleaned.length === 0) {
      alert('请先加载数据');
      return;
    }

    this.showLoading();
    try {
      const predictionDays = 30;
      const climateType = document.getElementById('climateType')?.value;
      const intensity = document.getElementById('intensity')?.value || 'medium';

      let scenario = null;
      if (climateType && climateType !== 'none') {
        scenario = {
          climateType,
          intensity
        };
      }

      this.data.prediction = runoffPredictionModel.predictRunoff(
        this.data.cleaned,
        predictionDays,
        scenario
      );

      this.renderPredictionResults();
      this.renderCharts();
    } catch (error) {
      console.error('预测失败:', error);
      this.showError('预测失败，请稍后重试');
    } finally {
      this.hideLoading();
    }
  }

  async runClimateSimulation() {
    if (!this.data.cleaned || this.data.cleaned.length === 0) {
      alert('请先加载数据');
      return;
    }

    this.showLoading();
    try {
      const climateType = document.getElementById('simClimateType')?.value || EXTREME_CLIMATE_TYPES.FLOOD;
      const intensity = document.getElementById('simIntensity')?.value || 'medium';
      const duration = parseInt(document.getElementById('simDuration')?.value || '7');

      this.data.extremeClimate = extremeClimateSimulator.simulateExtremeRunoff(
        this.data.cleaned,
        climateType,
        intensity,
        duration
      );

      this.renderClimateSimulationResults();
      this.renderCharts();
    } catch (error) {
      console.error('气候模拟失败:', error);
      this.showError('气候模拟失败，请稍后重试');
    } finally {
      this.hideLoading();
    }
  }

  async runEcologicalEvaluation() {
    if (!this.data.cleaned || this.data.cleaned.length === 0) {
      alert('请先加载数据');
      return;
    }

    this.showLoading();
    try {
      const zone = WATERSHED_ZONES.find(z => z.id === this.currentZone) || WATERSHED_ZONES[0];
      
      this.data.ecologicalEvaluation = ecologicalBalanceEvaluator.evaluate(
        this.data.cleaned,
        zone
      );

      this.renderEcologicalEvaluationResults();
      this.renderCharts();
    } catch (error) {
      console.error('生态评估失败:', error);
      this.showError('生态评估失败，请稍后重试');
    } finally {
      this.hideLoading();
    }
  }

  async calibrateData() {
    if (!this.data.cleaned || this.data.cleaned.length === 0) {
      alert('请先加载数据');
      return;
    }

    this.showLoading();
    try {
      const calibrateResult = this.regionAdapter.calibrateRunoffData(
        this.data.cleaned,
        { fillGaps: true, removeOutliers: false }
      );
      
      this.data.calibrated = calibrateResult;
      this.renderCalibrationResults();
      
      if (calibrateResult.quality.meetsQualityStandards) {
        this.data.cleaned = calibrateResult.calibrated;
        this.calculateDerivedData();
        this.render();
      }
    } catch (error) {
      console.error('数据校准失败:', error);
      this.showError('数据校准失败，请稍后重试');
    } finally {
      this.hideLoading();
    }
  }

  initCharts() {
    this.disposeAllCharts();
    
    this.charts.main = new TimeSeriesChart('mainChart', {
      title: '径流量时序变化',
      yAxisName: '径流量 (m³/s)'
    });
    this.charts.currentMainChart = this.charts.main;
    
    this.charts.monthly = new StatisticalChart('monthlyChart', {
      title: '月度统计'
    });
    
    this.charts.ecological = new EcologicalFlowChart('ecoChart', {
      title: '生态流量满足度'
    });
    
    this.charts.anomaly = new StatisticalChart('anomalyChart', {
      title: '异常时段分布'
    });
  }

  disposeAllCharts() {
    if (this.charts.main) this.charts.main.dispose();
    if (this.charts.monthly) this.charts.monthly.dispose();
    if (this.charts.ecological) this.charts.ecological.dispose();
    if (this.charts.anomaly) this.charts.anomaly.dispose();
    if (this.charts.comparison) this.charts.comparison.dispose();
    if (this.charts.statistics) this.charts.statistics.dispose();
    if (this.charts.heatmap) this.charts.heatmap.dispose();
    if (this.charts.radar) this.charts.radar.dispose();
    if (this.charts.prediction) this.charts.prediction.dispose();
    
    this.charts = {};
  }

  render() {
    this.renderOverviewStats();
    this.renderStatIndicators();
    this.renderEcoFlowInfo();
    this.renderAnomalyAlerts();
    this.renderEcologicalEvaluationInfo();
    this.renderRegionInfo();
    this.renderCharts();
  }

  renderOverviewStats() {
    const container = document.getElementById('overview-stats');
    if (!this.data.cleaned || this.data.cleaned.length === 0) {
      container.innerHTML = '<div class="no-data">暂无数据</div>';
      return;
    }

    const values = this.data.cleaned.map(d => d.runoff_value);
    const stats = StatisticsUtils.summary(values);
    
    container.innerHTML = `
      <div class="stat-card">
        <span class="value">${stats.mean.toFixed(2)}</span>
        <span class="label">平均流量 (m³/s)</span>
      </div>
      <div class="stat-card">
        <span class="value">${stats.max.toFixed(2)}</span>
        <span class="label">最大流量 (m³/s)</span>
      </div>
      <div class="stat-card">
        <span class="value">${stats.min.toFixed(2)}</span>
        <span class="label">最小流量 (m³/s)</span>
      </div>
      <div class="stat-card">
        <span class="value">${this.data.cleaned.length}</span>
        <span class="label">数据记录数</span>
      </div>
    `;
  }

  renderStatIndicators() {
    const container = document.getElementById('stat-indicators');
    if (!this.data.cleaned || this.data.cleaned.length === 0) {
      container.innerHTML = '<div class="no-data">暂无数据</div>';
      return;
    }

    const values = this.data.cleaned.map(d => d.runoff_value);
    const stats = StatisticsUtils.summary(values);
    
    container.innerHTML = `
      <div class="indicator-item">
        <span class="label">中位数</span>
        <span class="value">${stats.median.toFixed(2)} m³/s</span>
      </div>
      <div class="indicator-item">
        <span class="label">标准差</span>
        <span class="value">${stats.std.toFixed(2)}</span>
      </div>
      <div class="indicator-item">
        <span class="label">变异系数</span>
        <span class="value">${stats.cv.toFixed(4)}</span>
      </div>
      <div class="indicator-item">
        <span class="label">P25分位值</span>
        <span class="value">${stats.q1.toFixed(2)} m³/s</span>
      </div>
      <div class="indicator-item">
        <span class="label">P75分位值</span>
        <span class="value">${stats.q3.toFixed(2)} m³/s</span>
      </div>
      <div class="indicator-item">
        <span class="label">年径流量</span>
        <span class="value">${(stats.mean * 31536000 / 100000000).toFixed(2)} 亿m³</span>
      </div>
    `;
  }

  renderEcoFlowInfo() {
    const container = document.getElementById('eco-flow-info');
    if (!this.data.ecological) {
      container.innerHTML = '<div class="no-data">暂无数据</div>';
      return;
    }

    const eco = this.data.ecological.overall;
    const satisfaction = this.data.ecological.trend?.meanCoefficient || eco.coefficient;
    const satisfactionPercent = Math.min(100, satisfaction * 100);
    
    let satisfactionClass = 'low';
    if (satisfactionPercent >= 80) satisfactionClass = 'high';
    else if (satisfactionPercent >= 60) satisfactionClass = 'medium';

    container.innerHTML = `
      <div class="eco-flow-item">
        <span class="type">生态径流系数</span>
        <span class="value">${eco.coefficient?.toFixed(4) || 'N/A'}</span>
      </div>
      <div class="eco-flow-item">
        <span class="type">最小生态流量</span>
        <span class="value">${eco.ecologicalFlow?.toFixed(2) || 'N/A'} m³/s</span>
      </div>
      <div class="eco-flow-item">
        <span class="type">适宜生态流量</span>
        <span class="value">${(eco.ecologicalFlow ? eco.ecologicalFlow * 1.5 : 'N/A')}</span>
      </div>
      <div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
          <span class="type">生态满足度</span>
          <span class="value">${satisfactionPercent.toFixed(1)}%</span>
        </div>
        <div class="satisfaction-bar">
          <div class="satisfaction-fill ${satisfactionClass}" style="width: ${satisfactionPercent}%"></div>
        </div>
      </div>
    `;
  }

  renderAnomalyAlerts() {
    const container = document.getElementById('anomaly-alerts');
    if (!this.data.anomalies || this.data.anomalies.totalPeriods === 0) {
      container.innerHTML = '<div class="no-data">暂无异常</div>';
      return;
    }

    const periods = this.data.anomalies.periods.slice(0, 5);
    
    container.innerHTML = periods.map(period => `
      <div class="alert-item ${period.severity?.level || 'moderate'}">
        <div><strong>${period.type === 'high' ? '高流量' : '低流量'}异常</strong></div>
        <div>${dayjs(period.start).format('YYYY-MM-DD')} - ${dayjs(period.end).format('YYYY-MM-DD')}</div>
        <div class="time">持续 ${period.duration} 天，平均 ${period.stats?.mean?.toFixed(2) || 'N/A'} m³/s</div>
      </div>
    `).join('');
  }

  renderEcologicalEvaluationInfo() {
    const container = document.getElementById('eco-evaluation');
    if (!this.data.ecologicalEvaluation) {
      container.innerHTML = '<div class="no-data">点击评估按钮查看生态评分</div>';
      return;
    }

    const evaluation = this.data.ecologicalEvaluation;
    
    container.innerHTML = `
      <div class="eco-eval-summary">
        <div class="eval-score" style="color: ${evaluation.gradeColor};">
          ${evaluation.totalScore.toFixed(1)}
          <span class="eval-grade">${evaluation.gradeLabel}</span>
        </div>
        <div class="eval-details">
          <div class="eval-item">
            <span class="label">流量稳定性</span>
            <span class="value">${(evaluation.indicatorScores.flow_stability || 0).toFixed(1)}</span>
          </div>
          <div class="eval-item">
            <span class="label">生态流量</span>
            <span class="value">${(evaluation.indicatorScores.ecological_flow_satisfaction || 0).toFixed(1)}</span>
          </div>
          <div class="eval-item">
            <span class="label">水质状况</span>
            <span class="value">${(evaluation.indicatorScores.water_quality || 0).toFixed(1)}</span>
          </div>
          <div class="eval-item">
            <span class="label">生境适宜</span>
            <span class="value">${(evaluation.indicatorScores.habitat_suitability || 0).toFixed(1)}</span>
          </div>
        </div>
      </div>
    `;
  }

  renderRegionInfo() {
    const container = document.getElementById('region-info');
    const regionInfo = this.regionAdapter.getRegionInfo();
    
    if (!regionInfo.available) {
      container.innerHTML = '<div class="no-data">区域信息不可用</div>';
      return;
    }

    container.innerHTML = `
      <div class="region-summary">
        <div class="region-name">${regionInfo.name}</div>
        <div class="region-desc">${regionInfo.description}</div>
        <div class="region-stats">
          <div class="stat-item">
            <span class="label">年均降雨</span>
            <span class="value">${regionInfo.avgAnnualRainfall.typical} mm</span>
          </div>
          <div class="stat-item">
            <span class="label">年均径流</span>
            <span class="value">${regionInfo.avgAnnualRunoff.typical} mm</span>
          </div>
        </div>
      </div>
    `;
  }

  renderPredictionResults() {
    const container = document.getElementById('prediction-results');
    if (!this.data.prediction) {
      container.innerHTML = '<div class="no-data">暂无预测结果</div>';
      return;
    }

    const pred = this.data.prediction;
    
    container.innerHTML = `
      <div class="prediction-summary">
        <div class="pred-item">
          <span class="label">预测天数</span>
          <span class="value">${pred.prediction?.length || 0} 天</span>
        </div>
        <div class="pred-item">
          <span class="label">预测均值</span>
          <span class="value">${pred.metrics?.mean?.toFixed(2) || 'N/A'} m³/s</span>
        </div>
        <div class="pred-item">
          <span class="label">预测峰值</span>
          <span class="value">${pred.metrics?.peakOccurrence?.value?.toFixed(2) || 'N/A'} m³/s</span>
        </div>
        <div class="pred-item">
          <span class="label">置信度</span>
          <span class="value">${pred.confidence}</span>
        </div>
        ${pred.climateScenario ? `
          <div class="pred-item climate">
            <span class="label">气候情景</span>
            <span class="value">${pred.climateScenario.description}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderClimateSimulationResults() {
    const container = document.getElementById('climate-results');
    if (!this.data.extremeClimate) {
      container.innerHTML = '<div class="no-data">暂无模拟结果</div>';
      return;
    }

    const sim = this.data.extremeClimate;
    
    container.innerHTML = `
      <div class="climate-summary">
        <div class="climate-type" style="color: ${sim.climateParams?.color || '#333'};">
          ${sim.climateParams?.name || sim.climateType}
        </div>
        <div class="climate-stats">
          <div class="stat-item">
            <span class="label">风险等级</span>
            <span class="value ${sim.riskAssessment?.level || 'unknown'}">${sim.riskAssessment?.level || '未知'}</span>
          </div>
          <div class="stat-item">
            <span class="label">风险评分</span>
            <span class="value">${sim.riskAssessment?.score || 0}/100</span>
          </div>
          <div class="stat-item">
            <span class="label">重现期</span>
            <span class="value">${sim.returnPeriod?.description || '未知'}</span>
          </div>
          <div class="stat-item">
            <span class="label">模拟峰值</span>
            <span class="value">${sim.simulatedStats?.max?.toFixed(2) || 'N/A'} m³/s</span>
          </div>
        </div>
      </div>
    `;
  }

  renderCalibrationResults() {
    const container = document.getElementById('calibration-results');
    if (!this.data.calibrated) {
      container.innerHTML = '<div class="no-data">暂无校准结果</div>';
      return;
    }

    const calib = this.data.calibrated;
    
    container.innerHTML = `
      <div class="calibration-summary">
        <div class="calib-stats">
          <div class="stat-item">
            <span class="label">处理记录</span>
            <span class="value">${calib.quality?.processedCount || 0}</span>
          </div>
          <div class="stat-item">
            <span class="label">填补缺失</span>
            <span class="value">${calib.quality?.gapFilledCount || 0}</span>
          </div>
          <div class="stat-item">
            <span class="label">异常检测</span>
            <span class="value">${calib.quality?.outlierCount || 0}</span>
          </div>
          <div class="stat-item">
            <span class="label">质量状态</span>
            <span class="value ${calib.quality?.meetsQualityStandards ? 'good' : 'warning'}">
              ${calib.quality?.meetsQualityStandards ? '合格' : '需改善'}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  renderCharts() {
    if (!this.data.cleaned || this.data.cleaned.length === 0) return;

    this.charts.main.render(this.data.cleaned);
    
    const monthly = TimeSeriesUtils.calculateMonthlyStats(this.data.cleaned, 'record_time', 'runoff_value');
    const monthlyChartData = monthly.map(m => ({
      month: m.month,
      mean: m.avg,
      max: m.max,
      min: m.min
    }));
    this.charts.monthly.renderSeasonalChart(monthlyChartData);

    if (this.data.ecological && this.data.ecological.overall) {
      const ecoFlow = this.data.ecological.overall.ecologicalFlow || this.data.ecological.overall.annualOptimal || 0;
      this.charts.ecological.renderWithEcologicalThreshold(this.data.cleaned, ecoFlow);
    }

    if (this.data.anomalies) {
      const anomalyTypeData = [
        { name: '高流量异常', value: this.data.anomalies.byType?.high?.length || 0 },
        { name: '低流量异常', value: this.data.anomalies.byType?.low?.length || 0 },
        { name: '中度波动', value: this.data.anomalies.byType?.moderate?.length || 0 }
      ];
      this.charts.anomaly.renderPieChart(anomalyTypeData, '异常类型分布');
    }
  }

  switchChart(chartType, tabElement) {
    document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
    tabElement.classList.add('active');

    if (this.charts.currentMainChart) {
      this.charts.currentMainChart.dispose();
      this.charts.currentMainChart = null;
    }

    const container = document.getElementById('mainChart');
    
    switch (chartType) {
      case 'timeseries':
        this.charts.main = new TimeSeriesChart('mainChart', {
          title: '径流量时序变化',
          yAxisName: '径流量 (m³/s)'
        });
        this.charts.currentMainChart = this.charts.main;
        this.charts.main.render(this.data.cleaned);
        break;
        
      case 'comparison':
        if (this.data.raw && this.data.raw.length > 1) {
          const zonesData = this.data.raw.map(z => {
            const zoneConfig = WATERSHED_ZONES.find(wz => wz.id === z.zoneId);
            return {
              zoneId: z.zoneId,
              zoneName: zoneConfig?.name || z.zoneId,
              color: zoneConfig?.color,
              data: z.data
            };
          });
          this.charts.comparison = new MultiZoneComparisonChart('mainChart', {
            title: '多流域径流量对比'
          });
          this.charts.currentMainChart = this.charts.comparison;
          this.charts.comparison.render(zonesData);
        } else {
          alert('请选择"全流域"以查看多流域对比');
          document.querySelector('.chart-tab[data-chart="timeseries"]').click();
        }
        break;
        
      case 'statistics':
        this.charts.statistics = new StatisticalChart('mainChart', {
          title: '径流量分布统计'
        });
        this.charts.currentMainChart = this.charts.statistics;
        const values = this.data.cleaned.map(d => d.runoff_value);
        this.charts.statistics.renderHistogram(values, 30, '径流量频率分布');
        break;
        
      case 'heatmap':
        this.charts.heatmap = new StationHeatmapChart('mainChart', {
          title: '监测点位热力分布'
        });
        this.charts.currentMainChart = this.charts.heatmap;
        const allData = this.data.raw ? this.data.raw.flatMap(z => z.data) : this.data.cleaned;
        this.charts.heatmap.renderStationHeatmap(allData, 'runoff_value', '监测点位径流热力分布');
        break;
        
      case 'radar':
        this.charts.radar = new EcologicalRadarChart('mainChart', {
          title: '生态平衡评估'
        });
        this.charts.currentMainChart = this.charts.radar;
        if (this.data.ecologicalEvaluation) {
          this.charts.radar.renderEvaluation(this.data.ecologicalEvaluation, '生态平衡评估雷达图');
        } else {
          const zone = WATERSHED_ZONES.find(z => z.id === this.currentZone) || WATERSHED_ZONES[0];
          const evaluation = ecologicalBalanceEvaluator.evaluate(this.data.cleaned, zone);
          this.charts.radar.renderEvaluation(evaluation, '生态平衡评估雷达图');
        }
        break;
        
      case 'prediction':
        this.charts.prediction = new TimeSeriesChart('mainChart', {
          title: '径流预测分析'
        });
        this.charts.currentMainChart = this.charts.prediction;
        if (this.data.prediction && this.data.prediction.prediction) {
          const combinedData = [
            ...this.data.cleaned.slice(-60),
            ...this.data.prediction.prediction.map(p => ({
              ...p,
              runoff_value: p.runoff_value,
              is_prediction: true
            }))
          ];
          this.charts.prediction.render(combinedData);
        } else {
          this.charts.prediction.render(this.data.cleaned);
        }
        break;
    }
  }

  async exportReport() {
    if (!this.data.cleaned) {
      alert('请先加载数据');
      return;
    }

    try {
      const timeRange = this.getTimeRange();
      const zoneId = this.currentZone === 'all' ? WATERSHED_ZONES[0].id : this.currentZone;
      
      await batchReportGenerator.generateZoneReport(
        zoneId,
        timeRange.start,
        timeRange.end,
        { download: true }
      );
      
      alert('报表导出成功！');
    } catch (error) {
      console.error('报表导出失败:', error);
      alert('报表导出失败，请稍后重试');
    }
  }

  showLoading() {
    const containers = ['overview-stats', 'stat-indicators', 'eco-flow-info', 'anomaly-alerts'];
    containers.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="loading">加载中...</div>';
    });
  }

  hideLoading() {
  }

  showError(message) {
    const containers = ['overview-stats', 'stat-indicators', 'eco-flow-info', 'anomaly-alerts'];
    containers.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="no-data">${message}</div>`;
    });
  }
}

export default WatershedAnalysisApp;
