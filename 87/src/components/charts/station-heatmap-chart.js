import { ChartBase } from './chart-base.js';
import { VISUALIZATION_CONFIG } from '@config/system.config.js';
import { MONITORING_STATIONS } from '@config/monitoring-stations.config.js';
import { WATERSHED_ZONES } from '@config/watershed-zones.config.js';
import * as echarts from 'echarts';

export class StationHeatmapChart extends ChartBase {
  constructor(container, options = {}) {
    super(container, options);
    this.heatmapType = options.heatmapType || 'value';
    this.showLabels = options.showLabels !== false;
    this.gradientColors = options.gradientColors || [
      '#313695',
      '#4575b4',
      '#74add1',
      '#abd9e9',
      '#e0f3f8',
      '#ffffbf',
      '#fee090',
      '#fdae61',
      '#f46d43',
      '#d73027',
      '#a50026'
    ];
  }

  renderStationHeatmap(stationData, metricField = 'runoff_value', title = '监测点位热力分布') {
    if (!stationData || stationData.length === 0) {
      this.renderEmptyState('暂无数据');
      return;
    }

    const processedData = this.processStationData(stationData, metricField);
    const option = this.buildHeatmapOption(processedData, metricField, title);
    
    this.setOption(option, true);
  }

  processStationData(stationData, metricField) {
    const stationMap = new Map();
    
    for (const station of MONITORING_STATIONS) {
      stationMap.set(station.id, {
        ...station,
        values: [],
        count: 0
      });
    }

    for (const data of stationData) {
      const stationId = data.station_id;
      const station = stationMap.get(stationId);
      if (station && data[metricField] !== null && data[metricField] !== undefined) {
        const value = Number(data[metricField]);
        if (!isNaN(value) && value >= 0) {
          station.values.push(value);
          station.count++;
        }
      }
    }

    const result = [];
    for (const station of stationMap.values()) {
      if (station.values.length > 0) {
        const stats = this.calculateStats(station.values);
        result.push({
          stationId: station.id,
          name: station.name,
          zoneId: station.zoneId,
          lat: station.lat,
          lng: station.lng,
          elevation: station.elevation,
          type: station.type,
          count: station.count,
          ...stats
        });
      }
    }

    return result;
  }

  calculateStats(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      latest: values[values.length - 1]
    };
  }

  buildHeatmapOption(processedData, metricField, title) {
    const values = processedData.map(d => d.mean);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    const zoneColors = {};
    for (const zone of WATERSHED_ZONES) {
      zoneColors[zone.id] = zone.color;
    }

    const scatterData = processedData.map(d => [
      d.lng,
      d.lat,
      d.mean,
      d
    ]);

    return {
      title: {
        text: title,
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'item',
        formatter: (params) => {
          const data = params.data[3];
          return `
            <div style="font-weight:bold;margin-bottom:5px;">${data.name}</div>
            <div>流域: ${WATERSHED_ZONES.find(z => z.id === data.zoneId)?.name || '-'}</div>
            <div>站点类型: ${this.getStationTypeName(data.type)}</div>
            <div>数据量: ${data.count} 条</div>
            <div>平均${this.getMetricName(metricField)}: ${data.mean.toFixed(3)}</div>
            <div>最大${this.getMetricName(metricField)}: ${data.max.toFixed(3)}</div>
            <div>最小${this.getMetricName(metricField)}: ${data.min.toFixed(3)}</div>
            <div>最新${this.getMetricName(metricField)}: ${data.latest.toFixed(3)}</div>
          `;
        }
      },
      grid: {
        left: '5%',
        right: '5%',
        top: '15%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: '经度',
        min: Math.min(...processedData.map(d => d.lng)) - 0.1,
        max: Math.max(...processedData.map(d => d.lng)) + 0.1,
        axisLabel: {
          formatter: '{value}°'
        }
      },
      yAxis: {
        type: 'value',
        name: '纬度',
        min: Math.min(...processedData.map(d => d.lat)) - 0.1,
        max: Math.max(...processedData.map(d => d.lat)) + 0.1,
        axisLabel: {
          formatter: '{value}°'
        }
      },
      visualMap: {
        type: 'continuous',
        min: minValue,
        max: maxValue,
        left: 20,
        bottom: 20,
        text: ['高值', '低值'],
        calculable: true,
        inRange: {
          color: this.gradientColors
        }
      },
      series: [
        {
          name: '监测点位',
          type: 'scatter',
          data: scatterData,
          symbolSize: (value, params) => {
            const data = params.data[3];
            const normalizedCount = Math.min(1, data.count / 100);
            return 15 + normalizedCount * 20;
          },
          itemStyle: {
            opacity: 0.8,
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            shadowColor: 'rgba(0, 0, 0, 0.3)'
          },
          label: {
            show: this.showLabels,
            position: 'top',
            formatter: (params) => params.data[3].name,
            fontSize: 11,
            color: '#333'
          },
          emphasis: {
            itemStyle: {
              borderColor: '#fff',
              borderWidth: 2
            },
            label: {
              show: true,
              fontWeight: 'bold'
            }
          }
        },
        {
          name: '流域分区',
          type: 'effectScatter',
          data: this.generateZoneCenterData(),
          symbolSize: 50,
          rippleEffect: {
            period: 3,
            scale: 4,
            brushType: 'stroke'
          },
          itemStyle: {
            opacity: 0.3
          }
        }
      ]
    };
  }

  generateZoneCenterData() {
    const zoneData = [];
    
    for (const zone of WATERSHED_ZONES) {
      const zoneStations = MONITORING_STATIONS.filter(s => s.zoneId === zone.id);
      if (zoneStations.length > 0) {
        const avgLng = zoneStations.reduce((sum, s) => sum + s.lng, 0) / zoneStations.length;
        const avgLat = zoneStations.reduce((sum, s) => sum + s.lat, 0) / zoneStations.length;
        
        zoneData.push({
          value: [avgLng, avgLat, 0],
          name: zone.name,
          itemStyle: {
            color: zone.color
          }
        });
      }
    }

    return zoneData;
  }

  renderTimeLapseHeatmap(timeSeriesData, metricField = 'runoff_value', timeInterval = 'day') {
    if (!timeSeriesData || timeSeriesData.length === 0) {
      this.renderEmptyState('暂无数据');
      return;
    }

    const timeGroups = this.groupDataByTime(timeSeriesData, timeInterval);
    const timelineData = Object.keys(timeGroups).sort();
    
    if (timelineData.length < 2) {
      this.renderStationHeatmap(timeSeriesData, metricField, '监测点位热力分布');
      return;
    }

    const options = timelineData.map(time => {
      const data = timeGroups[time];
      const processedData = this.processStationData(data, metricField);
      return this.buildHeatmapOption(processedData, metricField, `${time} 热力分布`);
    });

    const option = {
      baseOption: {
        timeline: {
          data: timelineData,
          axisType: 'category',
          autoPlay: true,
          playInterval: 1500,
          bottom: 10,
          label: {
            fontSize: 10
          }
        }
      },
      options: options
    };

    this.setOption(option, true);
  }

  groupDataByTime(data, interval) {
    const groups = {};
    const formatMap = {
      'day': (d) => d.split(' ')[0],
      'month': (d) => d.substring(0, 7),
      'year': (d) => d.substring(0, 4),
      'week': (d) => {
        const date = new Date(d);
        const weekNum = Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7);
        return `${date.getFullYear()}-${date.getMonth() + 1}-W${weekNum}`;
      }
    };

    const formatFn = formatMap[interval] || formatMap['day'];

    for (const item of data) {
      const timeKey = formatFn(item.record_time);
      if (!groups[timeKey]) {
        groups[timeKey] = [];
      }
      groups[timeKey].push(item);
    }

    return groups;
  }

  renderDensityHeatmap(stationData, metricField = 'runoff_value') {
    if (!stationData || stationData.length === 0) {
      this.renderEmptyState('暂无数据');
      return;
    }

    const processedData = this.processStationData(stationData, metricField);
    
    const lngRange = {
      min: Math.min(...processedData.map(d => d.lng)),
      max: Math.max(...processedData.map(d => d.lng))
    };
    const latRange = {
      min: Math.min(...processedData.map(d => d.lat)),
      max: Math.max(...processedData.map(d => d.lat))
    };

    const gridSize = 20;
    const heatmapData = this.generateHeatmapGrid(processedData, gridSize, lngRange, latRange);

    const option = {
      title: {
        text: '流域监测密度热力图',
        left: 'center',
        top: 10
      },
      tooltip: {
        position: 'top'
      },
      grid: {
        left: '5%',
        right: '5%',
        top: '15%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        min: lngRange.min - 0.1,
        max: lngRange.max + 0.1,
        name: '经度'
      },
      yAxis: {
        type: 'value',
        min: latRange.min - 0.1,
        max: latRange.max + 0.1,
        name: '纬度'
      },
      visualMap: {
        min: 0,
        max: gridSize,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '5%',
        inRange: {
          color: this.gradientColors
        }
      },
      series: [{
        name: '监测密度',
        type: 'heatmap',
        data: heatmapData,
        label: {
          show: false
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }]
    };

    this.setOption(option, true);
  }

  generateHeatmapGrid(processedData, gridSize, lngRange, latRange) {
    const heatmapData = [];
    const lngStep = (lngRange.max - lngRange.min) / gridSize;
    const latStep = (latRange.max - latRange.min) / gridSize;

    const grid = {};
    
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const key = `${i}-${j}`;
        grid[key] = {
          i,
          j,
          values: [],
          count: 0
        };
      }
    }

    for (const station of processedData) {
      const i = Math.min(gridSize - 1, Math.floor((station.lng - lngRange.min) / lngStep));
      const j = Math.min(gridSize - 1, Math.floor((station.lat - latRange.min) / latStep));
      const key = `${i}-${j}`;
      
      if (grid[key]) {
        grid[key].values.push(station.mean);
        grid[key].count += station.count;
      }
    }

    for (const cell of Object.values(grid)) {
      const avgLng = lngRange.min + (cell.i + 0.5) * lngStep;
      const avgLat = latRange.min + (cell.j + 0.5) * latStep;
      const value = cell.values.length > 0 ? cell.values.reduce((a, b) => a + b, 0) / cell.values.length : 0;
      
      heatmapData.push([cell.i, cell.j, value, {
        lng: avgLng,
        lat: avgLat,
        count: cell.count,
        stationCount: cell.values.length
      }]);
    }

    return heatmapData;
  }

  renderZoneComparison(stationData, metricField = 'runoff_value') {
    if (!stationData || stationData.length === 0) {
      this.renderEmptyState('暂无数据');
      return;
    }

    const zoneData = this.aggregateByZone(stationData, metricField);
    
    const option = {
      title: {
        text: '流域分区监测对比',
        left: 'center',
        top: 10
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      legend: {
        data: ['平均值', '最大值', '最小值'],
        top: 40
      },
      grid: {
        left: '5%',
        right: '5%',
        top: '20%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: zoneData.map(z => z.name)
      },
      yAxis: {
        type: 'value',
        name: this.getMetricName(metricField)
      },
      series: [
        {
          name: '平均值',
          type: 'bar',
          data: zoneData.map(z => z.mean.toFixed(3)),
          itemStyle: {
            color: (params) => WATERSHED_ZONES[params.dataIndex]?.color || '#5470c6'
          }
        },
        {
          name: '最大值',
          type: 'line',
          data: zoneData.map(z => z.max.toFixed(3)),
          lineStyle: {
            type: 'dashed'
          },
          itemStyle: {
            color: '#ee6666'
          }
        },
        {
          name: '最小值',
          type: 'line',
          data: zoneData.map(z => z.min.toFixed(3)),
          lineStyle: {
            type: 'dashed'
          },
          itemStyle: {
            color: '#91cc75'
          }
        }
      ]
    };

    this.setOption(option, true);
  }

  aggregateByZone(stationData, metricField) {
    const zoneMap = new Map();
    
    for (const zone of WATERSHED_ZONES) {
      zoneMap.set(zone.id, {
        id: zone.id,
        name: zone.name,
        color: zone.color,
        values: []
      });
    }

    for (const data of stationData) {
      const station = MONITORING_STATIONS.find(s => s.id === data.station_id);
      if (station && data[metricField] !== null && data[metricField] !== undefined) {
        const zone = zoneMap.get(station.zoneId);
        if (zone) {
          const value = Number(data[metricField]);
          if (!isNaN(value) && value >= 0) {
            zone.values.push(value);
          }
        }
      }
    }

    const result = [];
    for (const zone of zoneMap.values()) {
      if (zone.values.length > 0) {
        result.push({
          ...zone,
          mean: zone.values.reduce((a, b) => a + b, 0) / zone.values.length,
          max: Math.max(...zone.values),
          min: Math.min(...zone.values),
          count: zone.values.length
        });
      }
    }

    return result;
  }

  getStationTypeName(type) {
    const typeNames = {
      'runoff': '径流量站',
      'water_level': '水位站',
      'multi': '综合监测站',
      'water_quality': '水质站',
      'ecology': '生态站'
    };
    return typeNames[type] || type;
  }

  getMetricName(field) {
    const metricNames = {
      'runoff_value': '径流量 (m³/s)',
      'water_level': '水位 (m)',
      'velocity': '流速 (m/s)',
      'rainfall_value': '降雨量 (mm)'
    };
    return metricNames[field] || field;
  }
}

export default StationHeatmapChart;
