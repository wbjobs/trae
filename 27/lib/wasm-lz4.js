const path = require('path');
const fs = require('fs');

let modulePromise = null;

const MAGIC_BLOCK = 0x4B434C42;
const MAGIC_END = 0x42444E45;
const BLOCK_HEADER_SIZE = 12;
const END_MARKER_SIZE = 4;

async function loadModule() {
  if (modulePromise) return modulePromise;
  
  modulePromise = new Promise((resolve, reject) => {
    try {
      const wasmPath = path.join(__dirname, '..', 'build', 'lz4.js');
      if (!fs.existsSync(wasmPath)) {
        reject(new Error('WASM module not found. Run `npm run build:wasm` first.'));
        return;
      }
      const Module = require(wasmPath);
      Module().then((instance) => {
        resolve({
          compressBound: instance.cwrap('wasm_lz4_compress_bound', 'number', ['number']),
          compress: instance.cwrap('wasm_lz4_compress', 'number', ['array', 'number', 'array', 'number']),
          decompress: instance.cwrap('wasm_lz4_decompress', 'number', ['array', 'number', 'array', 'number']),
          blockHeaderSize: instance.cwrap('wasm_lz4_block_header_size', 'number', []),
          endMarkerSize: instance.cwrap('wasm_lz4_end_marker_size', 'number', []),
          writeBlockHeader: instance.cwrap('wasm_lz4_write_block_header', 'number', ['array', 'number', 'number']),
          writeEndMarker: instance.cwrap('wasm_lz4_write_end_marker', 'number', ['array']),
          _malloc: instance._malloc,
          _free: instance._free,
          _instance: instance
        });
      }).catch(reject);
    } catch (e) {
      reject(e);
    }
  });
  
  return modulePromise;
}

async function compress(input) {
  if (!(input instanceof Buffer)) {
    input = Buffer.from(input);
  }
  
  const mod = await loadModule();
  const inputSize = input.length;
  const outputSize = mod.compressBound(inputSize);
  
  const inputPtr = mod._malloc(inputSize);
  const outputPtr = mod._malloc(outputSize);
  
  try {
    mod._instance.HEAPU8.set(input, inputPtr);
    const compressedSize = mod._instance._wasm_lz4_compress(inputPtr, inputSize, outputPtr, outputSize);
    
    if (compressedSize === 0) {
      throw new Error('Compression failed');
    }
    
    const result = Buffer.from(mod._instance.HEAPU8.slice(outputPtr, outputPtr + compressedSize));
    return result;
  } finally {
    mod._free(inputPtr);
    mod._free(outputPtr);
  }
}

async function decompress(input, outputSizeHint) {
  if (!(input instanceof Buffer)) {
    input = Buffer.from(input);
  }
  
  const mod = await loadModule();
  const inputSize = input.length;
  
  const outputSize = outputSizeHint || Math.max(inputSize * 100, 1024 * 1024);
  
  const inputPtr = mod._malloc(inputSize);
  const outputPtr = mod._malloc(outputSize);
  
  try {
    mod._instance.HEAPU8.set(input, inputPtr);
    const decompressedSize = mod._instance._wasm_lz4_decompress(inputPtr, inputSize, outputPtr, outputSize);
    
    if (decompressedSize === 0) {
      throw new Error('Decompression failed');
    }
    
    const result = Buffer.from(mod._instance.HEAPU8.slice(outputPtr, outputPtr + decompressedSize));
    return result;
  } finally {
    mod._free(inputPtr);
    mod._free(outputPtr);
  }
}

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
      
      const compressed = await compress(block);
      const header = Buffer.alloc(BLOCK_HEADER_SIZE);
      writeBlockHeader(header, 0, block.length, compressed.length);
      
      yield Buffer.concat([header, compressed]);
    }
  }
  
  if (leftover.length > 0) {
    const compressed = await compress(leftover);
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
      
      const decompressed = await decompress(compressedBlock, header.uncompressedSize);
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
    
    const compressed = await compress(block);
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
    
    const decompressed = await decompress(compressedBlock, header.uncompressedSize);
    chunks.push(decompressed);
  }
  
  return Buffer.concat(chunks);
}

module.exports = {
  loadModule,
  compress,
  decompress,
  compressStream,
  decompressStream,
  compressBuffer,
  decompressBuffer,
  BLOCK_HEADER_SIZE,
  END_MARKER_SIZE
};
