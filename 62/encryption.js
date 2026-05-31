const crypto = require('crypto');
const config = require('./config');
const logger = require('./logger');

class EncryptionManager {
  constructor() {
    this.masterKey = process.env.ENCRYPTION_MASTER_KEY || 'default_master_key_please_change_in_production';
    this.algorithms = {
      0: { algorithm: 'aes-128-cbc', keyLength: 16, ivLength: 16 },
      1: { algorithm: 'aes-192-cbc', keyLength: 24, ivLength: 16 },
      2: { algorithm: 'aes-256-cbc', keyLength: 32, ivLength: 16 },
      3: { algorithm: 'aes-256-gcm', keyLength: 32, ivLength: 12, authTagLength: 16 }
    };
    this.keyCache = new Map();
  }

  _deriveKey(level, salt) {
    const cacheKey = `${level}-${salt}`;
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey);
    }

    const config = this.algorithms[level] || this.algorithms[1];
    const derivedKey = crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      100000,
      config.keyLength,
      'sha256'
    );

    if (this.keyCache.size > 1000) {
      const firstKey = this.keyCache.keys().next().value;
      this.keyCache.delete(firstKey);
    }
    this.keyCache.set(cacheKey, derivedKey);

    return derivedKey;
  }

  encrypt(plaintext, level = 1) {
    try {
      const algoConfig = this.algorithms[level] || this.algorithms[1];
      const salt = crypto.randomBytes(16);
      const iv = crypto.randomBytes(algoConfig.ivLength);
      const key = this._deriveKey(level, salt);

      let cipher;
      if (algoConfig.authTagLength) {
        cipher = crypto.createCipheriv(algoConfig.algorithm, key, iv, {
          authTagLength: algoConfig.authTagLength
        });
      } else {
        cipher = crypto.createCipheriv(algoConfig.algorithm, key, iv);
      }

      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      const result = {
        v: 1,
        l: level,
        s: salt.toString('base64'),
        i: iv.toString('base64'),
        d: encrypted
      };

      if (algoConfig.authTagLength) {
        result.t = cipher.getAuthTag().toString('base64');
      }

      const encoded = Buffer.from(JSON.stringify(result)).toString('base64');
      return `ENC:${encoded}`;

    } catch (error) {
      logger.error('加密失败', { error: error.message, level });
      throw new Error('Encryption failed');
    }
  }

  decrypt(encryptedText) {
    try {
      if (!encryptedText || !encryptedText.startsWith('ENC:')) {
        return encryptedText;
      }

      const decoded = Buffer.from(encryptedText.substring(4), 'base64').toString('utf8');
      const data = JSON.parse(decoded);

      const algoConfig = this.algorithms[data.l] || this.algorithms[1];
      const salt = Buffer.from(data.s, 'base64');
      const iv = Buffer.from(data.i, 'base64');
      const key = this._deriveKey(data.l, salt);

      let decipher;
      if (algoConfig.authTagLength) {
        const authTag = Buffer.from(data.t, 'base64');
        decipher = crypto.createDecipheriv(algoConfig.algorithm, key, iv, {
          authTagLength: algoConfig.authTagLength
        });
        decipher.setAuthTag(authTag);
      } else {
        decipher = crypto.createDecipheriv(algoConfig.algorithm, key, iv);
      }

      let decrypted = decipher.update(data.d, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;

    } catch (error) {
      logger.error('解密失败', { error: error.message });
      throw new Error('Decryption failed');
    }
  }

  encryptKey(keyData) {
    const encryptedKey = this.encrypt(keyData.key, keyData.level || 1);
    return {
      ...keyData,
      key: encryptedKey,
      encrypted: true,
      encryptionLevel: keyData.level || 1
    };
  }

  decryptKey(keyData) {
    if (!keyData.encrypted || !keyData.key) {
      return keyData;
    }
    try {
      const decryptedKey = this.decrypt(keyData.key);
      return {
        ...keyData,
        key: decryptedKey,
        encrypted: false
      };
    } catch (error) {
      logger.warn('密钥解密失败，返回原始数据', { keyId: keyData.id });
      return keyData;
    }
  }

  hash(text, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(text).digest('hex');
  }

  hmac(text, secret) {
    return crypto.createHmac('sha256', secret).update(text).digest('hex');
  }

  generateSalt(length = 16) {
    return crypto.randomBytes(length).toString('hex');
  }

  compare(plaintext, encryptedText) {
    try {
      const decrypted = this.decrypt(encryptedText);
      return crypto.timingSafeEqual(
        Buffer.from(plaintext),
        Buffer.from(decrypted)
      );
    } catch (error) {
      return false;
    }
  }

  rotateMasterKey(newMasterKey) {
    logger.info('主密钥轮换已触发，请重新加密所有数据');
    this.masterKey = newMasterKey;
    this.keyCache.clear();
    return true;
  }

  getEncryptionLevel(level) {
    return this.algorithms[level] || this.algorithms[1];
  }
}

module.exports = new EncryptionManager();
