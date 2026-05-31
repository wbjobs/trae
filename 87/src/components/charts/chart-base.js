import * as echarts from 'echarts';
import { VISUALIZATION_CONFIG } from '@config/system.config.js';

export class ChartBase {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' 
      ? document.getElementById(container) 
      : container;
    
    if (!this.container) {
      throw new Error('Chart container not found');
    }

    this.chart = echarts.init(this.container, options.theme || VISUALIZATION_CONFIG.chartTheme);
    this.options = {
      animation: VISUALIZATION_CONFIG.enableAnimation,
      animationDuration: VISUALIZATION_CONFIG.animationDuration,
      ...options
    };

    window.addEventListener('resize', () => this.resize());
  }

  setOption(option, notMerge = false, lazyUpdate = false) {
    this.chart.setOption(option, notMerge, lazyUpdate);
  }

  resize() {
    this.chart.resize();
  }

  showLoading(text = '加载中...') {
    this.chart.showLoading('default', { text });
  }

  hideLoading() {
    this.chart.hideLoading();
  }

  dispose() {
    this.chart.dispose();
    window.removeEventListener('resize', () => this.resize());
  }

  getEChartsInstance() {
    return this.chart;
  }

  getDataURL(options = {}) {
    return this.chart.getDataURL(options);
  }

  on(eventName, handler) {
    this.chart.on(eventName, handler);
  }

  off(eventName, handler) {
    this.chart.off(eventName, handler);
  }
}

export default ChartBase;
