import { ChartBase } from './chart-base.js';
import { VISUALIZATION_CONFIG } from '@config/system.config.js';

export class TimeSeriesChart extends ChartBase {
  constructor(container, options = {}) {
    super(container, options);
    this.valueField = options.valueField || 'runoff_value';
    this.timeField = options.timeField || 'record_time';
  }

  render(data, seriesOptions = []) {
    if (!data || data.length === 0) {
      this.setOption({
        title: { text: '暂无数据', left: 'center', top: 'center' }
      });
      return;
    }

    const xAxisData = data.map(d => d[this.timeField]);
    const series = seriesOptions.length > 0 ? seriesOptions : this.getDefaultSeries(data);

    const option = {
      title: {
        text: this.options.title || '径流时序变化',
        left: 'center',
        textStyle: { fontSize: 16 }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: {
        data: series.map(s => s.name),
        bottom: 10
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xAxisData,
        axisLabel: {
          rotate: 45,
          formatter: (value) => value.substring(0, 10)
        }
      },
      yAxis: {
        type: 'value',
        name: this.options.yAxisName || '径流量 (m³/s)',
        axisLabel: { formatter: '{value}' }
      },
      dataZoom: VISUALIZATION_CONFIG.enableDataZoom ? [
        { type: 'inside', start: 0, end: 100 },
        { start: 0, end: 100, height: 20, bottom: 30 }
      ] : undefined,
      series
    };

    this.setOption(option, true);
  }

  getDefaultSeries(data) {
    return [
      {
        name: '径流量',
        type: 'line',
        data: data.map(d => d[this.valueField]),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: VISUALIZATION_CONFIG.chartColors[0] },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(84, 112, 198, 0.3)' },
              { offset: 1, color: 'rgba(84, 112, 198, 0.05)' }
            ]
          }
        }
      }
    ];
  }

  renderMultiSeries(data, seriesConfigs) {
    const xAxisData = data.map(d => d[this.timeField]);
    
    const series = seriesConfigs.map((config, index) => ({
      name: config.name,
      type: config.type || 'line',
      data: data.map(d => d[config.field]),
      smooth: config.smooth !== false,
      symbol: config.symbol || 'none',
      lineStyle: {
        width: config.lineWidth || 2,
        color: config.color || VISUALIZATION_CONFIG.chartColors[index % VISUALIZATION_CONFIG.chartColors.length]
      },
      areaStyle: config.showArea ? {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: `${config.color || VISUALIZATION_CONFIG.chartColors[index]}4D` },
            { offset: 1, color: `${config.color || VISUALIZATION_CONFIG.chartColors[index]}0D` }
          ]
        }
      } : undefined
    }));

    this.render(data, series);
  }

  addThresholdLine(threshold, name = '阈值', color = '#ee6666') {
    const option = this.chart.getOption();
    option.series[0].markLine = {
      silent: true,
      data: [{ yAxis: threshold, name }],
      lineStyle: { color, type: 'dashed', width: 2 },
      label: { formatter: '{b}: {c}' }
    };
    this.setOption(option);
  }

  highlightAnomalyPeriods(anomalyPeriods) {
    const option = this.chart.getOption();
    
    if (!option.xAxis[0].axisPointer) {
      option.xAxis[0].axisPointer = {};
    }
    
    option.series[0].markArea = {
      silent: true,
      itemStyle: { color: 'rgba(238, 102, 102, 0.2)' },
      data: anomalyPeriods.map(period => [
        { xAxis: period.start, itemStyle: { color: period.type === 'high' ? 'rgba(238, 102, 102, 0.2)' : 'rgba(84, 112, 198, 0.2)' } },
        { xAxis: period.end }
      ])
    };
    
    this.setOption(option);
  }
}

export default TimeSeriesChart;
