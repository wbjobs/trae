import { DataTypes } from 'sequelize'
import { getSequelize } from './index.js'

const DeviceLog = getSequelize().define('DeviceLog', {
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
  level: {
    type: DataTypes.STRING(20),
    defaultValue: 'info'
  },
  module: {
    type: DataTypes.STRING(50)
  },
  content: {
    type: DataTypes.TEXT
  },
  source: {
    type: DataTypes.STRING(50)
  },
  rawData: {
    type: DataTypes.JSON,
    field: 'raw_data'
  },
  createdAt: {
    type: DataTypes.DATE,
    field: 'created_at'
  }
}, {
  tableName: 'device_logs',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['device_id'] },
    { fields: ['level'] },
    { fields: ['created_at'] }
  ]
})

export { DeviceLog }
export default DeviceLog
