import { DataTypes } from 'sequelize'
import { getSequelize } from './index.js'

const Factory = getSequelize().define('Factory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  address: {
    type: DataTypes.STRING(255)
  },
  contact: {
    type: DataTypes.STRING(50)
  },
  phone: {
    type: DataTypes.STRING(20)
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1
  },
  createdAt: {
    type: DataTypes.DATE,
    field: 'created_at'
  }
}, {
  tableName: 'factories',
  timestamps: true,
  updatedAt: false
})

export { Factory }
export default Factory
