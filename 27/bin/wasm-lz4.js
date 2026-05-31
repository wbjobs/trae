#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_CHUNK_SIZE = 1024 * 1024;

function parseArgs(args) {
  const os = require('os');
  const options = {
    chunkSize: DEFAULT_CHUNK_SIZE,
    streaming: true,
    inputPath: null,
    outputPath: null,
    threads: 1,
    multithreaded: false
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    
    if (arg === '--chunk-size' || arg === '-c') {
      i++;
      if (i < args.length) {
        const sizeStr = args[i];
        options.chunkSize = parseChunkSize(sizeStr);
      } else {
        console.error('Error: --chunk-size requires a value');
        process.exit(1);
      }
    } else if (arg === '--threads' || arg === '-t') {
      i++;
      if (i < args.length) {
        options.threads = parseInt(args[i]);
        options.multithreaded = true;
        if (options.threads < 1) options.threads = 1;
      } else {
        console.error('Error: --threads requires a value');
        process.exit(1);
      }
    } else if (arg === '--no-stream') {
      options.streaming = false;
    } else if (!options.inputPath) {
      options.inputPath = arg;
    } else if (!options.outputPath) {
      options.outputPath = arg;
    }
    
    i++;
  }

  return options;
}

function parseChunkSize(str) {
  const match = str.match(/^(\d+(?:\.\d+)?)\s*([kKmMgG]?[bB]?)$/);
  if (!match) {
    console.error(`Error: Invalid chunk size: ${str}`);
    process.exit(1);
  }

  const num = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === 'kb' || unit === 'k') return Math.floor(num * 1024);
  if (unit === 'mb' || unit === 'm') return Math.floor(num * 1024 * 1024);
  if (unit === 'gb' || unit === 'g') return Math.floor(num * 1024 * 1024 * 1024);
  return Math.floor(num);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    printUsage();
    process.exit(1);
  }

  const command = args[0];

  if (command === 'compress') {
    const options = parseArgs(args.slice(1));
    await handleCompress(options);
  } else if (command === 'decompress') {
    const options = parseArgs(args.slice(1));
    await handleDecompress(options);
  } else if (command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
wasm-lz4 - LZ4 compression tool powered by WebAssembly

Usage:
  wasm-lz4 compress <input_file> [output_file] [options]
  wasm-lz4 decompress <input_file> [output_file] [options]
  wasm-lz4 --help | -h

Options:
  --chunk-size, -c <size>    Chunk size for streaming (default: 1MB)
                             Supports suffixes: k/K/KB, m/M/MB, g/G/GB
  --threads, -t <count>      Enable multi-threaded compression
                             Uses worker threads for parallel block compression
  --no-stream                Disable streaming (load entire file into memory)

Examples:
  wasm-lz4 compress input.txt input.lz4
  wasm-lz4 compress input.txt input.lz4 --chunk-size 512KB
  wasm-lz4 compress large.iso large.iso.lz4 -c 4MB -t 4
  wasm-lz4 decompress input.lz4 output.txt
  `);
}

async function handleCompress(options) {
  if (!options.inputPath) {
    console.error('Error: Input file required for compress command');
    process.exit(1);
  }

  const inputPath = options.inputPath;
  const outputPath = options.outputPath || inputPath + '.lz4';

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const inputSize = fs.statSync(inputPath).size;
  
  try {
    if (options.multithreaded) {
      await compressMultithreaded(inputPath, outputPath, inputSize, options);
    } else if (options.streaming) {
      await compressStreaming(inputPath, outputPath, inputSize, options.chunkSize);
    } else {
      await compressWholeFile(inputPath, outputPath, inputSize);
    }
  } catch (err) {
    console.error(`Compression failed: ${err.message}`);
    process.exit(1);
  }
}

async function compressMultithreaded(inputPath, outputPath, inputSize, options) {
  console.log(`Compressing (multi-threaded): ${inputPath}`);
  console.log(`Threads: ${options.threads}`);
  console.log(`Chunk size: ${formatBytes(options.chunkSize)}`);
  console.log(`Input size: ${formatBytes(inputSize)}`);
  console.log('⚠️  Experimental feature - may have stability issues');

  const ThreadPoolCompressor = require('../lib/threadpool-compressor.js');
  
  const inputData = fs.readFileSync(inputPath);
  
  const compressor = new ThreadPoolCompressor({
    threadCount: options.threads,
    chunkSize: options.chunkSize
  });

  let lastProgress = 0;
  compressor.on('blockScheduled', (detail) => {
    const progress = Math.floor(detail.progress);
    if (progress !== lastProgress) {
      process.stdout.write(`\r  Progress: ${progress}% (${detail.blockIndex + 1} blocks)`);
      lastProgress = progress;
    }
  });

  console.log('\nInitializing thread pool...');
  await compressor.init();

  console.log('Starting compression...');
  const startTime = Date.now();
  
  const compressed = await compressor.compressBuffer(inputData);
  
  const duration = Date.now() - startTime;
  process.stdout.write('\r  Progress: 100%            \n');

  fs.writeFileSync(outputPath, compressed);

  const ratio = ((1 - compressed.length / inputSize) * 100).toFixed(2);
  console.log(`\nCompression complete!`);
  console.log(`Original size: ${formatBytes(inputSize)}`);
  console.log(`Compressed size: ${formatBytes(compressed.length)}`);
  console.log(`Compression ratio: ${ratio}% reduced`);
  console.log(`Time: ${duration}ms`);
  console.log(`Output saved to: ${outputPath}`);

  await compressor.shutdown();
}

async function compressStreaming(inputPath, outputPath, inputSize, chunkSize) {
  console.log(`Compressing (streaming): ${inputPath}`);
  console.log(`Chunk size: ${formatBytes(chunkSize)}`);
  console.log(`Input size: ${formatBytes(inputSize)}`);

  const jsLZ4 = require('../lib/js-lz4');
  
  const readStream = fs.createReadStream(inputPath, { highWaterMark: chunkSize });
  const writeStream = fs.createWriteStream(outputPath);
  
  let totalCompressed = 0;
  let chunkCount = 0;
  
  for await (const chunk of jsLZ4.compressStream(readStream, chunkSize)) {
    writeStream.write(chunk);
    totalCompressed += chunk.length;
    chunkCount++;
  }
  
  await new Promise((resolve) => writeStream.end(resolve));

  const ratio = ((1 - totalCompressed / inputSize) * 100).toFixed(2);
  console.log(`\nCompression complete!`);
  console.log(`Original size: ${formatBytes(inputSize)}`);
  console.log(`Compressed size: ${formatBytes(totalCompressed)}`);
  console.log(`Compression ratio: ${ratio}% reduced`);
  console.log(`Total blocks: ${chunkCount - 1}`);
  console.log(`Output saved to: ${outputPath}`);
}

async function compressWholeFile(inputPath, outputPath, inputSize) {
  console.log(`Compressing (whole file): ${inputPath}`);
  console.log(`Input size: ${formatBytes(inputSize)}`);

  const { compress } = require('../lib/wasm-lz4');
  
  const inputData = fs.readFileSync(inputPath);
  const compressed = await compress(inputData);
  fs.writeFileSync(outputPath, compressed);

  const ratio = ((1 - compressed.length / inputSize) * 100).toFixed(2);
  console.log(`Original size: ${formatBytes(inputSize)}`);
  console.log(`Compressed size: ${formatBytes(compressed.length)}`);
  console.log(`Compression ratio: ${ratio}% reduced`);
  console.log(`Output saved to: ${outputPath}`);
}

async function handleDecompress(options) {
  if (!options.inputPath) {
    console.error('Error: Input file required for decompress command');
    process.exit(1);
  }

  const inputPath = options.inputPath;
  const outputPath = options.outputPath || (inputPath.endsWith('.lz4') ? inputPath.slice(0, -4) : inputPath + '.out');

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const inputSize = fs.statSync(inputPath).size;
  
  try {
    await decompressStreaming(inputPath, outputPath, inputSize);
  } catch (err) {
    console.error(`Decompression failed: ${err.message}`);
    process.exit(1);
  }
}

async function decompressStreaming(inputPath, outputPath, inputSize) {
  console.log(`Decompressing (streaming): ${inputPath}`);
  console.log(`Compressed size: ${formatBytes(inputSize)}`);

  const jsLZ4 = require('../lib/js-lz4');
  
  const readStream = fs.createReadStream(inputPath);
  const writeStream = fs.createWriteStream(outputPath);
  
  let totalDecompressed = 0;
  let blockCount = 0;
  
  for await (const chunk of jsLZ4.decompressStream(readStream)) {
    writeStream.write(chunk);
    totalDecompressed += chunk.length;
    blockCount++;
  }
  
  await new Promise((resolve) => writeStream.end(resolve));

  console.log(`\nDecompression complete!`);
  console.log(`Decompressed size: ${formatBytes(totalDecompressed)}`);
  console.log(`Total blocks: ${blockCount}`);
  console.log(`Output saved to: ${outputPath}`);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
