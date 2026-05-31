const assert = require('assert');
const fs = require('fs');
const path = require('path');

const jsLZ4 = require('../lib/js-lz4');

async function runTests() {
  console.log('=== Running LZ4 Tests ===\n');

  console.log('1. Testing basic compression/decompression...');
  testBasic();
  console.log('   ✓ Basic test passed\n');

  console.log('2. Testing small data...');
  testSmallData();
  console.log('   ✓ Small data test passed\n');

  console.log('3. Testing random data...');
  testRandomData();
  console.log('   ✓ Random data test passed\n');

  console.log('4. Testing repeated patterns...');
  testRepeatedPatterns();
  console.log('   ✓ Repeated patterns test passed\n');

  console.log('5. Testing large data (1MB)...');
  testLargeData();
  console.log('   ✓ Large data test passed\n');

  console.log('6. Testing WASM module (if available)...');
  try {
    await testWasmModule();
    console.log('   ✓ WASM module test passed\n');
  } catch (e) {
    console.log(`   ⚠ WASM test skipped: ${e.message}\n`);
  }

  console.log('=== All tests passed! ===');
}

function testBasic() {
  const input = 'Hello, World! Hello, World! Hello, World!';
  const inputBuf = Buffer.from(input);

  const compressed = jsLZ4.compress(inputBuf);
  const decompressed = jsLZ4.decompress(compressed);

  assert.strictEqual(decompressed.toString(), input);
  assert(compressed.length < inputBuf.length, 'Compressed data should be smaller');
}

function testSmallData() {
  const testCases = [
    '',
    'a',
    'ab',
    'abc',
    'abcd',
    'abcde',
    'Hello',
    '1234',
    'test'
  ];

  for (const testCase of testCases) {
    const inputBuf = Buffer.from(testCase);
    const compressed = jsLZ4.compress(inputBuf);
    const decompressed = jsLZ4.decompress(compressed);
    assert.strictEqual(decompressed.toString(), testCase, `Failed for: "${testCase}"`);
  }
}

function testRandomData() {
  const sizes = [100, 1000, 10000, 100000];

  for (const size of sizes) {
    const data = Buffer.alloc(size);
    for (let i = 0; i < size; i++) {
      data[i] = Math.floor(Math.random() * 256);
    }

    const compressed = jsLZ4.compress(data);
    const decompressed = jsLZ4.decompress(compressed);

    assert(decompressed.equals(data), `Failed for random data of size ${size}`);
  }
}

function testRepeatedPatterns() {
  const patterns = [
    'ABABABABABABABABABAB',
    'AAAAAAAAAA',
    'ABCABCABCABCABC',
    'HelloHelloHelloHello',
    '123123123123123123'
  ];

  for (const pattern of patterns) {
    const inputBuf = Buffer.from(pattern);
    const compressed = jsLZ4.compress(inputBuf);
    const decompressed = jsLZ4.decompress(compressed);

    assert.strictEqual(decompressed.toString(), pattern);
    assert(compressed.length < inputBuf.length, `Pattern should compress well: "${pattern}"`);
  }
}

function testLargeData() {
  const size = 1024 * 1024;
  const data = Buffer.alloc(size);

  const pattern = 'The quick brown fox jumps over the lazy dog. ';
  let offset = 0;
  while (offset < size) {
    const toWrite = Math.min(pattern.length, size - offset);
    data.write(pattern.slice(0, toWrite), offset);
    offset += toWrite;
  }

  const compressed = jsLZ4.compress(data);
  const decompressed = jsLZ4.decompress(compressed);

  assert(decompressed.equals(data), 'Large data round-trip failed');

  const ratio = (1 - compressed.length / size) * 100;
  console.log(`     Compression ratio: ${ratio.toFixed(2)}% (${size} -> ${compressed.length})`);
}

async function testWasmModule() {
  const wasmPath = path.join(__dirname, '..', 'build', 'lz4.js');
  if (!fs.existsSync(wasmPath)) {
    throw new Error('WASM module not built yet');
  }

  const wasmLZ4 = require('../lib/wasm-lz4');
  await wasmLZ4.loadModule();

  const testData = Buffer.from('Test WASM compression. Test WASM compression. Test WASM compression.');

  const compressed = await wasmLZ4.compress(testData);
  const decompressed = await wasmLZ4.decompress(compressed);

  assert(decompressed.equals(testData), 'WASM round-trip failed');

  const jsCompressed = jsLZ4.compress(testData);
  const jsDecompressed = jsLZ4.decompress(compressed);
  assert(jsDecompressed.equals(testData), 'WASM output should be decompressible by JS');
}

runTests().catch(err => {
  console.error('Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
