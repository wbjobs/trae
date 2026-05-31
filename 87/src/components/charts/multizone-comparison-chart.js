import { ChartBase } from './chart-base.js';
import { VISUALIZATION_CONFIG } from '@config/system.config.js';

export class MultiZoneComparisonChart extends ChartBase {
  constructor(container, options = {}) {
    super(container, options);
    this.timeField = options.timeField || 'record_time';
    this.valueField = options.valueField || 'runoff_value';
  }

  render(zonesData) {
    if (!zonesData || zonesData.length === 0) {
      this.setOption({
        title: { text: '暂无数据', left: 'center', top: 'center' }
      });
      return;
    }

    const xAxisData = this.extractCommonTimeAxis(zonesData);
    const series = zonesData.map((zone, index) => ({
      name: zone.zoneName,
      type: 'line',
      data: this.alignDataToTimeAxis(zone.data, xAxisData),
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: {
        width: 2,
        color: zone.color || VISUALIZATION_CONFIG.chartColors[index % VISUALIZATION_CONFIG.chartColors.length]
      },
      emphasis: {
        focus: 'series'
      }
    }));

    const option = {
      title: {
        text: this.options.title || '多流域径流量对比',
        left: 'center',
        textStyle: { fontSize: 16 }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: {
        data: zonesData.map(z => z.zoneName),
        top: 30
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '18%',
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
        name: this.options.yAxisName || '径流量 (m³/s)'
      },
      dataZoom: VISUALIZATION_CONFIG.enableDataZoom ? [
        { type: 'inside', start: 0, end: 100 },
        { start: 0, end: 100, height: 20, bottom: 30 }
      ] : undefined,
      series
    };

    this.setOption(option, true);
  }

  extractCommonTimeAxis(zonesData) {
    const allTimes = new Set();
    zonesData.forEach(zone => {
      zone.data.forEach(d => {
        const timeStr = typeof d[this.timeField] === 'string' 
          ? d[this.timeField] 
          : new Date(d[this.timeField]).toISOString();
        allTimes.add(timeStr);
      });
    });
    return Array.from(allTimes).sort((a, b) => new Date(a) - new Date(b));
  }

  alignDataToTimeAxis(data, timeAxis) {
    const dataMap = new Map();
    data.forEach(d => {
      const timeStr = typeof d[this.timeField] === 'string'
        ? d[this.timeField]
        : new Date(d[this.timeField]).toISOString();
      dataMap.set(timeStr, d[this.valueField]);
    });
    
    return timeAxis.map(time => {
      const value = dataMap.get(time);
      return value !== undefined ? value : null;
    });
  }

  renderStackedArea(zonesData) {
    const xAxisData = this.extractCommonTimeAxis(zonesData);
    const series = zonesData.map((zone, index) => ({
      name: zone.zoneName,
      type: 'line',
      stack: 'Total',
      areaStyle: {},
      emphasis: { focus: 'series' },
      data: this.alignDataToTimeAxis(zone.data, xAxisData),
      lineStyle: {
        width: 1,
        color: zone.color || VISUALIZATION_CONFIG.chartColors[index % VISUALIZATION_CONFIG.chartColors.length]
      },
      itemStyle: {
        color: zone.color || VISUALIZATION_CONFIG.chartColors[index % VISUALIZATION_CONFIG.chartColors.length]
      }
    }));

    const option = {
      title: { text: this.options.title || '多流域径流量叠加', left: 'center' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { data: zonesData.map(z => z.zoneName), top: 30 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '18%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xAxisData,
        axisLabel: { rotate: 45, formatter: (value) => value.substring(0, 10) }
      },
      yAxis: { type: 'value', name: this.options.yAxisName || '径流量 (m³/s)' },
      dataZoom: VISUALIZATION_CONFIG.enableDataZoom ? [
        { type: 'inside', start: 0, end: 100 },
        { start: 0, end: 100, height: 20, bottom: 30 }
      ] : undefined,
      series
    };

    this.setOption(option, true);
  }
}

export default MultiZoneComparisonChart;
