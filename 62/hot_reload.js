const cluster = require('cluster');
const os = require('os');
const config = require('./config');
const logger = require('./logger');

class HotReloadManager {
  constructor() {
    this.workers = new Map();
    this.isReloading = false;
    this.gracefulShutdownTimeout = 30000;
    this.healthCheckInterval = null;
  }

  start(workerCount = config.server.workerCount || Math.max(1, os.cpus().length - 1)) {
    if (cluster.isMaster) {
      this._startMaster(workerCount);
    } else {
      this._startWorker();
    }
  }

  _startMaster(workerCount) {
    logger.HOT_RELOAD.info('Master 进程已启动', {
      pid: process.pid,
      workerCount
    });

    for (let i = 0; i < workerCount; i++) {
      this._forkWorker(i);
    }

    cluster.on('exit', (worker, code, signal) => {
      const workerId = worker.id;
      logger.HOT_RELOAD.warn('Worker 已退出', {
        workerId,
        pid: worker.process.pid,
        code,
        signal
      });

      this.workers.delete(workerId);

      if (!this.isReloading) {
        setTimeout(() => {
          if (this.workers.size < workerCount) {
            logger.HOT_RELOAD.info('正在重启崩溃的 Worker', { workerId });
            this._forkWorker(workerId);
          }
        }, 1000);
      }
    });

    cluster.on('listening', (worker, address) => {
      logger.HOT_RELOAD.info('Worker 正在监听', {
        workerId: worker.id,
        address: `${address.address}:${address.port}`
      });
    });

    this._setupSignalHandlers();
    this._startHealthCheck();
  }

  _forkWorker(id) {
    const worker = cluster.fork({
      WORKER_ID: id,
      NODE_ID: `${config.server.nodeId}-w${id}`
    });

    worker.on('message', (msg) => {
      this._handleWorkerMessage(worker, msg);
    });

    this.workers.set(worker.id, {
      worker,
      id,
      startedAt: Date.now(),
      status: 'starting'
    });

    return worker;
  }

  _startWorker() {
    logger.HOT_RELOAD.info('Worker 进程已启动', {
      pid: process.pid,
      workerId: process.env.WORKER_ID
    });

    process.on('message', (msg) => {
      this._handleMasterMessage(msg);
    });

    process.on('SIGTERM', () => {
      this._gracefulShutdown();
    });

    process.on('SIGINT', () => {
      this._gracefulShutdown();
    });

    if (process.send) {
      process.send({ type: 'worker_ready', pid: process.pid });
    }
  }

  async reload() {
    if (this.isReloading) {
      logger.HOT_RELOAD.warn('已有热重启正在进行中');
      return false;
    }

    this.isReloading = true;
    const oldWorkers = Array.from(this.workers.values());
    const workerCount = oldWorkers.length;

    logger.HOT_RELOAD.info('开始热重启', { workerCount });

    const newWorkers = [];
    for (let i = 0; i < workerCount; i++) {
      const newWorker = this._forkWorker(i);
      newWorkers.push(new Promise((resolve) => {
        newWorker.once('listening', () => resolve(newWorker));
      }));
    }

    try {
      await Promise.all(newWorkers);
      logger.HOT_RELOAD.info('新 Worker 全部就绪，开始关闭旧 Worker');

      for (const oldWorkerInfo of oldWorkers) {
        const oldWorker = oldWorkerInfo.worker;
        this._shutdownWorker(oldWorker);
      }

      setTimeout(() => {
        this.isReloading = false;
        logger.HOT_RELOAD.info('热重启完成');
      }, 5000);

      return true;
    } catch (error) {
      this.isReloading = false;
      logger.HOT_RELOAD.error('热重启失败', { error: error.message });
      return false;
    }
  }

  _shutdownWorker(worker) {
    const workerId = worker.id;
    logger.HOT_RELOAD.info('正在关闭 Worker', { workerId });

    try {
      if (worker.isConnected()) {
        worker.send({ type: 'shutdown' });
      }
    } catch (e) {}

    const timeout = setTimeout(() => {
      if (worker.isConnected()) {
        logger.HOT_RELOAD.warn('Worker 未及时退出，强制终止', { workerId });
        worker.kill('SIGKILL');
      }
    }, this.gracefulShutdownTimeout);

    worker.once('exit', () => {
      clearTimeout(timeout);
      logger.HOT_RELOAD.info('Worker 已优雅关闭', { workerId });
    });
  }

  _gracefulShutdown() {
    logger.HOT_RELOAD.info('Worker 开始优雅关闭', { pid: process.pid });

    setTimeout(() => {
      process.exit(0);
    }, 5000);
  }

  _setupSignalHandlers() {
    process.on('SIGHUP', async () => {
      logger.HOT_RELOAD.info('收到 SIGHUP 信号，开始热重启');
      await this.reload();
    });

    process.on('SIGUSR2', async () => {
      logger.HOT_RELOAD.info('收到 SIGUSR2 信号，开始热重启');
      await this.reload();
    });
  }

  _handleWorkerMessage(worker, msg) {
    switch (msg.type) {
      case 'worker_ready':
        const info = this.workers.get(worker.id);
        if (info) {
          info.status = 'ready';
          info.pid = msg.pid;
        }
        break;
      case 'health_check':
        if (process.send) {
          process.send({
            type: 'health_response',
            workerId: worker.id,
            status: 'healthy',
            timestamp: Date.now()
          });
        }
        break;
    }
  }

  _handleMasterMessage(msg) {
    switch (msg.type) {
      case 'shutdown':
        this._gracefulShutdown();
        break;
      case 'health_check':
        if (process.send) {
          process.send({
            type: 'health_response',
            pid: process.pid,
            status: 'healthy',
            memory: process.memoryUsage(),
            timestamp: Date.now()
          });
        }
        break;
    }
  }

  _startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      for (const [workerId, info] of this.workers) {
        if (info.status === 'ready' && info.worker.isConnected()) {
          try {
            info.worker.send({ type: 'health_check' });
          } catch (e) {
            logger.HOT_RELOAD.warn('Worker 健康检查失败', { workerId });
          }
        }
      }
    }, 30000);
  }

  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  getWorkersStatus() {
    const status = [];
    for (const [workerId, info] of this.workers) {
      status.push({
        workerId,
        id: info.id,
        pid: info.worker.process.pid,
        status: info.status,
        startedAt: new Date(info.startedAt).toISOString(),
        isConnected: info.worker.isConnected(),
        isDead: info.worker.isDead()
      });
    }
    return status;
  }

  async triggerReload() {
    return this.reload();
  }

  shutdownAll() {
    logger.HOT_RELOAD.info('正在关闭所有 Worker');
    for (const [workerId, info] of this.workers) {
      this._shutdownWorker(info.worker);
    }
  }
}

const hotReloadManager = new HotReloadManager();

module.exports = {
  HotReloadManager,
  hotReloadManager,
  isMaster: cluster.isMaster,
  isWorker: cluster.isWorker
};
