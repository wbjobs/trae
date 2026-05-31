const mysql = require('mysql2/promise');
const DataLoader = require('dataloader');
const config = require('../config');

class MySQLDataSource {
  constructor() {
    this.pool = mysql.createPool(config.mysql);
    this.userLoader = new DataLoader(this.batchGetUsers.bind(this));
    this.isConnected = false;
    this.connectionPromise = this.initializeConnection();
  }

  async initializeConnection() {
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      this.isConnected = true;
      console.log('[MySQL] Connected to database successfully');
      return true;
    } catch (error) {
      console.error('[MySQL] Connection failed:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  async batchGetUsers(ids) {
    try {
      if (!this.isConnected) {
        await this.connectionPromise;
      }
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await this.pool.query(
        `SELECT * FROM users WHERE id IN (${placeholders})`,
        ids
      );
      const userMap = new Map(rows.map(row => [row.id, this.transformUser(row)]));
      return ids.map(id => userMap.get(id) || null);
    } catch (error) {
      console.error('[MySQL] batchGetUsers error:', error.message);
      return ids.map(() => null);
    }
  }

  transformUser(row) {
    return {
      id: row.id.toString(),
      username: row.username,
      email: row.email,
      city: row.city,
      createdAt: row.created_at.toISOString()
    };
  }

  async getUserById(id) {
    try {
      if (!this.isConnected) {
        const connected = await this.connectionPromise;
        if (!connected) {
          console.warn('[MySQL] Falling back to mock user data');
          return this.getMockUser(id);
        }
      }
      return this.userLoader.load(id);
    } catch (error) {
      console.error('[MySQL] getUserById error:', error.message);
      return this.getMockUser(id);
    }
  }

  async getUsers({ limit = 10, offset = 0 } = {}) {
    try {
      if (!this.isConnected) {
        const connected = await this.connectionPromise;
        if (!connected) {
          console.warn('[MySQL] Falling back to mock users data');
          return this.getMockUsers(limit);
        }
      }
      const [rows] = await this.pool.query(
        'SELECT * FROM users ORDER BY id LIMIT ? OFFSET ?',
        [limit, offset]
      );
      return rows.map(row => this.transformUser(row));
    } catch (error) {
      console.error('[MySQL] getUsers error:', error.message);
      return this.getMockUsers(limit);
    }
  }

  async getUserByEmail(email) {
    try {
      if (!this.isConnected) {
        const connected = await this.connectionPromise;
        if (!connected) {
          return null;
        }
      }
      const [rows] = await this.pool.query(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );
      return rows.length > 0 ? this.transformUser(rows[0]) : null;
    } catch (error) {
      console.error('[MySQL] getUserByEmail error:', error.message);
      return null;
    }
  }

  getMockUser(id) {
    const mockCities = ['北京', '上海', '广州', '深圳', '杭州'];
    return {
      id: id.toString(),
      username: `user_${id}`,
      email: `user${id}@example.com`,
      city: mockCities[id % mockCities.length],
      createdAt: new Date().toISOString()
    };
  }

  getMockUsers(limit) {
    const users = [];
    for (let i = 1; i <= limit; i++) {
      users.push(this.getMockUser(i));
    }
    return users;
  }

  async close() {
    await this.pool.end();
    console.log('[MySQL] Connection pool closed');
  }
}

module.exports = MySQLDataSource;
