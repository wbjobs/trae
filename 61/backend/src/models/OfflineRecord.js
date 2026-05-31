import { DataTypes } from 'sequelize'
import { getSequelize } from './index.js'

const OfflineRecord = getSequelize().define('OfflineRecord', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  deviceId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'device_id'
  },
  deviceName: {
    type: DataTypes.STRING(100),
    field: 'device_name'
  },
  factory: {
    type: DataTypes.STRING(50)
  },
  offlineTime: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'offline_time'
  },
  lastOnlineTime: {
    type: DataTypes.DATE,
    field: 'last_online_time'
  },
  offlineDuration: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'offline_duration'
  },
  lastHeartbeat: {
    type: DataTypes.DATE,
    field: 'last_heartbeat'
  },
  offlineReason: {
    type: DataTypes.STRING(255),
    field: 'offline_reason'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'offline'
  },
  analysisResult: {
    type: DataTypes.TEXT,
    field: 'analysis_result'
  },
  recoveredAt: {
    type: DataTypes.DATE,
    field: 'recovered_at'
  },
  createdAt: {
    type: DataTypes.DATE,
    field: 'created_at'
  }
}, {
  tableName: 'offline_records',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['device_id'] },
    { fields: ['status'] },
    { fields: ['offline_time'] }
  ]
})

export { OfflineRecord }
export default OfflineRecord
