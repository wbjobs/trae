import crypto from 'crypto';
import fs from 'fs-extra';
import { Transform } from 'stream';
import type { EncryptionConfig } from '../shared/types';

const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_MAGIC = Buffer.from([0x53, 0x59, 0x4E, 0x43]);

function deriveKey(key: string): Buffer {
  return crypto.scryptSync(key, 'file-sync-salt', KEY_LENGTH);
}

export function generateKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function encryptBuffer(buffer: Buffer, config: EncryptionConfig): Buffer {
  if (!config.enabled || !config.key) {
    return buffer;
  }

  const key = deriveKey(config.key);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  let cipher: crypto.Cipher;
  let encrypted: Buffer;

  if (config.algorithm === 'aes-256-gcm') {
    cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([ENCRYPTED_MAGIC, Buffer.from([0x01]), iv, authTag, encrypted]);
  } else {
    cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return Buffer.concat([ENCRYPTED_MAGIC, Buffer.from([0x00]), iv, encrypted]);
  }
}

export function decryptBuffer(buffer: Buffer, config: EncryptionConfig): Buffer {
  if (!config.enabled || !config.key) {
    return buffer;
  }

  if (buffer.length < ENCRYPTED_MAGIC.length + 1 + IV_LENGTH) {
    return buffer;
  }

  if (!buffer.slice(0, 4).equals(ENCRYPTED_MAGIC)) {
    return buffer;
  }

  const key = deriveKey(config.key);
  const algorithmFlag = buffer[4];
  const iv = buffer.slice(5, 5 + IV_LENGTH);
  
  let offset = 5 + IV_LENGTH;
  
  let decipher: crypto.Decipher;

  if (algorithmFlag === 0x01) {
    if (buffer.length < offset + AUTH_TAG_LENGTH) {
      throw new Error('Invalid encrypted file');
    }
    const authTag = buffer.slice(offset, offset + AUTH_TAG_LENGTH);
    offset += AUTH_TAG_LENGTH;
    const encrypted = buffer.slice(offset);
    
    decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    (decipher as crypto.DecipherGCM).setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } else {
    const encrypted = buffer.slice(offset);
    decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}

export function isEncrypted(buffer: Buffer): boolean {
  if (buffer.length < ENCRYPTED_MAGIC.length) {
    return false;
  }
  return buffer.slice(0, 4).equals(ENCRYPTED_MAGIC);
}

export function createEncryptionTransform(config: EncryptionConfig): Transform | null {
  if (!config.enabled || !config.key) {
    return null;
  }

  const key = deriveKey(config.key);
  const iv = crypto.randomBytes(IV_LENGTH);
  let headerWritten = false;
  
  let cipher: crypto.Cipher;
  let authTag: Buffer | null = null;

  if (config.algorithm === 'aes-256-gcm') {
    cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    (cipher as crypto.CipherGCM).on('end', () => {
      authTag = (cipher as crypto.CipherGCM).getAuthTag();
    });
    return new Transform({
      transform(chunk: Buffer, _encoding: string, callback: (error?: Error | null, data?: any) => void) {
        if (!headerWritten) {
          headerWritten = true;
          const header = Buffer.concat([
            ENCRYPTED_MAGIC,
            Buffer.from([0x01]),
            iv
          ]);
          this.push(header);
        }
        try {
          const encrypted = cipher.update(chunk);
          callback(null, encrypted);
        } catch (err: any) {
          callback(err);
        }
      },
      flush(callback: (error?: Error | null, data?: any) => void) {
        try {
          const final = cipher.final();
          if (authTag) {
            callback(null, Buffer.concat([authTag, final]));
          } else {
            callback(null, final);
          }
        } catch (err: any) {
          callback(err);
        }
      }
    });
  } else {
    cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    return new Transform({
      transform(chunk: Buffer, _encoding: string, callback: (error?: Error | null, data?: any) => void) {
        if (!headerWritten) {
          headerWritten = true;
          const header = Buffer.concat([
            ENCRYPTED_MAGIC,
            Buffer.from([0x00]),
            iv
          ]);
          this.push(header);
        }
        try {
          const encrypted = cipher.update(chunk);
          callback(null, encrypted);
        } catch (err: any) {
          callback(err);
        }
      },
      flush(callback: (error?: Error | null, data?: any) => void) {
        try {
          const final = cipher.final();
          callback(null, final);
        } catch (err: any) {
          callback(err);
        }
      }
    });
  }
}

export function createDecryptionTransform(config: EncryptionConfig): Transform | null {
  if (!config.enabled || !config.key) {
    return null;
  }

  const key = deriveKey(config.key);
  let headerRead = false;
  let algorithmFlag: number = 0;
  let iv: Buffer | null = null;
  let remainingHeader: Buffer = Buffer.alloc(0);
  
  let decipher: crypto.Decipher | null = null;

  return new Transform({
    transform(chunk: Buffer, _encoding: string, callback: (error?: Error | null, data?: any) => void) {
      if (!headerRead) {
        const data = Buffer.concat([remainingHeader, chunk]);
        const headerSize = 5 + IV_LENGTH;
        
        if (data.length < headerSize) {
          remainingHeader = data;
          callback();
          return;
        }

        if (!data.slice(0, 4).equals(ENCRYPTED_MAGIC)) {
          headerRead = true;
          this.push(chunk);
          callback();
          return;
        }

        algorithmFlag = data[4];
        iv = data.slice(5, headerSize);
        
        if (algorithmFlag === 0x01) {
          decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        } else {
          decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        }
        
        headerRead = true;
        const remaining = data.slice(headerSize);
        
        if (remaining.length > 0) {
          try {
            const decrypted = decipher.update(remaining);
            callback(null, decrypted);
          } catch (err: any) {
            callback(err);
          }
        } else {
          callback();
        }
      } else if (decipher) {
        try {
          const decrypted = decipher.update(chunk);
          callback(null, decrypted);
        } catch (err: any) {
          callback(err);
        }
      } else {
        callback(null, chunk);
      }
    },
    flush(callback: (error?: Error | null, data?: any) => void) {
      if (decipher) {
        try {
          const final = decipher.final();
          callback(null, final);
        } catch (err: any) {
          callback(err);
        }
      } else {
        callback();
      }
    }
  });
}

export async function encryptFile(inputPath: string, outputPath: string, config: EncryptionConfig): Promise<void> {
  if (!config.enabled || !config.key) {
    await fs.copy(inputPath, outputPath);
    return;
  }

  const inputStream = fs.createReadStream(inputPath);
  const outputStream = fs.createWriteStream(outputPath);
  const transform = createEncryptionTransform(config);

  if (transform) {
    inputStream.pipe(transform).pipe(outputStream);
  } else {
    inputStream.pipe(outputStream);
  }

  return new Promise((resolve, reject) => {
    outputStream.on('finish', resolve);
    inputStream.on('error', reject);
    outputStream.on('error', reject);
  });
}

export async function decryptFile(inputPath: string, outputPath: string, config: EncryptionConfig): Promise<void> {
  if (!config.enabled || !config.key) {
    await fs.copy(inputPath, outputPath);
    return;
  }

  const inputStream = fs.createReadStream(inputPath);
  const outputStream = fs.createWriteStream(outputPath);
  const transform = createDecryptionTransform(config);

  if (transform) {
    inputStream.pipe(transform).pipe(outputStream);
  } else {
    inputStream.pipe(outputStream);
  }

  return new Promise((resolve, reject) => {
    outputStream.on('finish', resolve);
    inputStream.on('error', reject);
    outputStream.on('error', reject);
  });
}
