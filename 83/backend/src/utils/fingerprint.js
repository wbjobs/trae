const crypto = require('crypto');
const fs = require('fs-extra');
const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline);

const HASH_ALGORITHMS = ['sha256', 'sha512', 'md5'];
const DEFAULT_BLOCK_SIZE = 1024 * 1024;
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;

const generateFileHash = (buffer, algorithm = 'sha256') => {
  return crypto.createHash(algorithm).update(buffer).digest('hex');
};

const generateFileFingerprint = async (filePath, options = {}) => {
  const { 
    blockSize = DEFAULT_BLOCK_SIZE,
    algorithms = ['sha256'],
    includeMetadata = false 
  } = options;

  const stats = await fs.stat(filePath);
  
  if (stats.size > LARGE_FILE_THRESHOLD) {
    return generateLargeFileFingerprint(filePath, stats, options);
  }

  const fileBuffer = await fs.readFile(filePath);
  
  const hashes = {};
  algorithms.forEach(algo => {
    hashes[algo] = generateFileHash(fileBuffer, algo);
  });

  const blockHashes = [];
  const totalBlocks = Math.ceil(fileBuffer.length / blockSize);
  
  for (let i = 0; i < totalBlocks; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, fileBuffer.length);
    const block = fileBuffer.slice(start, end);
    blockHashes.push({
      index: i,
      start,
      end,
      hash: generateFileHash(block, 'sha256'),
    });
  }

  const combinedString = `${hashes.sha256}:${stats.size}:${stats.mtime.getTime()}:${blockHashes.length}`;
  const fingerprint = crypto.createHash('sha256').update(combinedString).digest('hex');

  return {
    fingerprint,
    hashes,
    fileSize: stats.size,
    lastModified: stats.mtime.toISOString(),
    blockCount: blockHashes.length,
    blockSize,
    blockHashes: options.includeBlockHashes ? blockHashes : undefined,
    metadata: includeMetadata ? {
      createdAt: stats.birthtime.toISOString(),
      inode: stats.ino,
      mode: stats.mode,
    } : undefined,
  };
};

const generateLargeFileFingerprint = async (filePath, stats, options = {}) => {
  const { 
    blockSize = DEFAULT_BLOCK_SIZE,
    algorithms = ['sha256'],
    includeMetadata = false 
  } = options;

  const hashInstances = {};
  algorithms.forEach(algo => {
    hashInstances[algo] = crypto.createHash(algo);
  });

  const blockHashes = [];
  let bytesRead = 0;
  let currentBlock = Buffer.alloc(0);
  let blockIndex = 0;

  const readStream = fs.createReadStream(filePath, { highWaterMark: blockSize });

  for await (const chunk of readStream) {
    algorithms.forEach(algo => {
      hashInstances[algo].update(chunk);
    });

    currentBlock = Buffer.concat([currentBlock, chunk]);
    
    while (currentBlock.length >= blockSize) {
      const block = currentBlock.slice(0, blockSize);
      currentBlock = currentBlock.slice(blockSize);
      
      blockHashes.push({
        index: blockIndex,
        start: blockIndex * blockSize,
        end: (blockIndex + 1) * blockSize,
        hash: generateFileHash(block, 'sha256'),
      });
      blockIndex++;
    }
    
    bytesRead += chunk.length;
  }

  if (currentBlock.length > 0) {
    blockHashes.push({
      index: blockIndex,
      start: blockIndex * blockSize,
      end: bytesRead,
      hash: generateFileHash(currentBlock, 'sha256'),
    });
  }

  const hashes = {};
  algorithms.forEach(algo => {
    hashes[algo] = hashInstances[algo].digest('hex');
  });

  const combinedString = `${hashes.sha256}:${stats.size}:${stats.mtime.getTime()}:${blockHashes.length}`;
  const fingerprint = crypto.createHash('sha256').update(combinedString).digest('hex');

  return {
    fingerprint,
    hashes,
    fileSize: stats.size,
    lastModified: stats.mtime.toISOString(),
    blockCount: blockHashes.length,
    blockSize,
    blockHashes: options.includeBlockHashes ? blockHashes : undefined,
    metadata: includeMetadata ? {
      createdAt: stats.birthtime.toISOString(),
      inode: stats.ino,
      mode: stats.mode,
    } : undefined,
  };
};

const verifyFileIntegrity = async (filePath, originalFingerprint, options = {}) => {
  const currentFingerprint = await generateFileFingerprint(filePath, options);
  
  const isIntact = currentFingerprint.fingerprint === originalFingerprint;
  
  const changes = [];
  if (!isIntact) {
    if (currentFingerprint.hashes.sha256 !== originalFingerprint.hashes?.sha256) {
      changes.push({ type: 'content', message: '文件内容已被修改' });
    }
    if (currentFingerprint.fileSize !== originalFingerprint.fileSize) {
      changes.push({ 
        type: 'size', 
        message: `文件大小已改变: ${originalFingerprint.fileSize} -> ${currentFingerprint.fileSize}` 
      });
    }
    
    if (originalFingerprint.blockHashes && currentFingerprint.blockHashes) {
      const modifiedBlocks = [];
      const maxBlocks = Math.max(currentFingerprint.blockHashes.length, originalFingerprint.blockHashes.length);
      
      for (let i = 0; i < maxBlocks; i++) {
        const origBlock = originalFingerprint.blockHashes[i];
        const currBlock = currentFingerprint.blockHashes[i];
        
        if (!origBlock) {
          modifiedBlocks.push({ index: i, type: 'added' });
        } else if (!currBlock) {
          modifiedBlocks.push({ index: i, type: 'removed' });
        } else if (origBlock.hash !== currBlock.hash) {
          modifiedBlocks.push({ index: i, type: 'modified' });
        }
      }
      
      if (modifiedBlocks.length > 0) {
        changes.push({ type: 'blocks', message: `检测到${modifiedBlocks.length}个数据块被修改`, modifiedBlocks });
      }
    }
  }

  return {
    isIntact,
    currentFingerprint,
    originalFingerprint,
    changes,
    verifiedAt: new Date().toISOString(),
  };
};

const generateTextFingerprint = (text) => {
  const hash256 = crypto.createHash('sha256').update(text).digest('hex');
  const hash512 = crypto.createHash('sha512').update(text).digest('hex');
  
  return {
    sha256: hash256,
    sha512: hash512,
    fingerprint: `${hash256.substring(0, 16)}${hash512.substring(0, 16)}`,
    length: text.length,
  };
};

module.exports = {
  generateFileHash,
  generateFileFingerprint,
  verifyFileIntegrity,
  generateTextFingerprint,
  HASH_ALGORITHMS,
};
