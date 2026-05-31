export const DATABASE_CONFIG = {
  host: 'localhost',
  port: 5432,
  database: 'watershed_monitor',
  user: 'postgres',
  password: 'password',
  connectionTimeoutMillis: 30000,
  max: 20,
  idleTimeoutMillis: 30000
};

export const MONITORING_TABLES = {
  runoff: 't_runoff_data',
  rainfall: 't_rainfall_data',
  water_quality: 't_water_quality',
  stations: 't_monitoring_stations'
};
