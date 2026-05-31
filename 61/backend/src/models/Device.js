import { DataTypes } from 'sequelize'
import { getSequelize } from './index.js'

const Device = getSequelize().define('Device', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  deviceId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    field: 'device_id'
  },
  deviceName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'device_name'
  },
  factory: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  type: {
    type: DataTypes.STRING(50)
  },
  model: {
    type: DataTypes.STRING(50)
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'offline'
  },
  temperature: {
    type: DataTypes.DECIMAL(10, 2)
  },
  pressure: {
    type: DataTypes.DECIMAL(10, 2)
  },
  runtime: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  lastReport: {
    type: DataTypes.DATE,
    field: 'last_report'
  },
  lastHeartbeat: {
    type: DataTypes.DATE,
    field: 'last_heartbeat'
  },
  ipAddress: {
    type: DataTypes.STRING(50),
    field: 'ip_address'
  },
  createdAt: {
    type: DataTypes.DATE,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    field: 'updated_at'
  }
}, {
  tableName: 'devices',
  timestamps: true,
  indexes: [
    { fields: ['device_id'] },
    { fields: ['factory'] },
    { fields: ['status'] }
  ]
})

export { Device }
export default Device
