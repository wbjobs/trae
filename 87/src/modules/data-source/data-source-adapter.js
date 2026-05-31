import { runoffDataQuery } from './runoff-data-query.js';
import dayjs from 'dayjs';

export class DataSourceAdapter {
  constructor() {
    this.runoffQuery = runoffDataQuery;
    this.mockDataEnabled = true;
  }

  async fetchRunoffData(options = {}) {
    const {
      zoneId,
      stationId,
      startTime,
      endTime,
      granularity = 'daily',
      useMockData = this.mockDataEnabled
    } = options;

    if (useMockData) {
      return this.generateMockRunoffData(zoneId, stationId, startTime, endTime, granularity);
    }

    if (stationId) {
      return await this.runoffQuery.queryRunoffByStation(stationId, startTime, endTime, granularity);
    } else if (zoneId) {
      return await this.runoffQuery.queryRunoffByZone(zoneId, startTime, endTime, granularity);
    } else {
      return await this.runoffQuery.queryAllZonesRunoff(startTime, endTime, granularity);
    }
  }

  generateMockRunoffData(zoneId, stationId, startTime, endTime, granularity) {
    const start = dayjs(startTime || dayjs().subtract(1, 'year'));
    const end = dayjs(endTime || dayjs());
    
    const data = [];
    let current = start.clone();
    
    const baseFlow = this.getBaseFlowByZone(zoneId);
    const step = this.getStepByGranularity(granularity);
    
    let index = 0;
    while (current.isBefore(end) || current.isSame(end, 'day')) {
      const seasonalFactor = 1 + 0.6 * Math.sin((index / 365) * Math.PI * 2);
      const randomFactor = 0.8 + Math.random() * 0.4;
      
      const runoffValue = baseFlow * seasonalFactor * randomFactor;
      
      data.push({
        record_time: current.format('YYYY-MM-DD HH:mm:ss'),
        runoff_value: Number(runoffValue.toFixed(3)),
        water_level: Number((1.2 + runoffValue * 0.15).toFixed(2)),
        velocity: Number((0.5 + runoffValue * 0.08).toFixed(2)),
        station_id: stationId || 'ST001',
        quality_flag: Math.random() > 0.05 ? 'normal' : 'suspect'
      });
      
      current = current.add(step.value, step.unit);
      index++;
    }
    
    return data;
  }

  getBaseFlowByZone(zoneId) {
    const baseFlows = {
      'zone_a': 3.5,
      'zone_b': 8.2,
      'zone_c': 15.6,
      'zone_d': 25.0,
      'default': 10.0
    };
    return baseFlows[zoneId] || baseFlows.default;
  }

  getStepByGranularity(granularity) {
    const steps = {
      'raw': { value: 1, unit: 'hour' },
      'hourly': { value: 1, unit: 'hour' },
      'daily': { value: 1, unit: 'day' },
      'weekly': { value: 1, unit: 'week' },
      'monthly': { value: 1, unit: 'month' },
      'yearly': { value: 1, unit: 'year' }
    };
    return steps[granularity] || steps.daily;
  }

  async fetchMultipleZonesData(zoneIds, startTime, endTime, granularity = 'daily') {
    const results = [];
    for (const zoneId of zoneIds) {
      const data = await this.fetchRunoffData({ zoneId, startTime, endTime, granularity });
      results.push({ zoneId, data });
    }
    return results;
  }
}

export const dataSourceAdapter = new DataSourceAdapter();
export default DataSourceAdapter;
