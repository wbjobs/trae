const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const logger = require('./logger');
const redis = require('./redis');
const database = require('./database');

class KeyGenerator {
  constructor() {
    this.cacheTTL = 3600;
  }

  generateRandomKey(length = 64) {
    return crypto.randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }

  generateSecureKey(prefix = 'ak') {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(24).toString('base64url');
    const hash = crypto.createHash('sha256')
      .update(`${prefix}-${timestamp}-${random}-${config.server.nodeId}`)
      .digest('base64url')
      .substring(0, 32);
    return `${prefix}_${timestamp}_${random}_${hash}`;
  }

  async createKey(keyData, transaction = null) {
    const {
      name,
      level = 1,
      expireDays = config.key.expireDays,
      createdBy = 'system',
      metadata = {}
    } = keyData;

    const key = this.generateSecureKey('ak');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expireDays * 24 * 60 * 60 * 1000);

    const APIKey = database.getModel('APIKey');
    const KeyLifecycleLog = database.getModel('KeyLifecycleLog');

    const options = transaction ? { transaction } : {};

    const newKey = await APIKey.create({
      id: uuidv4(),
      key,
      name,
      level,
      status: 1,
      createdAt: now,
      expiresAt,
      createdBy,
      metadata
    }, options);

    await KeyLifecycleLog.create({
      keyId: newKey.id,
      action: 'CREATE',
      nodeId: config.server.nodeId,
      timestamp: now,
      details: {
        name,
        level,
        expireDays,
        expiresAt: expiresAt.toISOString()
      }
    }, options);

    logger.KEY_GENERATION.info('密钥创建成功', {
      keyId: newKey.id,
      keyName: name,
      level,
      expiresAt: expiresAt.toISOString()
    });

    await this._cacheKey(newKey);

    return newKey.toJSON();
  }

  async getKey(keyId) {
    let keyData = await redis.get(`key:${keyId}`);
    if (keyData) {
      return keyData;
    }

    const APIKey = database.getModel('APIKey');
    const key = await APIKey.findByPk(keyId);
    if (key) {
      keyData = key.toJSON();
      await this._cacheKey(keyData);
      return keyData;
    }

    return null;
  }

  async getKeyByKey(key) {
    let keyData = await redis.get(`key_by_key:${key}`);
    if (keyData) {
      return keyData;
    }

    const APIKey = database.getModel('APIKey');
    const keyRecord = await APIKey.findOne({ where: { key } });
    if (keyRecord) {
      keyData = keyRecord.toJSON();
      await this._cacheKey(keyData);
      return keyData;
    }

    return null;
  }

  async listKeys(options = {}) {
    const {
      status = null,
      level = null,
      limit = 100,
      offset = 0
    } = options;

    const APIKey = database.getModel('APIKey');
    const where = {};
    if (status !== null) where.status = status;
    if (level !== null) where.level = level;

    const { count, rows } = await APIKey.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    return {
      total: count,
      items: rows.map(r => r.toJSON())
    };
  }

  async updateKey(keyId, updates) {
    const APIKey = database.getModel('APIKey');
    const KeyLifecycleLog = database.getModel('KeyLifecycleLog');

    const key = await APIKey.findByPk(keyId);
    if (!key) {
      throw new Error('密钥不存在');
    }

    const allowedUpdates = ['name', 'level', 'metadata'];
    const updateData = {};
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });

    await key.update(updateData);
    const updatedKey = key.toJSON();

    await KeyLifecycleLog.create({
      keyId,
      action: 'UPDATE',
      nodeId: config.server.nodeId,
      timestamp: new Date(),
      details: updateData
    });

    await redis.del(`key:${keyId}`);
    await redis.del(`key_by_key:${updatedKey.key}`);

    logger.KEY_GENERATION.info('密钥更新成功', { keyId, updates: updateData });

    return updatedKey;
  }

  async revokeKey(keyId, reason = 'manual_revocation') {
    const APIKey = database.getModel('APIKey');
    const KeyLifecycleLog = database.getModel('KeyLifecycleLog');

    const key = await APIKey.findByPk(keyId);
    if (!key) {
      throw new Error('密钥不存在');
    }

    await key.update({ status: 0 });
    const revokedKey = key.toJSON();

    await KeyLifecycleLog.create({
      keyId,
      action: 'REVOKE',
      nodeId: config.server.nodeId,
      timestamp: new Date(),
      details: { reason }
    });

    await redis.del(`key:${keyId}`);
    await redis.del(`key_by_key:${revokedKey.key}`);
    await redis.set(`key_revoked:${revokedKey.key}`, { revokedAt: new Date().toISOString(), reason }, 86400);

    logger.KEY_GENERATION.info('密钥已吊销', { keyId, keyName: revokedKey.name, reason });

    return revokedKey;
  }

  async rotateKey(keyId) {
    const APIKey = database.getModel('APIKey');

    const oldKey = await APIKey.findByPk(keyId);
    if (!oldKey) {
      throw new Error('密钥不存在');
    }

    return database.transaction(async (t) => {
      const newKeyData = await this.createKey({
        name: `${oldKey.name} (已轮换)`,
        level: oldKey.level,
        createdBy: 'rotation_system',
        metadata: {
          ...oldKey.metadata,
          rotatedFrom: oldKey.id
        }
      }, t);

      await oldKey.update({
        status: 2,
        rotatedAt: new Date(),
        previousKeyId: newKeyData.id
      }, { transaction: t });

      await redis.del(`key:${oldKey.id}`);
      await redis.del(`key_by_key:${oldKey.key}`);

      logger.KEY_GENERATION.info('密钥轮换完成', {
        oldKeyId: oldKey.id,
        newKeyId: newKeyData.id
      });

      return {
        oldKey: oldKey.toJSON(),
        newKey: newKeyData
      };
    });
  }

  async _cacheKey(keyData) {
    await redis.set(`key:${keyData.id}`, keyData, this.cacheTTL);
    await redis.set(`key_by_key:${keyData.key}`, keyData, this.cacheTTL);
  }

  async bulkCreate(count, options = {}) {
    const {
      prefix = 'batch',
      level = 1,
      expireDays = config.key.expireDays
    } = options;

    const keys = [];
    for (let i = 0; i < count; i++) {
      const key = await this.createKey({
        name: `${prefix}-${i + 1}`,
        level,
        expireDays
      });
      keys.push(key);
    }

    return keys;
  }

  async getKeyLifecycleLogs(keyId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    const KeyLifecycleLog = database.getModel('KeyLifecycleLog');

    const { count, rows } = await KeyLifecycleLog.findAndCountAll({
      where: { keyId },
      limit,
      offset,
      order: [['timestamp', 'DESC']]
    });

    return {
      total: count,
      items: rows.map(r => r.toJSON())
    };
  }

  async deleteKey(keyId) {
    const APIKey = database.getModel('APIKey');
    const KeyLifecycleLog = database.getModel('KeyLifecycleLog');

    const key = await APIKey.findByPk(keyId);
    if (!key) {
      throw new Error('密钥不存在');
    }

    const keyData = key.toJSON();

    await database.transaction(async (t) => {
      await KeyLifecycleLog.destroy({
        where: { keyId },
        transaction: t
      });

      await key.destroy({ transaction: t });
    });

    await this._clearKeyCache(keyData);

    logger.KEY_GENERATION.info('密钥已删除', {
      keyId,
      keyName: keyData.name
    });

    return true;
  }

  async bulkDelete(keyIds) {
    if (!Array.isArray(keyIds) || keyIds.length === 0) {
      throw new Error('密钥ID列表不能为空');
    }

    const APIKey = database.getModel('APIKey');
    const KeyLifecycleLog = database.getModel('KeyLifecycleLog');

    const results = {
      success: [],
      failed: [],
      total: keyIds.length
    };

    const keys = await APIKey.findAll({
      where: { id: keyIds },
      attributes: ['id', 'key', 'name']
    });

    const foundIds = keys.map(k => k.id);
    const notFoundIds = keyIds.filter(id => !foundIds.includes(id));

    for (const id of notFoundIds) {
      results.failed.push({ keyId: id, reason: 'KEY_NOT_FOUND' });
    }

    for (const key of keys) {
      try {
        await database.transaction(async (t) => {
          await KeyLifecycleLog.destroy({
            where: { keyId: key.id },
            transaction: t
          });

          await key.destroy({ transaction: t });
        });

        await this._clearKeyCache(key.toJSON());

        results.success.push({
          keyId: key.id,
          keyName: key.name
        });

        logger.KEY_GENERATION.info('批量删除密钥成功', {
          keyId: key.id,
          keyName: key.name
        });
      } catch (error) {
        results.failed.push({
          keyId: key.id,
          reason: error.message
        });

        logger.KEY_GENERATION.error('批量删除密钥失败', {
          keyId: key.id,
          error: error.message
        });
      }
    }

    return results;
  }

  async _clearKeyCache(keyData) {
    await redis.del(`key:${keyData.id}`);
    await redis.del(`key_by_key:${keyData.key}`);
    await redis.del(`key_revoked:${keyData.key}`);
  }
}

module.exports = new KeyGenerator();
