let Module = null;
let wasmLoaded = false;
let wasmLoadError = null;
let comparisonChart = null;
let historyChart = null;
const API_BASE_URL = 'http://localhost:8000';
const LOCALSTORAGE_KEY = 'matmul_autotune_config';
const BLOCK_SIZES = [8, 16, 32, 64];
const ALGORITHMS = ['optimized', 'normal', 'tiled_8', 'tiled_16', 'tiled_32', 'tiled_64'];

function isSafari() {
    const ua = navigator.userAgent.toLowerCase();
    return ua.indexOf('safari') !== -1 && ua.indexOf('chrome') === -1 && ua.indexOf('chromium') === -1;
}

function isWebAssemblySupported() {
    try {
        if (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function') {
            const module = new WebAssembly.Module(Uint8Array.of(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
            return module instanceof WebAssembly.Module;
        }
    } catch (e) {
        console.warn('WebAssembly not supported:', e);
    }
    return false;
}

async function initWasm() {
    if (!isWebAssemblySupported()) {
        showStatus('⚠️ 您的浏览器不支持 WebAssembly，将只运行 JS 版本', 'info');
        wasmLoaded = false;
        return;
    }

    const isSafariBrowser = isSafari();
    console.log(`Browser: ${isSafariBrowser ? 'Safari' : 'Non-Safari'}, loading WASM...`);

    try {
        const script = document.createElement('script');
        script.src = 'matmul.js';
        
        let moduleReady = null;
        
        window.Module = {
            onRuntimeInitialized: function() {
                wasmLoaded = true;
                wasmLoadError = null;
                showStatus('✅ WASM 模块加载成功', 'success');
            },
            onAbort: function(error) {
                wasmLoadError = error;
                wasmLoaded = false;
                showStatus(`⚠️ WASM 初始化失败: ${error}，将只运行 JS 版本`, 'error');
            },
            locateFile: function(path) {
                if (isSafariBrowser && path.endsWith('.wasm')) {
                    console.log('Safari detected, loading WASM file with cache-busting:', path);
                }
                return path;
            }
        };

        script.onload = async () => {
            console.log('matmul.js script loaded');
            
            if (typeof window.Module === 'function') {
                console.log('Module is a factory function (MODULARIZE=1), instantiating...');
                try {
                    Module = await window.Module();
                    wasmLoaded = true;
                    showStatus('✅ WASM 模块加载成功', 'success');
                } catch (e) {
                    handleWasmError(e, 'Module factory failed');
                }
            } else if (typeof window.Module !== 'undefined') {
                Module = window.Module;
                if (Module.then) {
                    try {
                        Module = await Module;
                        wasmLoaded = true;
                        showStatus('✅ WASM 模块加载成功', 'success');
                    } catch (e) {
                        handleWasmError(e, 'Module promise rejected');
                    }
                } else if (Module._matmul) {
                    wasmLoaded = true;
                    showStatus('✅ WASM 模块加载成功', 'success');
                }
            }
        };

        script.onerror = (event) => {
            showStatus('⚠️ WASM 模块文件未找到，将只运行 JS 版本', 'info');
            wasmLoaded = false;
        };

        document.head.appendChild(script);

        setTimeout(() => {
            if (!wasmLoaded && !wasmLoadError) {
                console.log('WASM loading timeout reached, checking status...');
                if (window.Module && window.Module._matmul) {
                    Module = window.Module;
                    wasmLoaded = true;
                    showStatus('✅ WASM 模块加载成功', 'success');
                } else {
                    console.log('Falling back to manual WASM loading...');
                    loadWasmManual();
                }
            }
        }, 10000);

    } catch (e) {
        handleWasmError(e, 'initWasm exception');
    }
}

async function loadWasmManual() {
    console.log('Attempting manual WASM loading for Safari compatibility...');
    try {
        const response = await fetch('matmul.wasm');
        if (!response.ok) {
            throw new Error(`Failed to fetch WASM: ${response.status}`);
        }
        
        let wasmModule;
        let instance;
        
        if (isSafari() && WebAssembly.instantiateStreaming) {
            console.log('Using WebAssembly.instantiateStreaming for Safari');
            try {
                const result = await WebAssembly.instantiateStreaming(response, {});
                wasmModule = result.module;
                instance = result.instance;
            } catch (streamingError) {
                console.warn('instantiateStreaming failed, falling back to array buffer:', streamingError);
                const bytes = await response.arrayBuffer();
                const result = await WebAssembly.instantiate(bytes, {});
                wasmModule = result.module;
                instance = result.instance;
            }
        } else {
            console.log('Using array buffer method');
            const bytes = await response.arrayBuffer();
            const result = await WebAssembly.instantiate(bytes, {});
            wasmModule = result.module;
            instance = result.instance;
        }
        
        console.log('WASM module loaded manually, exports:', Object.keys(instance.exports));
        
        Module = {
            _matmul: instance.exports.matmul || instance.exports._matmul,
            _matmul_optimized: instance.exports.matmul_optimized || instance.exports._matmul_optimized,
            _matmul_tiled: instance.exports.matmul_tiled || instance.exports._matmul_tiled,
            _create_matrix: instance.exports.create_matrix || instance.exports._create_matrix,
            _free_matrix: instance.exports.free_matrix || instance.exports._free_matrix,
            _random_matrix: instance.exports.random_matrix || instance.exports._random_matrix,
            _zero_matrix: instance.exports.zero_matrix || instance.exports._zero_matrix,
            HEAPF32: new Float32Array(instance.exports.memory.buffer)
        };
        
        wasmLoaded = true;
        wasmLoadError = null;
        showStatus('✅ WASM 模块加载成功 (Safari兼容模式)', 'success');
        
    } catch (e) {
        handleWasmError(e, 'Manual WASM loading failed');
    }
}

function handleWasmError(error, context) {
    wasmLoaded = false;
    wasmLoadError = error;
    const errorMsg = error.message || String(error);
    console.error(`WASM error (${context}):`, error);
    
    let userMessage = '⚠️ WASM 加载失败，将只运行 JS 版本';
    
    if (isSafari()) {
        if (errorMsg.includes('CompileError') || errorMsg.includes('instantiate')) {
            userMessage = '⚠️ Safari 不支持此 WASM 模块的某些特性，请尝试重新编译或使用 Chrome/Firefox。将只运行 JS 版本。';
        } else if (errorMsg.includes('memory') || errorMsg.includes('Memory')) {
            userMessage = '⚠️ Safari 内存分配失败，请尝试刷新页面。将只运行 JS 版本。';
        }
    }
    
    showStatus(userMessage, 'error');
}

function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    status.classList.remove('hidden');
}

function hideStatus() {
    document.getElementById('status').classList.add('hidden');
}

function calculateGFLOPS(timeMs, N) {
    const operations = 2 * N * N * N;
    const timeSeconds = timeMs / 1000;
    const flops = operations / timeSeconds;
    return flops / 1e9;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getAlgorithmInfo(algorithm) {
    if (algorithm === 'auto') {
        const cached = getCachedBestConfig();
        if (cached) {
            return cached.bestAlgorithm;
        }
        return 'optimized';
    }
    return algorithm;
}

function parseAlgorithm(algorithm) {
    if (algorithm === 'normal') {
        return { type: 'normal', blockSize: null };
    } else if (algorithm === 'optimized') {
        return { type: 'optimized', blockSize: null };
    } else if (algorithm.startsWith('tiled_')) {
        return { type: 'tiled', blockSize: parseInt(algorithm.split('_')[1]) };
    }
    return { type: 'optimized', blockSize: null };
}

async function runWasmBenchmark(A, B, C, N, iterations, algorithm) {
    const times = [];
    const algo = parseAlgorithm(algorithm);
    
    const ptrA = Module._create_matrix(N);
    const ptrB = Module._create_matrix(N);
    const ptrC = Module._create_matrix(N);
    
    Module.HEAPF32.set(A, ptrA / 4);
    Module.HEAPF32.set(B, ptrB / 4);
    
    for (let i = 0; i < iterations; i++) {
        Module.HEAPF32.fill(0, ptrC / 4, (ptrC / 4) + N * N);
        
        const start = performance.now();
        
        if (algo.type === 'tiled' && Module._matmul_tiled) {
            Module._matmul_tiled(ptrA, ptrB, ptrC, N, algo.blockSize);
        } else if (algo.type === 'optimized' && Module._matmul_optimized) {
            Module._matmul_optimized(ptrA, ptrB, ptrC, N);
        } else {
            Module._matmul(ptrA, ptrB, ptrC, N);
        }
        
        const end = performance.now();
        times.push(end - start);
        await sleep(10);
    }
    
    const result = new Float32Array(Module.HEAPF32.buffer, ptrC, N * N);
    C.set(result);
    
    Module._free_matrix(ptrA);
    Module._free_matrix(ptrB);
    Module._free_matrix(ptrC);
    
    return times;
}

async function runJSBenchmark(A, B, C, N, iterations, algorithm) {
    const times = [];
    const algo = parseAlgorithm(algorithm);
    
    for (let i = 0; i < iterations; i++) {
        C.fill(0);
        
        const start = performance.now();
        
        if (algo.type === 'tiled') {
            matmulJSTiled(A, B, C, N, algo.blockSize);
        } else if (algo.type === 'optimized') {
            matmulJSOptimized(A, B, C, N);
        } else {
            matmulJS(A, B, C, N);
        }
        
        const end = performance.now();
        times.push(end - start);
        await sleep(10);
    }
    
    return times;
}

function getCachedBestConfig() {
    try {
        const cached = localStorage.getItem(LOCALSTORAGE_KEY);
        if (cached) {
            const config = JSON.parse(cached);
            const N = parseInt(document.getElementById('matrixSize').value);
            if (config.matrixSize === N) {
                return config;
            }
        }
    } catch (e) {
        console.warn('Failed to read cached config:', e);
    }
    return null;
}

function saveCachedBestConfig(config) {
    try {
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(config));
    } catch (e) {
        console.warn('Failed to save cached config:', e);
    }
}

function clearCachedConfig() {
    try {
        localStorage.removeItem(LOCALSTORAGE_KEY);
    } catch (e) {
        console.warn('Failed to clear cached config:', e);
    }
}

async function runAutoTune() {
    const N = parseInt(document.getElementById('matrixSize').value);
    const autoTuneBtn = document.getElementById('autoTuneBtn');
    const autoTuneInfo = document.getElementById('autoTuneInfo');
    const autoTuneStatus = document.getElementById('autoTuneStatus');
    const autoTuneProgress = document.getElementById('autoTuneProgress');
    
    autoTuneBtn.disabled = true;
    autoTuneInfo.classList.remove('hidden');
    
    const A = createMatrix(N);
    const B = createMatrix(N);
    const C_wasm = createMatrix(N);
    const C_js = createMatrix(N);
    
    randomMatrix(A, N);
    randomMatrix(B, N);
    
    const algorithms = ['optimized', 'normal', 'tiled_8', 'tiled_16', 'tiled_32', 'tiled_64'];
    const results = [];
    
    for (let i = 0; i < algorithms.length; i++) {
        const algo = algorithms[i];
        const progress = ((i) / algorithms.length) * 100;
        autoTuneProgress.style.width = `${progress}%`;
        
        autoTuneStatus.textContent = `正在测试: ${getAlgorithmLabel(algo)}...`;
        
        try {
            const jsTimes = await runJSBenchmark(A, B, C_js, N, 2, algo);
            const jsResult = analyzeResults(jsTimes, N);
            
            let wasmResult = null;
            if (wasmLoaded) {
                const wasmTimes = await runWasmBenchmark(A, B, C_wasm, N, 2, algo);
                wasmResult = analyzeResults(wasmTimes, N);
            }
            
            results.push({
                algorithm: algo,
                label: getAlgorithmLabel(algo),
                js: jsResult,
                wasm: wasmResult,
                score: wasmResult ? wasmResult.avg : jsResult.avg
            });
            
        } catch (e) {
            console.error(`Auto-tune error for ${algo}:`, e);
        }
        
        await sleep(200);
    }
    
    autoTuneProgress.style.width = '100%';
    
    results.sort((a, b) => a.score - b.score);
    const best = results[0];
    
    const config = {
        matrixSize: N,
        bestAlgorithm: best.algorithm,
        bestLabel: best.label,
        results: results,
        timestamp: Date.now()
    };
    
    saveCachedBestConfig(config);
    
    autoTuneStatus.textContent = `✅ 自动调优完成! 最优算法: ${best.label}`;
    
    setTimeout(() => {
        autoTuneInfo.classList.add('hidden');
        autoTuneBtn.disabled = false;
    }, 3000);
    
    displayAutoTuneResults(results, best);
}

function getAlgorithmLabel(algo) {
    const labels = {
        'normal': '普通版本 (ijk)',
        'optimized': '普通优化 (ikj)',
        'tiled_8': '分块 (8x8)',
        'tiled_16': '分块 (16x16)',
        'tiled_32': '分块 (32x32)',
        'tiled_64': '分块 (64x64)'
    };
    return labels[algo] || algo;
}

function displayAutoTuneResults(results, best) {
    console.log('=== Auto-tune Results ===');
    results.forEach((r, i) => {
        const wasmTime = r.wasm ? r.wasm.avg.toFixed(2) : 'N/A';
        console.log(`${i + 1}. ${r.label}: JS=${r.js.avg.toFixed(2)}ms, WASM=${wasmTime}ms`);
    });
    console.log(`Best: ${best.label}`);
}

function analyzeResults(times, N) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const gflops = calculateGFLOPS(avg, N);
    
    return { avg, min, max, gflops, times };
}

async function runBenchmark() {
    const N = parseInt(document.getElementById('matrixSize').value);
    const iterations = parseInt(document.getElementById('iterations').value);
    const algorithm = document.getElementById('algorithm').value;
    const runBtn = document.getElementById('runBtn');
    
    const actualAlgorithm = getAlgorithmInfo(algorithm);
    const algoLabel = getAlgorithmLabel(actualAlgorithm);
    
    runBtn.disabled = true;
    
    if (algorithm === 'auto') {
        const cached = getCachedBestConfig();
        if (cached) {
            showStatus(`🤖 自动调优模式: 使用缓存的最优算法 - ${cached.bestLabel}`, 'info');
        } else {
            showStatus('🤖 自动调优模式: 无缓存，将使用默认优化算法', 'info');
        }
    } else {
        showStatus(`🔄 正在初始化矩阵...`, 'info');
    }
    
    await sleep(500);
    
    const A = createMatrix(N);
    const B = createMatrix(N);
    const C_wasm = createMatrix(N);
    const C_js = createMatrix(N);
    
    randomMatrix(A, N);
    randomMatrix(B, N);
    
    let wasmResults = null;
    let jsResults = null;
    
    if (wasmLoaded) {
        showStatus(`⚙️ 正在运行 WASM 版本 (${iterations} 次, ${algoLabel})...`, 'info');
        try {
            const wasmTimes = await runWasmBenchmark(A, B, C_wasm, N, iterations, actualAlgorithm);
            wasmResults = analyzeResults(wasmTimes, N);
        } catch (e) {
            showStatus(`❌ WASM 运行失败: ${e.message}`, 'error');
            wasmLoaded = false;
        }
    }
    
    showStatus(`🟨 正在运行 JavaScript 版本 (${iterations} 次, ${algoLabel})...`, 'info');
    const jsTimes = await runJSBenchmark(A, B, C_js, N, iterations, actualAlgorithm);
    jsResults = analyzeResults(jsTimes, N);
    
    if (wasmResults) {
        let correct = true;
        for (let i = 0; i < N * N; i++) {
            if (Math.abs(C_wasm[i] - C_js[i]) > 0.01) {
                correct = false;
                break;
            }
        }
        if (!correct) {
            showStatus('⚠️ 警告: WASM 和 JS 结果不一致!', 'error');
        }
    }
    
    displayResults(wasmResults, jsResults, N);
    
    const resultData = {
        matrix_size: N,
        iterations: iterations,
        optimized: optimized,
        wasm_time_avg: wasmResults ? wasmResults.avg : null,
        wasm_gflops: wasmResults ? wasmResults.gflops : null,
        js_time_avg: jsResults.avg,
        js_gflops: jsResults.gflops,
        timestamp: new Date().toISOString()
    };
    
    try {
        await saveResult(resultData);
    } catch (e) {
        console.log('无法保存到后端:', e);
    }
    
    runBtn.disabled = false;
    showStatus('✅ 测试完成!', 'success');
    setTimeout(hideStatus, 3000);
}

function displayResults(wasmResults, jsResults, N) {
    document.getElementById('resultsSection').classList.remove('hidden');
    
    if (wasmResults) {
        document.getElementById('wasmTime').textContent = wasmResults.avg.toFixed(2);
        document.getElementById('wasmFlops').textContent = wasmResults.gflops.toFixed(2);
        document.getElementById('wasmMin').textContent = wasmResults.min.toFixed(2);
        document.getElementById('wasmMax').textContent = wasmResults.max.toFixed(2);
    } else {
        document.getElementById('wasmTime').textContent = 'N/A';
        document.getElementById('wasmFlops').textContent = 'N/A';
        document.getElementById('wasmMin').textContent = 'N/A';
        document.getElementById('wasmMax').textContent = 'N/A';
    }
    
    document.getElementById('jsTime').textContent = jsResults.avg.toFixed(2);
    document.getElementById('jsFlops').textContent = jsResults.gflops.toFixed(2);
    document.getElementById('jsMin').textContent = jsResults.min.toFixed(2);
    document.getElementById('jsMax').textContent = jsResults.max.toFixed(2);
    
    if (wasmResults) {
        const speedup = jsResults.avg / wasmResults.avg;
        document.getElementById('speedupValue').textContent = `${speedup.toFixed(2)}x`;
    } else {
        document.getElementById('speedupValue').textContent = 'N/A';
    }
    
    drawComparisonChart(wasmResults, jsResults, N);
}

function drawComparisonChart(wasmResults, jsResults, N) {
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    
    if (comparisonChart) {
        comparisonChart.destroy();
    }
    
    const labels = jsResults.times.map((_, i) => `第 ${i + 1} 次`);
    const datasets = [];
    
    if (wasmResults) {
        datasets.push({
            label: 'WASM 耗时 (ms)',
            data: wasmResults.times,
            backgroundColor: 'rgba(76, 175, 80, 0.6)',
            borderColor: 'rgba(76, 175, 80, 1)',
            borderWidth: 2,
            type: 'bar'
        });
    }
    
    datasets.push({
        label: 'JavaScript 耗时 (ms)',
        data: jsResults.times,
        backgroundColor: 'rgba(33, 150, 243, 0.6)',
        borderColor: 'rgba(33, 150, 243, 1)',
        borderWidth: 2,
        type: 'bar'
    });
    
    if (wasmResults) {
        datasets.push({
            label: 'WASM GFLOPS',
            data: wasmResults.times.map(t => calculateGFLOPS(t, N)),
            backgroundColor: 'rgba(76, 175, 80, 0.2)',
            borderColor: 'rgba(76, 175, 80, 0.8)',
            borderWidth: 2,
            type: 'line',
            yAxisID: 'y1'
        });
    }
    
    datasets.push({
        label: 'JavaScript GFLOPS',
        data: jsResults.times.map(t => calculateGFLOPS(t, N)),
        backgroundColor: 'rgba(33, 150, 243, 0.2)',
        borderColor: 'rgba(33, 150, 243, 0.8)',
        borderWidth: 2,
        type: 'line',
        yAxisID: 'y1'
    });
    
    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `${N}x${N} 矩阵乘法性能对比`
                },
                legend: {
                    position: 'top'
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: '耗时 (毫秒)'
                    }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'GFLOPS'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

async function saveResult(result) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/results`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
        });
        return await response.json();
    } catch (e) {
        console.log('后端不可用，结果未保存');
    }
}

async function loadHistory() {
    try {
        showStatus('📥 正在加载历史记录...', 'info');
        const response = await fetch(`${API_BASE_URL}/api/results`);
        const data = await response.json();
        
        if (data.length === 0) {
            showStatus('ℹ️ 暂无历史记录', 'info');
            return;
        }
        
        drawHistoryChart(data);
        showStatus(`✅ 已加载 ${data.length} 条历史记录`, 'success');
        setTimeout(hideStatus, 2000);
    } catch (e) {
        showStatus('❌ 无法加载历史记录，请确保后端已启动', 'error');
    }
}

function drawHistoryChart(data) {
    const ctx = document.getElementById('historyChart').getContext('2d');
    
    if (historyChart) {
        historyChart.destroy();
    }
    
    const labels = data.map((_, i) => `#${i + 1}`);
    
    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'WASM 耗时 (ms)',
                    data: data.map(d => d.wasm_time_avg),
                    borderColor: 'rgba(76, 175, 80, 1)',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1
                },
                {
                    label: 'JavaScript 耗时 (ms)',
                    data: data.map(d => d.js_time_avg),
                    borderColor: 'rgba(33, 150, 243, 1)',
                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1
                },
                {
                    label: '加速倍数',
                    data: data.map(d => d.wasm_time_avg ? (d.js_time_avg / d.wasm_time_avg) : null),
                    borderColor: 'rgba(255, 193, 7, 1)',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.1,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '历史测试记录对比'
                },
                legend: {
                    position: 'top'
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: '耗时 (毫秒)'
                    }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: '加速倍数'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

async function clearHistory() {
    if (!confirm('确定要清空所有历史记录吗？')) return;
    
    try {
        await fetch(`${API_BASE_URL}/api/results`, { method: 'DELETE' });
        if (historyChart) {
            historyChart.destroy();
            historyChart = null;
        }
        showStatus('🗑️ 历史记录已清空', 'success');
        setTimeout(hideStatus, 2000);
    } catch (e) {
        showStatus('❌ 无法清空历史记录', 'error');
    }
}

window.onload = () => {
    initWasm();
    loadHistory();
};
