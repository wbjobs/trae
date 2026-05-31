const fs = require('fs');
const path = require('path');
const os = require('os');

const wasmLZ4 = require('../lib/wasm-lz4');
const jsLZ4 = require('../lib/js-lz4');

const TEST_FILE_SIZE = 10 * 1024 * 1024;
const TEST_FILE_PATH = path.join(__dirname, '..', 'benchmark_data', 'test_10mb.txt');
const BENCHMARK_RESULT_PATH = path.join(__dirname, '..', 'benchmark.json');
const CHART_HTML_PATH = path.join(__dirname, '..', 'benchmark_chart.html');

function generateTestData(size) {
  const data = Buffer.alloc(size);
  const patterns = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ',
    'The quick brown fox jumps over the lazy dog. ',
    'WebAssembly is a portable binary instruction format. ',
    'LZ4 is a lossless data compression algorithm. ',
    'Node.js is a JavaScript runtime built on Chrome V8. '
  ];

  let offset = 0;
  while (offset < size) {
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    const remaining = size - offset;
    const toWrite = Math.min(pattern.length, remaining);
    data.write(pattern.slice(0, toWrite), offset);
    offset += toWrite;
  }

  return data;
}

function measureMemory() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external
  };
}

function measureTime(fn) {
  const start = process.hrtime.bigint();
  const result = fn();
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1e6;
  return { result, durationMs };
}

async function runBenchmark() {
  console.log('=== LZ4 Benchmark: WASM vs JavaScript ===\n');
  console.log(`Generating ${TEST_FILE_SIZE / 1024 / 1024}MB test data...`);

  if (!fs.existsSync(path.dirname(TEST_FILE_PATH))) {
    fs.mkdirSync(path.dirname(TEST_FILE_PATH), { recursive: true });
  }

  const testData = generateTestData(TEST_FILE_SIZE);
  fs.writeFileSync(TEST_FILE_PATH, testData);
  console.log(`Test data written to: ${TEST_FILE_PATH}\n`);

  console.log('Pre-loading WASM module...');
  await wasmLZ4.loadModule();
  console.log('WASM module loaded.\n');

  const results = {
    meta: {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      testFileSize: TEST_FILE_SIZE
    },
    operations: {}
  };

  console.log('--- Compression Benchmarks ---');

  let memBefore, memAfter;

  memBefore = measureMemory();
  const jsCompressResult = measureTime(() => jsLZ4.compress(testData));
  memAfter = measureMemory();
  results.operations.jsCompress = {
    timeMs: jsCompressResult.durationMs,
    outputSize: jsCompressResult.result.length,
    memoryRss: memAfter.rss - memBefore.rss,
    memoryHeapUsed: memAfter.heapUsed - memBefore.heapUsed
  };
  console.log(`JS Compress:   ${jsCompressResult.durationMs.toFixed(2)}ms, size: ${(jsCompressResult.result.length / 1024 / 1024).toFixed(2)}MB`);

  global.gc && global.gc();

  memBefore = measureMemory();
  const wasmCompressResult = measureTime(async () => await wasmLZ4.compress(testData));
  const wasmCompressed = await wasmCompressResult.result;
  memAfter = measureMemory();
  results.operations.wasmCompress = {
    timeMs: wasmCompressResult.durationMs,
    outputSize: wasmCompressed.length,
    memoryRss: memAfter.rss - memBefore.rss,
    memoryHeapUsed: memAfter.heapUsed - memBefore.heapUsed
  };
  console.log(`WASM Compress: ${wasmCompressResult.durationMs.toFixed(2)}ms, size: ${(wasmCompressed.length / 1024 / 1024).toFixed(2)}MB`);

  global.gc && global.gc();

  console.log('\n--- Decompression Benchmarks ---');

  memBefore = measureMemory();
  const jsDecompressResult = measureTime(() => jsLZ4.decompress(jsCompressResult.result, TEST_FILE_SIZE));
  memAfter = measureMemory();
  results.operations.jsDecompress = {
    timeMs: jsDecompressResult.durationMs,
    outputSize: jsDecompressResult.result.length,
    memoryRss: memAfter.rss - memBefore.rss,
    memoryHeapUsed: memAfter.heapUsed - memBefore.heapUsed
  };
  console.log(`JS Decompress:   ${jsDecompressResult.durationMs.toFixed(2)}ms`);

  global.gc && global.gc();

  memBefore = measureMemory();
  const wasmDecompressResult = measureTime(async () => await wasmLZ4.decompress(wasmCompressed, TEST_FILE_SIZE));
  const wasmDecompressed = await wasmDecompressResult.result;
  memAfter = measureMemory();
  results.operations.wasmDecompress = {
    timeMs: wasmDecompressResult.durationMs,
    outputSize: wasmDecompressed.length,
    memoryRss: memAfter.rss - memBefore.rss,
    memoryHeapUsed: memAfter.heapUsed - memBefore.heapUsed
  };
  console.log(`WASM Decompress: ${wasmDecompressResult.durationMs.toFixed(2)}ms`);

  results.analysis = {
    compressSpeedup: (results.operations.jsCompress.timeMs / results.operations.wasmCompress.timeMs).toFixed(2),
    decompressSpeedup: (results.operations.jsDecompress.timeMs / results.operations.wasmDecompress.timeMs).toFixed(2),
    jsCompressionRatio: (100 - (results.operations.jsCompress.outputSize / TEST_FILE_SIZE * 100)).toFixed(2),
    wasmCompressionRatio: (100 - (results.operations.wasmCompress.outputSize / TEST_FILE_SIZE * 100)).toFixed(2)
  };

  console.log('\n=== Analysis ===');
  console.log(`Compression speedup (WASM vs JS): ${results.analysis.compressSpeedup}x`);
  console.log(`Decompression speedup (WASM vs JS): ${results.analysis.decompressSpeedup}x`);
  console.log(`JS compression ratio: ${results.analysis.jsCompressionRatio}% reduced`);
  console.log(`WASM compression ratio: ${results.analysis.wasmCompressionRatio}% reduced`);

  fs.writeFileSync(BENCHMARK_RESULT_PATH, JSON.stringify(results, null, 2));
  console.log(`\nBenchmark results saved to: ${BENCHMARK_RESULT_PATH}`);

  generateChartHTML(results);
  console.log(`Chart HTML saved to: ${CHART_HTML_PATH}`);

  const jsCorrect = jsDecompressResult.result.equals(testData);
  const wasmCorrect = wasmDecompressed.equals(testData);
  console.log(`\nCorrectness verification:`);
  console.log(`JS round-trip correct: ${jsCorrect ? 'YES' : 'NO'}`);
  console.log(`WASM round-trip correct: ${wasmCorrect ? 'YES' : 'NO'}`);
}

function generateChartHTML(results) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LZ4 Benchmark: WASM vs JavaScript</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: white;
            text-align: center;
            margin-bottom: 10px;
            font-size: 2.5em;
        }
        .subtitle {
            color: rgba(255,255,255,0.8);
            text-align: center;
            margin-bottom: 30px;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        .card h2 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.3em;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-top: 20px;
        }
        .stat {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
        }
        .stat-value {
            font-size: 1.8em;
            font-weight: bold;
            color: #667eea;
        }
        .stat-label {
            font-size: 0.9em;
            color: #666;
            margin-top: 5px;
        }
        .info {
            background: rgba(255,255,255,0.1);
            color: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 LZ4 Benchmark</h1>
        <p class="subtitle">WebAssembly vs Pure JavaScript Performance Comparison</p>
        
        <div class="info">
            <strong>Test Environment:</strong> Node.js ${results.meta.nodeVersion} | ${results.meta.platform} ${results.meta.arch} | ${results.meta.cpus} CPUs | Test file: ${(results.meta.testFileSize / 1024 / 1024).toFixed(0)}MB
        </div>

        <div class="grid">
            <div class="card">
                <h2>⏱️ Compression Time (ms)</h2>
                <canvas id="compressTimeChart"></canvas>
            </div>
            <div class="card">
                <h2>⏱️ Decompression Time (ms)</h2>
                <canvas id="decompressTimeChart"></canvas>
            </div>
            <div class="card">
                <h2>💾 Memory Usage - Compress (RSS bytes)</h2>
                <canvas id="compressMemChart"></canvas>
            </div>
            <div class="card">
                <h2>💾 Memory Usage - Decompress (RSS bytes)</h2>
                <canvas id="decompressMemChart"></canvas>
            </div>
        </div>

        <div class="stats">
            <div class="stat">
                <div class="stat-value">${results.analysis.compressSpeedup}x</div>
                <div class="stat-label">WASM Compression Speedup</div>
            </div>
            <div class="stat">
                <div class="stat-value">${results.analysis.decompressSpeedup}x</div>
                <div class="stat-label">WASM Decompression Speedup</div>
            </div>
            <div class="stat">
                <div class="stat-value">${results.analysis.jsCompressionRatio}%</div>
                <div class="stat-label">JS Compression Ratio</div>
            </div>
            <div class="stat">
                <div class="stat-value">${results.analysis.wasmCompressionRatio}%</div>
                <div class="stat-label">WASM Compression Ratio</div>
            </div>
        </div>
    </div>

    <script>
        const chartOptions = {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        };

        const data = ${JSON.stringify(results)};

        new Chart(document.getElementById('compressTimeChart'), {
            type: 'bar',
            data: {
                labels: ['JavaScript', 'WebAssembly'],
                datasets: [{
                    label: 'Compression Time (ms)',
                    data: [data.operations.jsCompress.timeMs, data.operations.wasmCompress.timeMs],
                    backgroundColor: ['#FF6384', '#36A2EB'],
                    borderWidth: 0
                }]
            },
            options: chartOptions
        });

        new Chart(document.getElementById('decompressTimeChart'), {
            type: 'bar',
            data: {
                labels: ['JavaScript', 'WebAssembly'],
                datasets: [{
                    label: 'Decompression Time (ms)',
                    data: [data.operations.jsDecompress.timeMs, data.operations.wasmDecompress.timeMs],
                    backgroundColor: ['#FF6384', '#36A2EB'],
                    borderWidth: 0
                }]
            },
            options: chartOptions
        });

        new Chart(document.getElementById('compressMemChart'), {
            type: 'bar',
            data: {
                labels: ['JavaScript', 'WebAssembly'],
                datasets: [{
                    label: 'Memory (RSS bytes)',
                    data: [data.operations.jsCompress.memoryRss, data.operations.wasmCompress.memoryRss],
                    backgroundColor: ['#FFCE56', '#4BC0C0'],
                    borderWidth: 0
                }]
            },
            options: chartOptions
        });

        new Chart(document.getElementById('decompressMemChart'), {
            type: 'bar',
            data: {
                labels: ['JavaScript', 'WebAssembly'],
                datasets: [{
                    label: 'Memory (RSS bytes)',
                    data: [data.operations.jsDecompress.memoryRss, data.operations.wasmDecompress.memoryRss],
                    backgroundColor: ['#FFCE56', '#4BC0C0'],
                    borderWidth: 0
                }]
            },
            options: chartOptions
        });
    </script>
</body>
</html>`;

  fs.writeFileSync(CHART_HTML_PATH, html);
}

runBenchmark().catch(err => {
  console.error(`Benchmark failed: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
