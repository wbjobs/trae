import { ChartBase } from './chart-base.js';
import { VISUALIZATION_CONFIG } from '@config/system.config.js';
import * as echarts from 'echarts';

export class StatisticalChart extends ChartBase {
  constructor(container, options = {}) {
    super(container, options);
  }

  renderBoxplot(boxplotData, categories) {
    const option = {
      title: { text: this.options.title || '径流量统计分布', left: 'center' },
      tooltip: { trigger: 'item', axisPointer: { type: 'shadow' } },
      grid: { left: '10%', right: '10%', bottom: '15%', containLabel: true },
      xAxis: { type: 'category', data: categories, boundaryGap: true },
      yAxis: { type: 'value', name: this.options.yAxisName || '径流量 (m³/s)' },
      series: [{
        name: '径流量分布',
        type: 'boxplot',
        data: boxplotData,
        itemStyle: { color: VISUALIZATION_CONFIG.chartColors[0] },
        tooltip: {
          formatter: (params) => {
            const [min, q1, median, q3, max] = params.data;
            return `
              ${params.name}<br/>
              最小值: ${min.toFixed(2)}<br/>
              下四分位: ${q1.toFixed(2)}<br/>
              中位数: ${median.toFixed(2)}<br/>
              上四分位: ${q3.toFixed(2)}<br/>
              最大值: ${max.toFixed(2)}
            `;
          }
        }
      }]
    };

    this.setOption(option, true);
  }

  renderHistogram(values, bins = 20, title = '径流量频率分布') {
    const histogram = this.calculateHistogram(values, bins);
    
    const option = {
      title: { text: this.options.title || title, left: 'center' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const data = params[0];
          return `
            区间: ${histogram.bins[data.dataIndex].min.toFixed(2)} - ${histogram.bins[data.dataIndex].max.toFixed(2)}<br/>
            频数: ${data.value}<br/>
            频率: ${(data.value / values.length * 100).toFixed(1)}%
          `;
        }
      },
      grid: { left: '10%', right: '10%', bottom: '15%', containLabel: true },
      xAxis: {
        type: 'category',
        data: histogram.bins.map(b => `${b.min.toFixed(1)}`),
        axisLabel: { rotate: 45 }
      },
      yAxis: { type: 'value', name: '频数' },
      series: [{
        type: 'bar',
        data: histogram.counts,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: VISUALIZATION_CONFIG.chartColors[0] },
            { offset: 1, color: `${VISUALIZATION_CONFIG.chartColors[0]}66` }
          ])
        }
      }]
    };

    this.setOption(option, true);
  }

  calculateHistogram(values, bins) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / bins;
    const counts = new Array(bins).fill(0);
    const binRanges = [];

    for (let i = 0; i < bins; i++) {
      binRanges.push({
        min: min + i * binWidth,
        max: min + (i + 1) * binWidth
      });
    }

    for (const value of values) {
      let binIndex = Math.floor((value - min) / binWidth);
      if (binIndex >= bins) binIndex = bins - 1;
      if (binIndex < 0) binIndex = 0;
      counts[binIndex]++;
    }

    return { bins: binRanges, counts, min, max, binWidth };
  }

  renderSeasonalChart(seasonalData) {
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    
    const option = {
      title: { text: this.options.title || '季节性径流量统计', left: 'center' },
      tooltip: { trigger: 'axis' },
      legend: { data: ['平均径流量', '最大径流量', '最小径流量'], bottom: 10 },
      grid: { left: '10%', right: '10%', bottom: '15%', containLabel: true },
      xAxis: { type: 'category', data: months },
      yAxis: { type: 'value', name: '径流量 (m³/s)' },
      series: [
        {
          name: '平均径流量',
          type: 'line',
          data: seasonalData.map(d => d.mean),
          smooth: true,
          lineStyle: { width: 3, color: VISUALIZATION_CONFIG.chartColors[0] }
        },
        {
          name: '最大径流量',
          type: 'line',
          data: seasonalData.map(d => d.max),
          lineStyle: { width: 1, color: VISUALIZATION_CONFIG.chartColors[1], type: 'dashed' }
        },
        {
          name: '最小径流量',
          type: 'line',
          data: seasonalData.map(d => d.min),
          lineStyle: { width: 1, color: VISUALIZATION_CONFIG.chartColors[2], type: 'dashed' }
        }
      ]
    };

    this.setOption(option, true);
  }

  renderPieChart(data, title = '数据占比') {
    const option = {
      title: { text: this.options.title || title, left: 'center' },
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', left: 'left', top: 'center' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: false, position: 'center' },
        emphasis: {
          label: { show: true, fontSize: 20, fontWeight: 'bold' }
        },
        labelLine: { show: false },
        data: data.map((d, i) => ({
          value: d.value,
          name: d.name,
          itemStyle: { color: VISUALIZATION_CONFIG.chartColors[i % VISUALIZATION_CONFIG.chartColors.length] }
        }))
      }]
    };

    this.setOption(option, true);
  }
}

export default StatisticalChart;
