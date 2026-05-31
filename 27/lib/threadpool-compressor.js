
const EventEmitter = require('events');
const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

class ThreadPoolCompressor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.threadCount = options.threadCount || Math.min(os.cpus().length, 4);
    this.chunkSize = options.chunkSize || 1024 * 1024;
    this.workers = [];
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.nextTaskId = 0;
    this.isShuttingDown = false;
    this.readyWorkers = 0;
  }

  async init() {
    const workerPath = path.join(__dirname, '..', 'src', 'worker', 'node-worker.js');
    
    for (let i = 0; i < this.threadCount; i++) {
      const worker = new Worker(workerPath, {
        workerData: { workerId: i, isWorker: true }
      });

      worker.isReady = false;
      worker.on('message', (msg) => this.handleWorkerMessage(worker, msg));
      worker.on('error', (err) => this.handleWorkerError(worker, err));
      worker.on('exit', (code) => this.handleWorkerExit(worker, code));

      this.workers.push(worker);
    }

    await this.waitForWorkersReady();
    this.emit('ready');
  }

  waitForWorkersReady() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker initialization timeout')), 10000);
      
      const checkReady = () => {
        if (this.readyWorkers === this.threadCount) {
          clearTimeout(timeout);
          resolve();
        }
      };

      this.on('workerReady', () => {
        this.readyWorkers++;
        checkReady();
      });
    });
  }

  handleWorkerMessage(worker, msg) {
    const { type, payload } = msg;

    switch (type) {
      case 'ready':
        worker.isReady = true;
        this.emit('workerReady', worker);
        this.processQueue();
        break;

      case 'result':
        this.handleTaskResult(payload);
        break;

      case 'error':
        this.handleTaskError(payload);
        break;

      default:
        console.warn('Unknown message from worker:', type);
    }
  }

  handleWorkerError(worker, err) {
    console.error('Worker error:', err);
    this.emit('workerError', worker, err);
  }

  handleWorkerExit(worker, code) {
    if (code !== 0 && !this.isShuttingDown) {
      console.warn(`Worker exited with code ${code}`);
    }
    worker.isReady = false;
  }

  handleTaskResult(result) {
    const taskId = result.taskId;
    const task = this.activeTasks.get(taskId);
    
    if (task) {
      this.activeTasks.delete(taskId);
      
      if (task.resolve) {
        task.resolve(result);
      }
      
      this.emit('taskComplete', taskId, result);
    }
    
    this.processQueue();
  }

  handleTaskError(error) {
    const taskId = error.taskId;
    const task = this.activeTasks.get(taskId);
    
    if (task) {
      this.activeTasks.delete(taskId);
      
      if (task.reject) {
        task.reject(new Error(error.message));
      }
      
      this.emit('taskError', taskId, error);
    }
    
    this.processQueue();
  }

  compressBlock(blockData, blockIndex) {
    return new Promise((resolve, reject) => {
      const taskId = this.nextTaskId++;
      
      const task = {
        id: taskId,
        type: 'compress',
        blockData,
        blockIndex,
        resolve,
        reject
      };

      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  processQueue() {
    if (this.isShuttingDown) return;

    while (this.taskQueue.length > 0 && this.activeTasks.size < this.threadCount) {
      const task = this.taskQueue.shift();
      const worker = this.getAvailableWorker();
      
      if (worker) {
        this.activeTasks.set(task.id, task);
        worker.postMessage({
          type: 'compress',
          payload: {
            taskId: task.id,
            blockData: task.blockData,
            blockIndex: task.blockIndex
          }
        });
      } else {
        this.taskQueue.unshift(task);
        break;
      }
    }
  }

  getAvailableWorker() {
    return this.workers.find(w => w.isReady);
  }

  async compressBuffer(input) {
    const results = [];
    const totalBlocks = Math.ceil(input.length / this.chunkSize);

    this.emit('compressionStart', {
      totalSize: input.length,
      chunkSize: this.chunkSize,
      totalBlocks,
      threadCount: this.threadCount
    });

    for (let i = 0; i < totalBlocks; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, input.length);
      const block = input.slice(start, end);
      
      results.push(this.compressBlock(block, i));
      
      this.emit('blockScheduled', {
        blockIndex: i,
        blockSize: block.length,
        progress: ((i + 1) / totalBlocks * 100)
      });
    }

    const completedResults = await Promise.all(results);
    
    const sortedResults = completedResults.sort((a, b) => a.index - b.index);
    
    const finalBuffer = this.mergeResults(sortedResults);
    
    this.emit('compressionComplete', {
      originalSize: input.length,
      compressedSize: finalBuffer.length,
      totalBlocks,
      ratio: ((1 - finalBuffer.length / input.length) * 100).toFixed(2)
    });

    return finalBuffer;
  }

  mergeResults(results) {
    let totalSize = 0;
    for (const r of results) {
      totalSize += r.data.length;
    }
    totalSize += 4;

    const merged = Buffer.alloc(totalSize);
    let offset = 0;
    
    for (const r of results) {
      const data = Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data);
      data.copy(merged, offset);
      offset += r.data.length;
    }

    merged.writeUInt32LE(0x42444E45, offset);

    return merged;
  }

  async shutdown() {
    this.isShuttingDown = true;
    
    for (const worker of this.workers) {
      try {
        await worker.terminate();
      } catch (e) {
        // Ignore termination errors
      }
    }
    
    this.workers = [];
    this.emit('shutdown');
  }
}

module.exports = ThreadPoolCompressor;
