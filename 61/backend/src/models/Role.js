import { DataTypes } from 'sequelize'
import { getSequelize } from './index.js'

const Role = getSequelize().define('Role', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  type: {
    type: DataTypes.STRING(20),
    defaultValue: 'custom'
  },
  description: {
    type: DataTypes.STRING(255)
  },
  permissions: {
    type: DataTypes.TEXT,
    get() {
      const raw = this.getDataValue('permissions')
      return raw ? JSON.parse(raw) : []
    },
    set(value) {
      this.setDataValue('permissions', JSON.stringify(value))
    }
  },
  createdAt: {
    type: DataTypes.DATE,
    field: 'created_at'
  }
}, {
  tableName: 'roles',
  timestamps: true,
  updatedAt: false
})

export { Role }
export default Role
