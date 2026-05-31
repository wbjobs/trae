const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ReplayRecorder {
  constructor(options = {}) {
    this.recording = false;
    this.frames = [];
    this.events = [];
    this.metadata = null;
    this.startTime = null;
    this.lastFrameTime = null;
    this.frameInterval = options.frameInterval || 100;
    this.maxFrames = options.maxFrames || 10000;
    this.compressionEnabled = options.compressionEnabled !== false;
    this.saveDir = options.saveDir || path.join(process.cwd(), 'data', 'replays');
    this.ensureSaveDir();
  }

  ensureSaveDir() {
    if (!fs.existsSync(this.saveDir)) {
      fs.mkdirSync(this.saveDir, { recursive: true });
    }
  }

  start(metadata = {}) {
    this.recording = true;
    this.frames = [];
    this.events = [];
    this.startTime = Date.now();
    this.lastFrameTime = this.startTime;
    this.metadata = {
      id: uuidv4(),
      startTime: this.startTime,
      ...metadata
    };
    return this.metadata.id;
  }

  stop() {
    this.recording = false;
    const endTime = Date.now();
    return {
      id: this.metadata.id,
      startTime: this.startTime,
      endTime,
      duration: endTime - this.startTime,
      frameCount: this.frames.length,
      eventCount: this.events.length
    };
  }

  recordFrame(state) {
    if (!this.recording) return false;
    const now = Date.now();
    if (now - this.lastFrameTime < this.frameInterval) {
      return false;
    }
    if (this.frames.length >= this.maxFrames) {
      this.stop();
      return false;
    }
    const frame = {
      t: now - this.startTime,
      s: this.compressState(state)
    };
    this.frames.push(frame);
    this.lastFrameTime = now;
    return true;
  }

  recordEvent(event) {
    if (!this.recording) return false;
    this.events.push({
      t: Date.now() - this.startTime,
      ...event
    });
    return true;
  }

  compressState(state) {
    if (!this.compressionEnabled) return state;
    return state;
  }

  getReplayData() {
    return {
      version: '1.0',
      metadata: {
        ...this.metadata,
        endTime: Date.now(),
        duration: Date.now() - this.startTime,
        frameCount: this.frames.length,
        eventCount: this.events.length,
        frameInterval: this.frameInterval
      },
      frames: this.frames,
      events: this.events
    };
  }

  saveToFile(filename) {
    const data = this.getReplayData();
    const filePath = path.join(this.saveDir, filename || `${data.metadata.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return filePath;
  }

  getStats() {
    return {
      recording: this.recording,
      frameCount: this.frames.length,
      eventCount: this.events.length,
      elapsedTime: this.startTime ? Date.now() - this.startTime : 0,
      estimatedSize: JSON.stringify(this.getReplayData()).length
    };
  }
}

class ReplayPlayer {
  constructor(replayData) {
    this.replayData = replayData;
    this.frames = replayData.frames || [];
    this.events = replayData.events || [];
    this.metadata = replayData.metadata || {};
    this.currentTime = 0;
    this.currentFrameIndex = 0;
    this.playing = false;
    this.playbackRate = 1;
    this.playTimer = null;
    this.onFrameCallback = null;
    this.onEventCallback = null;
    this.onEndCallback = null;
    this.lastEventIndex = 0;
  }

  static loadFromFile(filePath) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return new ReplayPlayer(data);
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    const frameInterval = this.metadata.frameInterval || 100;
    const actualInterval = frameInterval / this.playbackRate;
    this.playTimer = setInterval(() => {
      this.tick(actualInterval);
    }, actualInterval);
  }

  pause() {
    this.playing = false;
    if (this.playTimer) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
  }

  stop() {
    this.pause();
    this.currentTime = 0;
    this.currentFrameIndex = 0;
    this.lastEventIndex = 0;
  }

  seek(timeMs) {
    this.currentTime = Math.max(0, Math.min(this.getDuration(), timeMs));
    this.currentFrameIndex = this.findFrameIndex(this.currentTime);
    this.lastEventIndex = this.findEventIndex(this.currentTime);
    this.emitCurrentFrame();
    this.emitEventsUntil(this.currentTime);
  }

  tick(deltaTime) {
    this.currentTime += deltaTime;
    if (this.currentTime >= this.getDuration()) {
      this.currentTime = this.getDuration();
      this.emitCurrentFrame();
      this.emitEventsUntil(this.currentTime);
      this.stop();
      if (this.onEndCallback) {
        this.onEndCallback();
      }
      return;
    }
    const targetFrameIndex = this.findFrameIndex(this.currentTime);
    if (targetFrameIndex !== this.currentFrameIndex) {
      this.currentFrameIndex = targetFrameIndex;
      this.emitCurrentFrame();
    }
    this.emitEventsUntil(this.currentTime);
  }

  emitCurrentFrame() {
    if (this.onFrameCallback && this.currentFrameIndex < this.frames.length) {
      const frame = this.frames[this.currentFrameIndex];
      this.onFrameCallback(frame.t, frame.s);
    }
  }

  emitEventsUntil(timeMs) {
    if (!this.onEventCallback) return;
    while (this.lastEventIndex < this.events.length) {
      const event = this.events[this.lastEventIndex];
      if (event.t <= timeMs) {
        this.onEventCallback(event.t, event);
        this.lastEventIndex++;
      } else {
        break;
      }
    }
  }

  findFrameIndex(timeMs) {
    let low = 0;
    let high = this.frames.length - 1;
    let result = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.frames[mid].t <= timeMs) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return result;
  }

  findEventIndex(timeMs) {
    let low = 0;
    let high = this.events.length - 1;
    let result = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.events[mid].t <= timeMs) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return result;
  }

  getDuration() {
    if (this.frames.length === 0) return 0;
    return this.frames[this.frames.length - 1].t;
  }

  setPlaybackRate(rate) {
    this.playbackRate = Math.max(0.1, Math.min(10, rate));
    if (this.playing) {
      this.pause();
      this.play();
    }
  }

  onFrame(callback) {
    this.onFrameCallback = callback;
  }

  onEvent(callback) {
    this.onEventCallback = callback;
  }

  onEnd(callback) {
    this.onEndCallback = callback;
  }

  getCurrentState() {
    if (this.currentFrameIndex < this.frames.length) {
      return this.frames[this.currentFrameIndex].s;
    }
    return null;
  }

  getEvents() {
    return this.events;
  }

  getFrames() {
    return this.frames;
  }

  getMetadata() {
    return this.metadata;
  }

  getProgress() {
    const duration = this.getDuration();
    return duration > 0 ? (this.currentTime / duration) * 100 : 0;
  }

  isPlaying() {
    return this.playing;
  }
}

class ReplayManager {
  constructor(options = {}) {
    this.recorders = new Map();
    this.saveDir = options.saveDir || path.join(process.cwd(), 'data', 'replays');
  }

  createRecorder(gameId, options = {}) {
    const recorder = new ReplayRecorder({ ...options, saveDir: this.saveDir });
    this.recorders.set(gameId, recorder);
    return recorder;
  }

  getRecorder(gameId) {
    return this.recorders.get(gameId) || null;
  }

  removeRecorder(gameId) {
    const recorder = this.recorders.get(gameId);
    if (recorder && recorder.recording) {
      recorder.stop();
    }
    this.recorders.delete(gameId);
  }

  startRecording(gameId, metadata = {}) {
    const recorder = this.getRecorder(gameId) || this.createRecorder(gameId);
    return recorder.start(metadata);
  }

  stopRecording(gameId, save = true) {
    const recorder = this.getRecorder(gameId);
    if (!recorder) return null;
    const result = recorder.stop();
    if (save) {
      recorder.saveToFile();
    }
    this.removeRecorder(gameId);
    return result;
  }

  recordFrame(gameId, state) {
    const recorder = this.getRecorder(gameId);
    if (recorder) {
      return recorder.recordFrame(state);
    }
    return false;
  }

  recordEvent(gameId, event) {
    const recorder = this.getRecorder(gameId);
    if (recorder) {
      return recorder.recordEvent(event);
    }
    return false;
  }

  getReplayList() {
    if (!fs.existsSync(this.saveDir)) {
      return [];
    }
    const files = fs.readdirSync(this.saveDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(this.saveDir, f);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          return {
            id: data.metadata?.id || f.replace('.json', ''),
            filename: f,
            startTime: data.metadata?.startTime || 0,
            duration: data.metadata?.duration || 0,
            frameCount: data.metadata?.frameCount || 0,
            eventCount: data.metadata?.eventCount || 0,
            size: fs.statSync(filePath).size
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.startTime - a.startTime);
    return files;
  }

  loadReplay(filename) {
    const filePath = path.join(this.saveDir, filename);
    return ReplayPlayer.loadFromFile(filePath);
  }

  deleteReplay(filename) {
    const filePath = path.join(this.saveDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }
}

module.exports = { ReplayRecorder, ReplayPlayer, ReplayManager };
