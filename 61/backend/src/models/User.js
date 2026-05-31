import { DataTypes } from 'sequelize'
import { getSequelize } from './index.js'
import bcrypt from 'bcryptjs'

const User = getSequelize().define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
    set(value) {
      this.setDataValue('password', bcrypt.hashSync(value, 10))
    }
  },
  realName: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'real_name'
  },
  email: {
    type: DataTypes.STRING(100)
  },
  phone: {
    type: DataTypes.STRING(20)
  },
  role: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  factory: {
    type: DataTypes.STRING(50)
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1
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
  tableName: 'users',
  timestamps: true
})

User.prototype.comparePassword = function(password) {
  return bcrypt.compareSync(password, this.password)
}

export { User }
export default User
