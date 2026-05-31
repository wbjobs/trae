const HASH_TABLE_SIZE = 65536;
const MIN_MATCH = 4;
const MAX_DISTANCE = 65535;

function hash4(p, offset) {
  const v = p[offset] | (p[offset + 1] << 8) | (p[offset + 2] << 16) | (p[offset + 3] << 24);
  return (v * 2654435761) >>> 16;
}

function compressBound(inputSize) {
  return inputSize + Math.floor(inputSize / 255) + 16;
}

function compress(input) {
  if (!(input instanceof Buffer)) {
    input = Buffer.from(input);
  }

  const inputSize = input.length;
  if (inputSize < MIN_MATCH) {
    const output = Buffer.alloc(inputSize + 1);
    output[0] = inputSize << 4;
    input.copy(output, 1);
    return output;
  }

  const hashTable = new Int16Array(HASH_TABLE_SIZE);
  hashTable.fill(-1);

  const outputSize = compressBound(inputSize);
  const output = Buffer.alloc(outputSize);

  let ip = 0;
  const iend = inputSize;
  let anchor = 0;
  let op = 0;

  while (ip < iend - MIN_MATCH) {
    const h = hash4(input, ip);
    const cached = hashTable[h];
    hashTable[h] = ip;

    if (cached === -1 || ip - cached > MAX_DISTANCE) {
      ip++;
      continue;
    }

    let matchStart = cached;
    let matchFound = true;
    for (let i = 0; i < MIN_MATCH; i++) {
      if (input[matchStart + i] !== input[ip + i]) {
        matchFound = false;
        break;
      }
    }

    if (!matchFound) {
      ip++;
      continue;
    }

    const literalLen = ip - anchor;
    let matchLen = MIN_MATCH;

    while (ip + matchLen < iend && matchStart + matchLen < ip &&
           input[matchStart + matchLen] === input[ip + matchLen]) {
      matchLen++;
    }

    let token = (literalLen < 15 ? literalLen << 4 : 0xF0);
    token |= (matchLen - MIN_MATCH < 15 ? matchLen - MIN_MATCH : 0x0F);
    output[op++] = token;

    if (literalLen >= 15) {
      let v = literalLen - 15;
      while (v >= 255) {
        output[op++] = 0xFF;
        v -= 255;
      }
      output[op++] = v;
    }

    if (literalLen > 0) {
      input.copy(output, op, anchor, ip);
      op += literalLen;
    }

    const offset = ip - matchStart;
    output[op++] = offset & 0xFF;
    output[op++] = (offset >> 8) & 0xFF;

    if (matchLen - MIN_MATCH >= 15) {
      let v = matchLen - MIN_MATCH - 15;
      while (v >= 255) {
        output[op++] = 0xFF;
        v -= 255;
      }
      output[op++] = v;
    }

    ip += matchLen;
    anchor = ip;
  }

  const literalLen = iend - anchor;

  if (literalLen < 15) {
    output[op++] = literalLen << 4;
  } else {
    output[op++] = 0xF0;
    let v = literalLen - 15;
    while (v >= 255) {
      output[op++] = 0xFF;
      v -= 255;
    }
    output[op++] = v;
  }

  if (literalLen > 0) {
    input.copy(output, op, anchor, iend);
    op += literalLen;
  }

  return output.slice(0, op);
}

function decompress(input, outputSizeHint) {
  if (!(input instanceof Buffer)) {
    input = Buffer.from(input);
  }

  const inputSize = input.length;
  const outputSize = outputSizeHint || Math.max(inputSize * 100, 1024 * 1024);
  const output = Buffer.alloc(outputSize);

  let ip = 0;
  let op = 0;

  while (ip < inputSize) {
    const token = input[ip++];

    let literalLen = token >> 4;
    if (literalLen === 15) {
      let next;
      do {
        next = input[ip++];
        literalLen += next;
      } while (next === 0xFF);
    }

    if (literalLen > 0) {
      input.copy(output, op, ip, ip + literalLen);
      op += literalLen;
      ip += literalLen;
    }

    if (ip >= inputSize) break;

    const offset = input[ip] | (input[ip + 1] << 8);
    ip += 2;

    let matchLen = (token & 0x0F) + MIN_MATCH;
    if (matchLen === 15 + MIN_MATCH) {
      let next;
      do {
        next = input[ip++];
        matchLen += next;
      } while (next === 0xFF);
    }

    if (offset === 0 || offset > op) {
      throw new Error('Invalid offset in compressed data');
    }

    if (offset === 1) {
      const v = output[op - 1];
      output.fill(v, op, op + matchLen);
    } else if (offset >= matchLen) {
      output.copy(output, op, op - offset, op - offset + matchLen);
    } else {
      for (let i = 0; i < matchLen; i++) {
        output[op + i] = output[op - offset + i];
      }
    }
    op += matchLen;
  }

  return output.slice(0, op);
}

const MAGIC_BLOCK = 0x4B434C42;
const MAGIC_END = 0x42444E45;
const BLOCK_HEADER_SIZE = 12;
const END_MARKER_SIZE = 4;

function writeBlockHeader(output, offset, uncompressedSize, compressedSize) {
  output.writeUInt32LE(MAGIC_BLOCK, offset);
  output.writeUInt32LE(uncompressedSize, offset + 4);
  output.writeUInt32LE(compressedSize, offset + 8);
  return BLOCK_HEADER_SIZE;
}

function writeEndMarker(output, offset) {
  output.writeUInt32LE(MAGIC_END, offset);
  return END_MARKER_SIZE;
}

function readBlockHeader(input, offset) {
  if (offset + 4 > input.length) return null;
  const magic = input.readUInt32LE(offset);
  
  if (magic === MAGIC_END) {
    return { type: 'end', headerSize: END_MARKER_SIZE };
  }
  
  if (magic !== MAGIC_BLOCK) return null;
  if (offset + BLOCK_HEADER_SIZE > input.length) return null;
  
  const uncompressedSize = input.readUInt32LE(offset + 4);
  const compressedSize = input.readUInt32LE(offset + 8);
  
  return {
    type: 'block',
    headerSize: BLOCK_HEADER_SIZE,
    uncompressedSize,
    compressedSize
  };
}

async function* compressStream(inputStream, chunkSize = 1024 * 1024) {
  let leftover = Buffer.alloc(0);
  
  for await (const chunk of inputStream) {
    leftover = Buffer.concat([leftover, chunk]);
    
    while (leftover.length >= chunkSize) {
      const block = leftover.slice(0, chunkSize);
      leftover = leftover.slice(chunkSize);
      
      const compressed = compress(block);
      const header = Buffer.alloc(BLOCK_HEADER_SIZE);
      writeBlockHeader(header, 0, block.length, compressed.length);
      
      yield Buffer.concat([header, compressed]);
    }
  }
  
  if (leftover.length > 0) {
    const compressed = compress(leftover);
    const header = Buffer.alloc(BLOCK_HEADER_SIZE);
    writeBlockHeader(header, 0, leftover.length, compressed.length);
    yield Buffer.concat([header, compressed]);
  }
  
  const endMarker = Buffer.alloc(END_MARKER_SIZE);
  writeEndMarker(endMarker, 0);
  yield endMarker;
}

async function* decompressStream(inputStream) {
  let leftover = Buffer.alloc(0);
  let ended = false;
  
  for await (const chunk of inputStream) {
    leftover = Buffer.concat([leftover, chunk]);
    
    while (!ended && leftover.length >= 4) {
      const header = readBlockHeader(leftover, 0);
      
      if (!header) {
        break;
      }
      
      if (header.type === 'end') {
        ended = true;
        leftover = leftover.slice(header.headerSize);
        break;
      }
      
      const totalBlockSize = header.headerSize + header.compressedSize;
      if (leftover.length < totalBlockSize) {
        break;
      }
      
      const compressedBlock = leftover.slice(header.headerSize, totalBlockSize);
      leftover = leftover.slice(totalBlockSize);
      
      const decompressed = decompress(compressedBlock, header.uncompressedSize);
      yield decompressed;
    }
  }
}

async function compressBuffer(input, chunkSize = 1024 * 1024) {
  const chunks = [];
  let offset = 0;
  
  while (offset < input.length) {
    const blockSize = Math.min(chunkSize, input.length - offset);
    const block = input.slice(offset, offset + blockSize);
    offset += blockSize;
    
    const compressed = compress(block);
    const header = Buffer.alloc(BLOCK_HEADER_SIZE);
    writeBlockHeader(header, 0, block.length, compressed.length);
    chunks.push(header, compressed);
  }
  
  const endMarker = Buffer.alloc(END_MARKER_SIZE);
  writeEndMarker(endMarker, 0);
  chunks.push(endMarker);
  
  return Buffer.concat(chunks);
}

async function decompressBuffer(input) {
  const chunks = [];
  let offset = 0;
  
  while (offset < input.length) {
    const header = readBlockHeader(input, offset);
    
    if (!header) {
      throw new Error('Invalid block header at offset ' + offset);
    }
    
    if (header.type === 'end') {
      break;
    }
    
    const compressedBlock = input.slice(offset + header.headerSize, offset + header.headerSize + header.compressedSize);
    offset += header.headerSize + header.compressedSize;
    
    const decompressed = decompress(compressedBlock, header.uncompressedSize);
    chunks.push(decompressed);
  }
  
  return Buffer.concat(chunks);
}

module.exports = {
  compress,
  decompress,
  compressBound,
  compressStream,
  decompressStream,
  compressBuffer,
  decompressBuffer,
  BLOCK_HEADER_SIZE,
  END_MARKER_SIZE
};
