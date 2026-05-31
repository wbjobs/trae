const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

function generateRandomKey(length = 64) {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

function generateSecureKey(prefix = 'ak', nodeId = 'unknown') {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(24).toString('base64url');
  const hash = crypto.createHash('sha256')
    .update(`${prefix}-${timestamp}-${random}-${nodeId}`)
    .digest('base64url')
    .substring(0, 32);
  return `${prefix}_${timestamp}_${random}_${hash}`;
}

function generateId() {
  return uuidv4();
}

function hash(text, algorithm = 'sha256') {
  return crypto.createHash(algorithm).update(text).digest('hex');
}

function hmac(text, secret, algorithm = 'sha256') {
  return crypto.createHmac(algorithm, secret).update(text).digest('hex');
}

function generateSalt(length = 16) {
  return crypto.randomBytes(length).toString('hex');
}

function timingSafeEqual(a, b) {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch (error) {
    return false;
  }
}

function maskKey(key, showFirst = 4, showLast = 4) {
  if (!key || key.length <= showFirst + showLast) {
    return '***';
  }
  return `${key.substring(0, showFirst)}***${key.substring(key.length - showLast)}`;
}

module.exports = {
  generateRandomKey,
  generateSecureKey,
  generateId,
  hash,
  hmac,
  generateSalt,
  timingSafeEqual,
  maskKey
};
