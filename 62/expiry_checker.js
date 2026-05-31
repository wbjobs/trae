const { Op } = require('sequelize');
const config = require('./config');
const logger = require('./logger');
const redis = require('./redis');
const database = require('./database');
const keyGenerator = require('./key_generator');

class ExpiryChecker {
  constructor() {
    this.checkInterval = null;
    this.rotationInterval = null;
    this.isRunning = false;
    this.checkLockKey = 'expiry_check:lock';
    this.rotationLockKey = 'key_rotation:lock';
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.KEY_EXPIRY.info('过期校验模块已启动', {
      rotationInterval: config.key.rotationInterval,
      expireDays: config.key.expireDays,
      gracePeriodDays: config.key.gracePeriodDays
    });

    this.checkInterval = setInterval(
      () => this.runExpiryCheck(),
      60 * 60 * 1000
    );

    this.rotationInterval = setInterval(
      () => this.runAutoRotation(),
      config.key.rotationInterval
    );

    setTimeout(() => {
      this.runExpiryCheck();
      this.runAutoRotation();
    }, 5000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
    this.isRunning = false;
    logger.KEY_EXPIRY.info('过期校验模块已停止');
  }

  async runExpiryCheck() {
    const lockValue = await redis.acquireLock(this.checkLockKey, 300000);
    if (!lockValue) {
      logger.KEY_EXPIRY.debug('其他节点正在执行过期检查，跳过');
      return;
    }

    try {
      logger.KEY_EXPIRY.info('开始执行过期检查');
      const now = new Date();

      const expiredKeys = await this._findExpiredKeys(now);
      logger.KEY_EXPIRY.info(`发现 ${expiredKeys.length} 个已过期密钥`);

      for (const key of expiredKeys) {
        await this._processExpiredKey(key);
      }

      const nearExpiryKeys = await this._findNearExpiryKeys(now);
      logger.KEY_EXPIRY.info(`发现 ${nearExpiryKeys.length} 个即将过期密钥`);

      for (const key of nearExpiryKeys) {
        await this._sendExpiryWarning(key);
      }

      const rotatedKeys = await this._findRotatedKeys(now);
      logger.KEY_EXPIRY.info(`发现 ${rotatedKeys.length} 个轮换中密钥待清理`);

      for (const key of rotatedKeys) {
        await this._cleanupRotatedKey(key);
      }

    } catch (error) {
      logger.KEY_EXPIRY.error('过期检查执行失败', { error: error.message });
    } finally {
      await redis.releaseLock(this.checkLockKey, lockValue);
    }
  }

  async runAutoRotation() {
    const lockValue = await redis.acquireLock(this.rotationLockKey, 300000);
    if (!lockValue) {
      logger.KEY_ROTATION.debug('其他节点正在执行自动轮换，跳过');
      return;
    }

    try {
      logger.KEY_ROTATION.info('开始执行自动密钥轮换');
      const now = new Date();
      const rotationThreshold = new Date(
        now.getTime() + config.key.gracePeriodDays * 24 * 60 * 60 * 1000
      );

      const APIKey = database.getModel('APIKey');
      const keysToRotate = await APIKey.findAll({
        where: {
          status: 1,
          expiresAt: {
            [Op.lte]: rotationThreshold
          }
        },
        order: [['expiresAt', 'ASC']]
      });

      logger.KEY_ROTATION.info(`需要轮换的密钥数量: ${keysToRotate.length}`);

      const results = {
        success: [],
        failed: []
      };

      for (const key of keysToRotate) {
        try {
          const rotationResult = await keyGenerator.rotateKey(key.id);
          results.success.push({
            keyId: key.id,
            keyName: key.name,
            newKeyId: rotationResult.newKey.id
          });
          logger.KEY_ROTATION.info('密钥自动轮换成功', {
            keyId: key.id,
            keyName: key.name,
            newKeyId: rotationResult.newKey.id
          });
        } catch (error) {
          results.failed.push({
            keyId: key.id,
            keyName: key.name,
            error: error.message
          });
          logger.KEY_ROTATION.error('密钥自动轮换失败', {
            keyId: key.id,
            keyName: key.name,
            error: error.message
          });
        }
      }

      if (results.success.length > 0 || results.failed.length > 0) {
        logger.KEY_ROTATION.info('自动轮换执行完成', {
          successCount: results.success.length,
          failedCount: results.failed.length
        });
      }

      return results;

    } catch (error) {
      logger.KEY_ROTATION.error('自动轮换执行失败', { error: error.message });
      throw error;
    } finally {
      await redis.releaseLock(this.rotationLockKey, lockValue);
    }
  }

  async _findExpiredKeys(now) {
    const APIKey = database.getModel('APIKey');
    return APIKey.findAll({
      where: {
        status: {
          [Op.in]: [1, 2]
        },
        expiresAt: {
          [Op.lt]: now
        }
      }
    });
  }

  async _findNearExpiryKeys(now) {
    const warningThreshold = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000
    );
    const APIKey = database.getModel('APIKey');
    return APIKey.findAll({
      where: {
        status: 1,
        expiresAt: {
          [Op.between]: [now, warningThreshold]
        }
      }
    });
  }

  async _findRotatedKeys(now) {
    const cleanupThreshold = new Date(
      now.getTime() - config.key.gracePeriodDays * 24 * 60 * 60 * 1000
    );
    const APIKey = database.getModel('APIKey');
    return APIKey.findAll({
      where: {
        status: 2,
        rotatedAt: {
          [Op.lte]: cleanupThreshold
        }
      }
    });
  }

  async _processExpiredKey(key) {
    const KeyLifecycleLog = database.getModel('KeyLifecycleLog');

    try {
      await key.update({ status: 3 });

      await KeyLifecycleLog.create({
        keyId: key.id,
        action: 'EXPIRE',
        nodeId: config.server.nodeId,
        timestamp: new Date(),
        details: {
          expiredAt: key.expiresAt,
          level: key.level
        }
      });

      await redis.del(`key:${key.id}`);
      await redis.del(`key_by_key:${key.key}`);

      logger.KEY_EXPIRY.info('密钥已过期处理完成', {
        keyId: key.id,
        keyName: key.name,
        expiredAt: key.expiresAt
      });

      return true;
    } catch (error) {
      logger.KEY_EXPIRY.error('过期密钥处理失败', {
        keyId: key.id,
        error: error.message
      });
      return false;
    }
  }

  async _sendExpiryWarning(key) {
    const warningKey = `expiry_warning:${key.id}`;
    const alreadyWarned = await redis.get(warningKey);

    if (alreadyWarned) {
      return;
    }

    const daysRemaining = Math.ceil(
      (new Date(key.expiresAt) - new Date()) / (24 * 60 * 60 * 1000)
    );

    logger.KEY_EXPIRY.warn('密钥即将过期', {
      keyId: key.id,
      keyName: key.name,
      expiresAt: key.expiresAt,
      daysRemaining
    });

    await redis.set(warningKey, {
      warnedAt: new Date().toISOString(),
      daysRemaining
    }, 24 * 60 * 60);

    return {
      keyId: key.id,
      keyName: key.name,
      daysRemaining
    };
  }

  async _cleanupRotatedKey(key) {
    const KeyLifecycleLog = database.getModel('KeyLifecycleLog');

    try {
      await key.update({ status: 0 });

      await KeyLifecycleLog.create({
        keyId: key.id,
        action: 'CLEANUP',
        nodeId: config.server.nodeId,
        timestamp: new Date(),
        details: {
          rotatedAt: key.rotatedAt,
          newKeyId: key.previousKeyId
        }
      });

      await redis.del(`key:${key.id}`);
      await redis.del(`key_by_key:${key.key}`);

      logger.KEY_ROTATION.info('轮换密钥已清理', {
        keyId: key.id,
        keyName: key.name,
        rotatedAt: key.rotatedAt
      });

      return true;
    } catch (error) {
      logger.KEY_ROTATION.error('轮换密钥清理失败', {
        keyId: key.id,
        error: error.message
      });
      return false;
    }
  }

  async checkKeyValidity(key) {
    const keyData = await keyGenerator.getKeyByKey(key);

    if (!keyData) {
      const revoked = await redis.get(`key_revoked:${key}`);
      if (revoked) {
        return { valid: false, reason: 'KEY_REVOKED', details: revoked };
      }
      return { valid: false, reason: 'KEY_NOT_FOUND' };
    }

    if (keyData.status === 0) {
      return { valid: false, reason: 'KEY_DISABLED', key: keyData };
    }

    if (keyData.status === 3) {
      return { valid: false, reason: 'KEY_EXPIRED', key: keyData };
    }

    const now = new Date();
    const expiresAt = new Date(keyData.expiresAt);
    const gracePeriodEnd = new Date(
      expiresAt.getTime() + config.key.gracePeriodDays * 24 * 60 * 60 * 1000
    );

    const isExpired = expiresAt < now;
    const inGracePeriod = isExpired && now <= gracePeriodEnd;
    const pastGracePeriod = now > gracePeriodEnd;

    if (pastGracePeriod && keyData.status !== 2) {
      await this._processExpiredKey({
        ...keyData,
        update: async (data) => {
          const APIKey = database.getModel('APIKey');
          const record = await APIKey.findByPk(keyData.id);
          if (record) await record.update(data);
        }
      });
      return { valid: false, reason: 'KEY_EXPIRED', key: keyData };
    }

    const daysToExpiry = isExpired
      ? -Math.ceil((now - expiresAt) / (24 * 60 * 60 * 1000))
      : Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));

    return {
      valid: true,
      key: keyData,
      daysToExpiry,
      inGracePeriod,
      isExpired,
      pastGracePeriod,
      needsRotation: !inGracePeriod && (isExpired || daysToExpiry <= config.key.gracePeriodDays)
    };
  }

  async getExpiryStats() {
    const APIKey = database.getModel('APIKey');
    const now = new Date();
    const warningThreshold = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [total, active, expired, nearExpiry, rotated] = await Promise.all([
      APIKey.count(),
      APIKey.count({ where: { status: 1 } }),
      APIKey.count({ where: { status: 3 } }),
      APIKey.count({
        where: {
          status: 1,
          expiresAt: {
            [Op.between]: [now, warningThreshold]
          }
        }
      }),
      APIKey.count({ where: { status: 2 } })
    ]);

    return {
      total,
      active,
      expired,
      nearExpiry,
      rotated,
      timestamp: now.toISOString()
    };
  }

  async forceRotateKey(keyId) {
    const lockValue = await redis.acquireLock(`force_rotate:${keyId}`, 10000);
    if (!lockValue) {
      throw new Error('密钥正在轮换中，请稍后再试');
    }

    try {
      const result = await keyGenerator.rotateKey(keyId);
      return result;
    } finally {
      await redis.releaseLock(`force_rotate:${keyId}`, lockValue);
    }
  }
}

module.exports = new ExpiryChecker();
