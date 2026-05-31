const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class TaskQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.concurrency = options.concurrency || 5;
    this.rateLimit = options.rateLimit || 1000;
    this.maxRetries = options.maxRetries || 3;
    
    this.pending = [];
    this.active = new Map();
    this.completed = new Map();
    this.failed = new Map();
    
    this.isRunning = false;
    this.lastExecution = 0;
  }

  createTask(type, payload, options = {}) {
    return {
      id: uuidv4(),
      type,
      payload,
      priority: options.priority || 0,
      status: 'pending',
      retries: 0,
      maxRetries: options.maxRetries || this.maxRetries,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      metadata: options.metadata || {}
    };
  }

  add(task) {
    this.pending.push(task);
    this.sortPending();
    this.emit('task:added', task);
    
    if (!this.isRunning) {
      this.processQueue();
    }
    
    return task.id;
  }

  sortPending() {
    this.pending.sort((a, b) => b.priority - a.priority);
  }

  async processQueue() {
    if (this.isRunning) return;
    this.isRunning = true;

    while (this.pending.length > 0 && this.active.size < this.concurrency) {
      const now = Date.now();
      const timeSinceLast = now - this.lastExecution;
      
      if (timeSinceLast < this.rateLimit) {
        await this.delay(this.rateLimit - timeSinceLast);
      }

      const task = this.pending.shift();
      if (!task) break;

      this.executeTask(task);
      this.lastExecution = Date.now();
    }

    this.isRunning = false;

    if (this.pending.length > 0) {
      setTimeout(() => this.processQueue(), this.rateLimit);
    } else if (this.active.size === 0) {
      this.emit('queue:empty');
    }
  }

  async executeTask(task) {
    task.status = 'running';
    task.startedAt = Date.now();
    this.active.set(task.id, task);
    this.emit('task:start', task);

    try {
      const handler = this.getHandler(task.type);
      if (!handler) {
        throw new Error(`Unknown task type: ${task.type}`);
      }

      const result = await handler(task.payload, task);
      
      task.status = 'completed';
      task.result = result;
      task.completedAt = Date.now();
      
      this.completed.set(task.id, task);
      this.active.delete(task.id);
      
      this.emit('task:complete', task);
      
      return result;
    } catch (error) {
      task.retries++;
      task.error = error.message;
      
      if (task.retries < task.maxRetries) {
        task.status = 'pending';
        task.priority = Math.max(task.priority - 1, -10);
        this.pending.push(task);
        this.sortPending();
        this.active.delete(task.id);
        this.emit('task:retry', task);
      } else {
        task.status = 'failed';
        task.completedAt = Date.now();
        this.failed.set(task.id, task);
        this.active.delete(task.id);
        this.emit('task:fail', task);
      }
    } finally {
      if (!this.isRunning) {
        this.processQueue();
      }
    }
  }

  getHandler(type) {
    return this.handlers[type];
  }

  registerHandler(type, handler) {
    this.handlers[type] = handler;
  }

  getStatus(taskId) {
    return this.active.get(taskId) || 
           this.completed.get(taskId) || 
           this.failed.get(taskId);
  }

  getStats() {
    return {
      pending: this.pending.length,
      active: this.active.size,
      completed: this.completed.size,
      failed: this.failed.size,
      concurrency: this.concurrency,
      isRunning: this.isRunning
    };
  }

  cancelTask(taskId) {
    const pendingIndex = this.pending.findIndex(t => t.id === taskId);
    if (pendingIndex !== -1) {
      this.pending.splice(pendingIndex, 1);
      return true;
    }
    return false;
  }

  clearCompleted() {
    this.completed.clear();
    this.failed.clear();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const crawlQueue = new TaskQueue({ concurrency: 3, rateLimit: 800 });

crawlQueue.handlers = {
  search: async (payload, task) => {
    const { source, query, options } = payload;
    const crawler = task.metadata.crawler;
    
    if (crawler && typeof crawler.search) {
      return await crawler.search(query, options);
    }
    return [];
  },
  detail: async (payload, task) => {
    const { source, id, options } = payload;
    const crawler = task.metadata.crawler;
    
    if (crawler && typeof crawler.getDetail) {
      return await crawler.getDetail(id, options);
    }
    return null;
  }
};

module.exports = {
  TaskQueue,
  crawlQueue
};
