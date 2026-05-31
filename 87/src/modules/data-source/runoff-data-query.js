import { dbConnector } from './database-connector.js';
import { MONITORING_TABLES } from '@config/database.config.js';
import dayjs from 'dayjs';

export class RunoffDataQuery {
  constructor() {
    this.db = dbConnector;
  }

  async queryRunoffByStation(stationId, startTime, endTime, granularity = 'daily') {
    const table = MONITORING_TABLES.runoff;
    const timeField = this.getTimeFieldByGranularity(granularity);
    
    const sql = `
      SELECT 
        ${timeField} as record_time,
        runoff_value,
        water_level,
        velocity,
        station_id,
        quality_flag
      FROM ${table}
      WHERE station_id = ?
        AND record_time BETWEEN ? AND ?
      ORDER BY record_time ASC
    `;
    
    const params = [stationId, startTime, endTime];
    return await this.db.query(sql, params);
  }

  async queryRunoffByZone(zoneId, startTime, endTime, granularity = 'daily') {
    const { getStationsByZone } = await import('@config/monitoring-stations.config.js');
    const stations = getStationsByZone(zoneId);
    const stationIds = stations.map(s => s.id);
    
    const table = MONITORING_TABLES.runoff;
    const placeholders = stationIds.map(() => '?').join(',');
    const timeField = this.getTimeFieldByGranularity(granularity);
    
    const sql = `
      SELECT 
        ${timeField} as record_time,
        station_id,
        AVG(runoff_value) as avg_runoff,
        MAX(runoff_value) as max_runoff,
        MIN(runoff_value) as min_runoff,
        SUM(runoff_value) as total_runoff
      FROM ${table}
      WHERE station_id IN (${placeholders})
        AND record_time BETWEEN ? AND ?
      GROUP BY ${timeField}, station_id
      ORDER BY record_time ASC
    `;
    
    const params = [...stationIds, startTime, endTime];
    return await this.db.query(sql, params);
  }

  async queryAllZonesRunoff(startTime, endTime, granularity = 'daily') {
    const { WATERSHED_ZONES } = await import('@config/watershed-zones.config.js');
    const results = [];
    
    for (const zone of WATERSHED_ZONES) {
      const zoneData = await this.queryRunoffByZone(zone.id, startTime, endTime, granularity);
      results.push({
        zoneId: zone.id,
        zoneName: zone.name,
        data: zoneData
      });
    }
    
    return results;
  }

  async queryLatestRunoff(stationIds = []) {
    const table = MONITORING_TABLES.runoff;
    let sql;
    let params = [];
    
    if (stationIds.length > 0) {
      const placeholders = stationIds.map(() => '?').join(',');
      sql = `
        SELECT DISTINCT ON (station_id)
          station_id,
          record_time,
          runoff_value,
          water_level
        FROM ${table}
        WHERE station_id IN (${placeholders})
        ORDER BY station_id, record_time DESC
      `;
      params = stationIds;
    } else {
      sql = `
        SELECT DISTINCT ON (station_id)
          station_id,
          record_time,
          runoff_value,
          water_level
        FROM ${table}
        ORDER BY station_id, record_time DESC
      `;
    }
    
    return await this.db.query(sql, params);
  }

  getTimeFieldByGranularity(granularity) {
    const timeFields = {
      'raw': 'record_time',
      'hourly': "date_trunc('hour', record_time)",
      'daily': "date_trunc('day', record_time)",
      'weekly': "date_trunc('week', record_time)",
      'monthly': "date_trunc('month', record_time)",
      'yearly': "date_trunc('year', record_time)"
    };
    return timeFields[granularity] || timeFields.daily;
  }
}

export const runoffDataQuery = new RunoffDataQuery();
export default RunoffDataQuery;
