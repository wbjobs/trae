const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const HMAC_ALGORITHM = 'sha256';
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const HMAC_LENGTH = 32;
const FILE_MAGIC = Buffer.from('ELEN');

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
}

function encryptNote(noteData, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  const jsonData = JSON.stringify(noteData);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(jsonData, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const hmac = crypto.createHmac(HMAC_ALGORITHM, key);
  hmac.update(Buffer.concat([salt, iv, encrypted]));
  const hmacDigest = hmac.digest();

  const fileBuffer = Buffer.concat([
    FILE_MAGIC,
    salt,
    iv,
    hmacDigest,
    encrypted
  ]);

  return fileBuffer;
}

function decryptNote(fileBuffer, password) {
  if (fileBuffer.length < FILE_MAGIC.length + SALT_LENGTH + IV_LENGTH + HMAC_LENGTH) {
    throw new Error('文件格式无效：文件太小');
  }

  const magic = fileBuffer.slice(0, FILE_MAGIC.length);
  if (!magic.equals(FILE_MAGIC)) {
    throw new Error('文件格式无效：不是有效的便签文件');
  }

  let offset = FILE_MAGIC.length;
  const salt = fileBuffer.slice(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;
  const iv = fileBuffer.slice(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const hmacDigest = fileBuffer.slice(offset, offset + HMAC_LENGTH);
  offset += HMAC_LENGTH;
  const encrypted = fileBuffer.slice(offset);

  const key = deriveKey(password, salt);

  const hmac = crypto.createHmac(HMAC_ALGORITHM, key);
  hmac.update(Buffer.concat([salt, iv, encrypted]));
  const computedHmac = hmac.digest();

  if (!computedHmac.equals(hmacDigest)) {
    throw new Error('文件完整性校验失败：文件可能已被篡改或密码错误');
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (e) {
    throw new Error('解密失败：密码错误或文件已损坏');
  }
}

module.exports = {
  encryptNote,
  decryptNote
};
