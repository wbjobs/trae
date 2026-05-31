const { Sequelize, DataTypes, Model } = require('sequelize');
const config = require('./config');
const logger = require('./logger');

class Database {
  constructor() {
    this.sequelize = null;
    this.models = {};
    this.connected = false;
  }

  async connect() {
    try {
      this.sequelize = new Sequelize(
        config.database.database,
        config.database.user,
        config.database.password,
        {
          host: config.database.host,
          port: config.database.port,
          dialect: config.database.dialect,
          pool: config.database.pool,
          logging: config.database.logging
        }
      );

      await this.sequelize.authenticate();
      this.connected = true;
      logger.info('数据库连接成功');

      this._initModels();
      await this._syncModels();

      return this;
    } catch (error) {
      logger.error('数据库连接失败', { error: error.message });
      throw error;
    }
  }

  _initModels() {
    const APIKey = this.sequelize.define('api_key', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      key: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      level: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '0-PUBLIC, 1-BASIC, 2-ADVANCED, 3-ADMIN'
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '0-禁用, 1-启用, 2-轮换中, 3-已过期'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      rotatedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      previousKeyId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'api_keys',
          key: 'id'
        }
      },
      createdBy: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true
      }
    }, {
      tableName: 'api_keys',
      timestamps: false,
      indexes: [
        { fields: ['key'] },
        { fields: ['status'] },
        { fields: ['level'] },
        { fields: ['expiresAt'] }
      ]
    });

    const KeyLifecycleLog = this.sequelize.define('key_lifecycle_log', {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
      },
      keyId: {
        type: DataTypes.UUID,
        allowNull: false
      },
      action: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'CREATE, ROTATE, EXPIRE, REVOKE, ENABLE, DISABLE'
      },
      nodeId: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      details: {
        type: DataTypes.JSON,
        allowNull: true
      },
      ip: {
        type: DataTypes.STRING(45),
        allowNull: true
      }
    }, {
      tableName: 'key_lifecycle_logs',
      timestamps: false,
      indexes: [
        { fields: ['keyId'] },
        { fields: ['action'] },
        { fields: ['nodeId'] },
        { fields: ['timestamp'] }
      ]
    });

    const GrayIPRule = this.sequelize.define('gray_ip_rule', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      ipRange: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      description: {
        type: DataTypes.STRING(200),
        allowNull: true
      },
      trafficPercent: {
        type: DataTypes.TINYINT,
        defaultValue: 100
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      }
    }, {
      tableName: 'gray_ip_rules',
      timestamps: false
    });

    const AuthLog = this.sequelize.define('auth_log', {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
      },
      keyId: {
        type: DataTypes.UUID,
        allowNull: true
      },
      key: {
        type: DataTypes.STRING(128),
        allowNull: true
      },
      ip: {
        type: DataTypes.STRING(45),
        allowNull: false
      },
      path: {
        type: DataTypes.STRING(500),
        allowNull: false
      },
      method: {
        type: DataTypes.STRING(10),
        allowNull: false
      },
      requiredLevel: {
        type: DataTypes.TINYINT,
        allowNull: true
      },
      keyLevel: {
        type: DataTypes.TINYINT,
        allowNull: true
      },
      success: {
        type: DataTypes.BOOLEAN,
        allowNull: false
      },
      failureReason: {
        type: DataTypes.STRING(200),
        allowNull: true
      },
      isGray: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      nodeId: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      responseTime: {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    }, {
      tableName: 'auth_logs',
      timestamps: false,
      indexes: [
        { fields: ['keyId'] },
        { fields: ['ip'] },
        { fields: ['success'] },
        { fields: ['timestamp'] }
      ]
    });

    const NodeStatus = this.sequelize.define('node_status', {
      nodeId: {
        type: DataTypes.STRING(50),
        primaryKey: true
      },
      host: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      port: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '0-离线, 1-在线, 2-选举中'
      },
      lastHeartbeat: {
        type: DataTypes.DATE,
        allowNull: false
      },
      startedAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      isMaster: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true
      }
    }, {
      tableName: 'node_status',
      timestamps: false
    });

    this.models = {
      APIKey,
      KeyLifecycleLog,
      GrayIPRule,
      AuthLog,
      NodeStatus
    };
  }

  async _syncModels() {
    try {
      await this.sequelize.sync({ alter: true });
      logger.info('数据库模型同步完成');
    } catch (error) {
      logger.error('数据库模型同步失败', { error: error.message });
      throw error;
    }
  }

  getModel(modelName) {
    return this.models[modelName];
  }

  async transaction(callback) {
    return this.sequelize.transaction(callback);
  }

  async disconnect() {
    if (this.sequelize) {
      await this.sequelize.close();
      this.connected = false;
    }
  }
}

module.exports = new Database();
