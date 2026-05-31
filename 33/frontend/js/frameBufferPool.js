export class FrameBufferPool {
    constructor(maxSize = 50) {
        this.pool = [];
        this.maxSize = maxSize;
        this.currentIndex = 0;
        this.processingIndex = 0;
        this.lock = false;
        this.listeners = new Map();
    }

    addFrame(frame) {
        if (this.pool.length >= this.maxSize) {
            const oldFrame = this.pool.shift();
            if (oldFrame && oldFrame.url) {
                URL.revokeObjectURL(oldFrame.url);
            }
        }
        this.pool.push(frame);
        this.notify('frameAdded', frame);
        return frame;
    }

    addFrames(frames) {
        frames.forEach(frame => this.addFrame(frame));
    }

    getFrame(index) {
        return this.pool[index] || null;
    }

    getNextFrame() {
        if (this.currentIndex < this.pool.length) {
            return this.pool[this.currentIndex++];
        }
        return null;
    }

    getNextUnprocessedFrame() {
        if (this.processingIndex < this.pool.length) {
            return {
                frame: this.pool[this.processingIndex],
                index: this.processingIndex++
            };
        }
        return null;
    }

    markProcessed(index, processedData) {
        if (this.pool[index]) {
            this.pool[index].processed = true;
            this.pool[index].processedData = processedData;
            this.notify('frameProcessed', { index, processedData });
        }
    }

    getAllFrames() {
        return [...this.pool];
    }

    getProcessedFrames() {
        return this.pool.filter(f => f.processed);
    }

    getUnprocessedFrames() {
        return this.pool.filter(f => !f.processed);
    }

    size() {
        return this.pool.length;
    }

    processedCount() {
        return this.pool.filter(f => f.processed).length;
    }

    remainingCount() {
        return this.pool.length - this.processingIndex;
    }

    reset() {
        this.pool.forEach(frame => {
            if (frame.url) URL.revokeObjectURL(frame.url);
            if (frame.processedUrl) URL.revokeObjectURL(frame.processedUrl);
        });
        this.pool = [];
        this.currentIndex = 0;
        this.processingIndex = 0;
        this.notify('reset');
    }

    clear() {
        this.reset();
        this.listeners.clear();
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    notify(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }

    async processFramesInParallel(processor, workerCount = 4) {
        const workers = [];
        const results = [];
        
        for (let i = 0; i < workerCount; i++) {
            const worker = new Worker('./workers/frameProcessor.worker.js', { type: 'module' });
            workers.push(worker);
            
            worker.onmessage = (e) => {
                const { type, index, result, error } = e.data;
                
                if (type === 'processComplete') {
                    this.markProcessed(index, result);
                    results.push({ index, result });
                    
                    const next = this.getNextUnprocessedFrame();
                    if (next && next.frame) {
                        worker.postMessage({
                            type: 'process',
                            frame: next.frame,
                            index: next.index,
                            processor: processor
                        }, [next.frame.blob]);
                    } else {
                        worker.terminate();
                    }
                } else if (type === 'error') {
                    console.error('Worker error:', error);
                    worker.terminate();
                }
            };
        }

        for (let i = 0; i < Math.min(workerCount, this.remainingCount()); i++) {
            const next = this.getNextUnprocessedFrame();
            if (next && next.frame) {
                workers[i].postMessage({
                    type: 'process',
                    frame: next.frame,
                    index: next.index,
                    processor: processor
                });
            }
        }

        return new Promise((resolve) => {
            const checkComplete = setInterval(() => {
                if (this.processedCount() >= this.size() || 
                    this.remainingCount() === 0) {
                    clearInterval(checkComplete);
                    workers.forEach(w => {
                        try { w.terminate(); } catch (e) {}
                    });
                    resolve(results);
                }
            }, 100);
        });
    }

    setMaxSize(size) {
        this.maxSize = size;
        while (this.pool.length > this.maxSize) {
            const oldFrame = this.pool.shift();
            if (oldFrame && oldFrame.url) {
                URL.revokeObjectURL(oldFrame.url);
            }
        }
    }
}
