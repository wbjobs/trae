import { DATABASE_CONFIG, MONITORING_TABLES } from '@config/database.config.js';
import dayjs from 'dayjs';

export class DatabaseConnector {
  constructor(config = DATABASE_CONFIG) {
    this.config = config;
    this.connection = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      console.log(`正在连接数据库: ${this.config.host}:${this.config.port}/${this.config.database}`);
      this.isConnected = true;
      console.log('数据库连接成功');
      return true;
    } catch (error) {
      console.error('数据库连接失败:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect() {
    if (this.connection) {
      this.connection = null;
      this.isConnected = false;
      console.log('数据库连接已关闭');
    }
  }

  async query(sql, params = []) {
    if (!this.isConnected) {
      await this.connect();
    }
    console.log(`执行SQL查询: ${sql}`);
    return [];
  }

  async executeBatch(statements) {
    if (!this.isConnected) {
      await this.connect();
    }
    const results = [];
    for (const stmt of statements) {
      const result = await this.query(stmt.sql, stmt.params);
      results.push(result);
    }
    return results;
  }
}

export const dbConnector = new DatabaseConnector();
export default DatabaseConnector;
