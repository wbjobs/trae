import { ChartBase } from './chart-base.js';
import { VISUALIZATION_CONFIG } from '@config/system.config.js';

export class EcologicalFlowChart extends ChartBase {
  constructor(container, options = {}) {
    super(container, options);
    this.timeField = options.timeField || 'record_time';
    this.valueField = options.valueField || 'runoff_value';
  }

  renderWithEcologicalThreshold(data, ecologicalFlow) {
    if (!data || data.length === 0) {
      this.setOption({ title: { text: '暂无数据', left: 'center', top: 'center' } });
      return;
    }

    const xAxisData = data.map(d => d[this.timeField]);
    const runoffValues = data.map(d => d[this.valueField]);
    
    const deficitData = data.map(d => {
      const deficit = Math.max(0, ecologicalFlow - d[this.valueField]);
      return deficit > 0 ? d[this.valueField] : null;
    });

    const option = {
      title: {
        text: this.options.title || '径流量与生态流量对比',
        left: 'center',
        textStyle: { fontSize: 16 }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params) => {
          let result = `${params[0].axisValue}<br/>`;
          params.forEach(p => {
            result += `${p.marker}${p.seriesName}: ${p.value?.toFixed?.(2) || p.value} m³/s<br/>`;
          });
          const deficit = Math.max(0, ecologicalFlow - (params[0]?.value || 0));
          if (deficit > 0) {
            result += `<span style="color:#ee6666">生态缺水量: ${deficit.toFixed(2)} m³/s</span>`;
          }
          return result;
        }
      },
      legend: {
        data: ['实际径流量', '生态流量阈值', '生态缺水时段'],
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
        axisLabel: { rotate: 45, formatter: (value) => value.substring(0, 10) }
      },
      yAxis: {
        type: 'value',
        name: '径流量 (m³/s)'
      },
      dataZoom: VISUALIZATION_CONFIG.enableDataZoom ? [
        { type: 'inside', start: 0, end: 100 },
        { start: 0, end: 100, height: 20, bottom: 30 }
      ] : undefined,
      series: [
        {
          name: '实际径流量',
          type: 'line',
          data: runoffValues,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: VISUALIZATION_CONFIG.chartColors[0] },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(84, 112, 198, 0.3)' },
                { offset: 1, color: 'rgba(84, 112, 198, 0.05)' }
              ]
            }
          },
          z: 3
        },
        {
          name: '生态流量阈值',
          type: 'line',
          data: new Array(runoffValues.length).fill(ecologicalFlow),
          symbol: 'none',
          lineStyle: { width: 2, color: '#ee6666', type: 'dashed' },
          z: 2
        },
        {
          name: '生态缺水时段',
          type: 'line',
          data: deficitData,
          symbol: 'none',
          lineStyle: { width: 0 },
          areaStyle: {
            color: 'rgba(238, 102, 102, 0.3)'
          },
          z: 1
        }
      ]
    };

    this.setOption(option, true);
  }

  renderSatisfactionIndex(satisfactionData) {
    const months = satisfactionData.map(d => d.month);
    const satisfactionRates = satisfactionData.map(d => d.satisfactionRate);
    const deficitDays = satisfactionData.map(d => d.deficitDays);

    const option = {
      title: { text: this.options.title || '生态流量满足度分析', left: 'center' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { data: ['满足度', '缺水天数'], top: 30 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '18%', containLabel: true },
      xAxis: { type: 'category', data: months },
      yAxis: [
        { type: 'value', name: '满足度 (%)', min: 0, max: 100 },
        { type: 'value', name: '缺水天数', min: 0 }
      ],
      series: [
        {
          name: '满足度',
          type: 'bar',
          data: satisfactionRates,
          itemStyle: {
            color: (params) => {
              return params.value >= 90 ? '#91cc75' : params.value >= 70 ? '#fac858' : '#ee6666';
            }
          },
          yAxisIndex: 0
        },
        {
          name: '缺水天数',
          type: 'line',
          data: deficitDays,
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { width: 2, color: '#ee6666' },
          yAxisIndex: 1
        }
      ]
    };

    this.setOption(option, true);
  }

  renderCoefficientTrend(coefficientData) {
    const option = {
      title: { text: this.options.title || '生态径流系数变化趋势', left: 'center' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { data: ['生态径流系数', '趋势线'], top: 30 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '18%', containLabel: true },
      xAxis: { type: 'category', data: coefficientData.map(d => d.year) },
      yAxis: { type: 'value', name: '生态径流系数' },
      series: [
        {
          name: '生态径流系数',
          type: 'bar',
          data: coefficientData.map(d => d.coefficient),
          itemStyle: { color: VISUALIZATION_CONFIG.chartColors[0] }
        },
        {
          name: '趋势线',
          type: 'line',
          data: this.calculateTrendLine(coefficientData.map(d => d.coefficient)),
          smooth: false,
          symbol: 'none',
          lineStyle: { width: 2, color: '#ee6666', type: 'dashed' },
          markLine: {
            silent: true,
            data: [{ type: 'average', name: '平均值' }]
          }
        }
      ]
    };

    this.setOption(option, true);
  }

  calculateTrendLine(values) {
    const n = values.length;
    if (n < 2) return values;

    const x = Array.from({ length: n }, (_, i) => i);
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (x[i] - meanX) * (values[i] - meanY);
      denominator += Math.pow(x[i] - meanX, 2);
    }

    const slope = denominator > 0 ? numerator / denominator : 0;
    const intercept = meanY - slope * meanX;

    return x.map(xi => slope * xi + intercept);
  }
}

export default EcologicalFlowChart;
