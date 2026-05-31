import { DataTypes } from 'sequelize'
import { getSequelize } from './index.js'

const AuditLog = getSequelize().define('AuditLog', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    field: 'user_id'
  },
  username: {
    type: DataTypes.STRING(50)
  },
  action: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  module: {
    type: DataTypes.STRING(50)
  },
  target: {
    type: DataTypes.STRING(100)
  },
  description: {
    type: DataTypes.TEXT
  },
  ip: {
    type: DataTypes.STRING(50)
  },
  success: {
    type: DataTypes.TINYINT,
    defaultValue: 1
  },
  createdAt: {
    type: DataTypes.DATE,
    field: 'created_at'
  }
}, {
  tableName: 'audit_logs',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['username'] },
    { fields: ['action'] },
    { fields: ['created_at'] }
  ]
})

export { AuditLog }
export default AuditLog
