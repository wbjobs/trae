const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;
const CHUNK_SIZE = 64 * 1024 * 1024;

const keyCache = new Map();
const CACHE_TTL = 3600000;

const getEncryptionKey = () => {
  const cacheKey = 'master_key';
  const cached = keyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.key;
  }
  
  const key = process.env.ENCRYPTION_KEY || 'default-32-character-encryption-key';
  const derivedKey = crypto.scryptSync(key, 'secure-doc-salt', KEY_LENGTH);
  keyCache.set(cacheKey, { key: derivedKey, timestamp: Date.now() });
  return derivedKey;
};

const generateRandomKey = () => {
  return crypto.randomBytes(32).toString('hex');
};

const generateIV = () => {
  return crypto.randomBytes(IV_LENGTH);
};

const encryptBuffer = (buffer, key) => {
  const iv = generateIV();
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, Buffer.from(key, 'hex'), iv);
  
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  
  return Buffer.concat([iv, tag, encrypted]);
};

const decryptBuffer = (encryptedBuffer, key) => {
  try {
    const iv = encryptedBuffer.slice(0, IV_LENGTH);
    const tag = encryptedBuffer.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const data = encryptedBuffer.slice(IV_LENGTH + TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(key, 'hex'), iv);
    decipher.setAuthTag(tag);
    
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch (err) {
    throw new Error('解密失败，可能密钥不正确或数据已被篡改');
  }
};

const encryptFile = async (inputPath, outputPath, key) => {
  const stats = await fs.stat(inputPath);
  
  if (stats.size > LARGE_FILE_THRESHOLD) {
    return encryptLargeFileOptimized(inputPath, outputPath, key);
  }
  
  const inputBuffer = await fs.readFile(inputPath);
  const encryptedBuffer = encryptBuffer(inputBuffer, key);
  await fs.writeFile(outputPath, encryptedBuffer);
  return true;
};

const decryptFile = async (inputPath, outputPath, key) => {
  const stats = await fs.stat(inputPath);
  
  if (stats.size > LARGE_FILE_THRESHOLD + IV_LENGTH + TAG_LENGTH) {
    return decryptLargeFileOptimized(inputPath, outputPath, key);
  }
  
  const encryptedBuffer = await fs.readFile(inputPath);
  const decryptedBuffer = decryptBuffer(encryptedBuffer, key);
  await fs.writeFile(outputPath, decryptedBuffer);
  return true;
};

const encryptLargeFileOptimized = async (inputPath, outputPath, key) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: {
        operation: 'encrypt',
        inputPath,
        outputPath,
        key,
        chunkSize: CHUNK_SIZE,
      }
    });
    
    worker.on('message', (message) => {
      if (message.success) {
        resolve(true);
      } else {
        reject(new Error(message.error));
      }
    });
    
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
};

const decryptLargeFileOptimized = async (inputPath, outputPath, key) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: {
        operation: 'decrypt',
        inputPath,
        outputPath,
        key,
        chunkSize: CHUNK_SIZE,
      }
    });
    
    worker.on('message', (message) => {
      if (message.success) {
        resolve(true);
      } else {
        reject(new Error(message.error));
      }
    });
    
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
};

const encryptLargeFile = async (inputPath, outputPath, key) => {
  const iv = generateIV();
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, Buffer.from(key, 'hex'), iv);
  
  const readStream = fs.createReadStream(inputPath, { highWaterMark: CHUNK_SIZE });
  const writeStream = fs.createWriteStream(outputPath);
  
  await writeStream.write(iv);
  
  for await (const chunk of readStream) {
    const encryptedChunk = cipher.update(chunk);
    if (encryptedChunk.length > 0) {
      await writeStream.write(encryptedChunk);
    }
  }
  
  const finalChunk = cipher.final();
  if (finalChunk.length > 0) {
    await writeStream.write(finalChunk);
  }
  
  const tag = cipher.getAuthTag();
  await writeStream.write(tag);
  
  await new Promise((resolve, reject) => {
    writeStream.end((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  return true;
};

const decryptLargeFile = async (inputPath, outputPath, key) => {
  const stats = await fs.stat(inputPath);
  const totalSize = stats.size;
  
  const readStream = fs.createReadStream(inputPath, { highWaterMark: CHUNK_SIZE });
  const writeStream = fs.createWriteStream(outputPath);
  
  let iv = null;
  let buffer = Buffer.alloc(0);
  let tagRead = false;
  let decipher = null;
  let bytesProcessed = 0;
  const tagStart = totalSize - TAG_LENGTH;
  
  for await (const chunk of readStream) {
    buffer = Buffer.concat([buffer, chunk]);
    bytesProcessed += chunk.length;
    
    if (!iv && buffer.length >= IV_LENGTH) {
      iv = buffer.slice(0, IV_LENGTH);
      buffer = buffer.slice(IV_LENGTH);
      decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(key, 'hex'), iv);
    }
    
    if (decipher && bytesProcessed <= tagStart) {
      const toDecrypt = buffer.slice(0, buffer.length);
      buffer = Buffer.alloc(0);
      const decrypted = decipher.update(toDecrypt);
      if (decrypted.length > 0) {
        await writeStream.write(decrypted);
      }
    } else if (bytesProcessed > tagStart && !tagRead) {
      const tagDataEnd = buffer.length - TAG_LENGTH;
      if (tagDataEnd > 0) {
        const toDecrypt = buffer.slice(0, tagDataEnd);
        const decrypted = decipher.update(toDecrypt);
        if (decrypted.length > 0) {
          await writeStream.write(decrypted);
        }
      }
      tagRead = true;
    }
  }
  
  if (decipher) {
    try {
      const finalChunk = decipher.final();
      if (finalChunk.length > 0) {
        await writeStream.write(finalChunk);
      }
    } catch (err) {
      await new Promise((resolve, reject) => {
        writeStream.end(() => resolve());
      });
      throw new Error('解密失败，可能密钥不正确或数据已被篡改');
    }
  }
  
  await new Promise((resolve, reject) => {
    writeStream.end((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  return true;
};

const encryptText = (text, key) => {
  const iv = generateIV();
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, Buffer.from(key, 'hex'), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
};

const decryptText = (encryptedText, key) => {
  try {
    const [ivHex, tagHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(key, 'hex'), iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    throw new Error('文本解密失败');
  }
};

const hashFile = async (filePath, algorithm = 'sha256') => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
};

const hashBuffer = (buffer, algorithm = 'sha256') => {
  return crypto.createHash(algorithm).update(buffer).digest('hex');
};

const generateKeyPair = () => {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
};

const encryptWithPublicKey = (data, publicKey) => {
  return crypto.publicEncrypt(publicKey, Buffer.from(data)).toString('base64');
};

const decryptWithPrivateKey = (encryptedData, privateKey) => {
  return crypto.privateDecrypt(privateKey, Buffer.from(encryptedData, 'base64')).toString('utf8');
};

const benchmarkEncryption = async (sizeMB = 10) => {
  const testData = crypto.randomBytes(sizeMB * 1024 * 1024);
  const key = generateRandomKey();
  
  const encryptStart = Date.now();
  const encrypted = encryptBuffer(testData, key);
  const encryptTime = Date.now() - encryptStart;
  
  const decryptStart = Date.now();
  const decrypted = decryptBuffer(encrypted, key);
  const decryptTime = Date.now() - decryptStart;
  
  const speed = (sizeMB * 1000) / encryptTime;
  
  return {
    dataSizeMB: sizeMB,
    encryptTimeMs: encryptTime,
    decryptTimeMs: decryptTime,
    encryptSpeedMBps: speed.toFixed(2),
    decryptSpeedMBps: ((sizeMB * 1000) / decryptTime).toFixed(2),
  };
};

if (!isMainThread) {
  const { operation, inputPath, outputPath, key, chunkSize } = workerData;
  
  const processFile = async () => {
    try {
      if (operation === 'encrypt') {
        await encryptLargeFile(inputPath, outputPath, key);
      } else if (operation === 'decrypt') {
        await decryptLargeFile(inputPath, outputPath, key);
      }
      parentPort.postMessage({ success: true });
    } catch (error) {
      parentPort.postMessage({ success: false, error: error.message });
    }
  };
  
  processFile();
}

module.exports = {
  generateRandomKey,
  encryptBuffer,
  decryptBuffer,
  encryptFile,
  decryptFile,
  encryptText,
  decryptText,
  hashFile,
  hashBuffer,
  generateKeyPair,
  encryptWithPublicKey,
  decryptWithPrivateKey,
  benchmarkEncryption,
  LARGE_FILE_THRESHOLD,
  CHUNK_SIZE,
};
