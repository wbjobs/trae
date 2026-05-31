const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
const RECORDING_RETENTION_DAYS = 7;
const MAX_RECORDING_SIZE = 50 * 1024 * 1024;

class Recorder {
  constructor(recordingId, options = {}) {
    this.id = recordingId;
    this.title = options.title || `Recording ${recordingId.substring(0, 8)}`;
    this.width = options.width || 80;
    this.height = options.height || 24;
    this.startTime = Date.now();
    this.events = [];
    this.lastEventTime = this.startTime;
    this.isRecording = true;
    this.size = 0;
    this.filePath = path.join(RECORDINGS_DIR, `${recordingId}.cast`);
    this.writeStream = null;
    this.eventCount = 0;
  }

  start() {
    if (!fs.existsSync(RECORDINGS_DIR)) {
      fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
    }

    this.writeStream = fs.createWriteStream(this.filePath, { flags: 'a' });

    const header = {
      version: 2,
      width: this.width,
      height: this.height,
      timestamp: Math.floor(this.startTime / 1000),
      title: this.title,
      env: {
        TERM: 'xterm-256color',
        SHELL: '/bin/sh',
      },
    };

    this.writeStream.write(JSON.stringify(header) + '\n');
    this.size += JSON.stringify(header).length + 1;

    return this;
  }

  recordOutput(data) {
    if (!this.isRecording) return;

    const time = (Date.now() - this.startTime) / 1000;
    const event = [time, 'o', data];
    const eventStr = JSON.stringify(event);

    if (this.size + eventStr.length > MAX_RECORDING_SIZE) {
      this.stop();
      return;
    }

    if (this.writeStream && this.writeStream.writable) {
      this.writeStream.write(eventStr + '\n');
      this.size += eventStr.length + 1;
      this.eventCount++;
    }
  }

  recordInput(data) {
    if (!this.isRecording) return;

    const time = (Date.now() - this.startTime) / 1000;
    const event = [time, 'i', data];
    const eventStr = JSON.stringify(event);

    if (this.size + eventStr.length > MAX_RECORDING_SIZE) {
      this.stop();
      return;
    }

    if (this.writeStream && this.writeStream.writable) {
      this.writeStream.write(eventStr + '\n');
      this.size += eventStr.length + 1;
      this.eventCount++;
    }
  }

  recordResize(width, height) {
    if (!this.isRecording) return;

    this.width = width;
    this.height = height;

    const time = (Date.now() - this.startTime) / 1000;
    const event = [time, 'r', `${width}x${height}`];
    const eventStr = JSON.stringify(event);

    if (this.writeStream && this.writeStream.writable) {
      this.writeStream.write(eventStr + '\n');
      this.size += eventStr.length + 1;
      this.eventCount++;
    }
  }

  stop() {
    if (!this.isRecording) return;

    this.isRecording = false;

    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }

    const duration = (Date.now() - this.startTime) / 1000;

    return {
      id: this.id,
      title: this.title,
      duration,
      size: this.size,
      eventCount: this.eventCount,
      createdAt: this.startTime,
      width: this.width,
      height: this.height,
    };
  }

  getMetadata() {
    const duration = this.isRecording
      ? (Date.now() - this.startTime) / 1000
      : this.events.length > 0
        ? this.events[this.events.length - 1][0]
        : 0;

    return {
      id: this.id,
      title: this.title,
      duration,
      size: this.size,
      eventCount: this.eventCount,
      createdAt: this.startTime,
      width: this.width,
      height: this.height,
      isRecording: this.isRecording,
    };
  }
}

class RecordingManager {
  constructor() {
    this.activeRecorders = new Map();
    this.recordingsMetadata = new Map();
    this.loadExistingRecordings();
    this.startCleanupInterval();
  }

  loadExistingRecordings() {
    if (!fs.existsSync(RECORDINGS_DIR)) return;

    const files = fs.readdirSync(RECORDINGS_DIR).filter(f => f.endsWith('.cast'));

    for (const file of files) {
      try {
        const id = path.basename(file, '.cast');
        const filePath = path.join(RECORDINGS_DIR, file);
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        if (lines.length > 0) {
          const header = JSON.parse(lines[0]);
          const duration = lines.length > 1
            ? parseFloat(JSON.parse(lines[lines.length - 2])[0])
            : 0;

          this.recordingsMetadata.set(id, {
            id,
            title: header.title || `Recording ${id.substring(0, 8)}`,
            duration,
            size: stat.size,
            eventCount: Math.max(0, lines.length - 1),
            createdAt: stat.birthtimeMs,
            width: header.width || 80,
            height: header.height || 24,
            isRecording: false,
          });
        }
      } catch (err) {
        console.error(`Failed to load recording ${file}:`, err);
      }
    }
  }

  startRecording(options = {}) {
    const id = uuidv4();
    const recorder = new Recorder(id, options);
    recorder.start();

    this.activeRecorders.set(id, recorder);
    this.recordingsMetadata.set(id, recorder.getMetadata());

    return recorder;
  }

  stopRecording(id) {
    const recorder = this.activeRecorders.get(id);
    if (!recorder) return null;

    const metadata = recorder.stop();
    this.activeRecorders.delete(id);

    if (metadata) {
      this.recordingsMetadata.set(id, metadata);
    }

    return metadata;
  }

  recordOutput(id, data) {
    const recorder = this.activeRecorders.get(id);
    if (recorder) {
      recorder.recordOutput(data);
    }
  }

  recordInput(id, data) {
    const recorder = this.activeRecorders.get(id);
    if (recorder) {
      recorder.recordInput(data);
    }
  }

  recordResize(id, width, height) {
    const recorder = this.activeRecorders.get(id);
    if (recorder) {
      recorder.recordResize(width, height);
    }
  }

  isRecording(id) {
    return this.activeRecorders.has(id);
  }

  getRecording(id) {
    return this.recordingsMetadata.get(id);
  }

  getAllRecordings() {
    return Array.from(this.recordingsMetadata.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getRecordingContent(id) {
    const filePath = path.join(RECORDINGS_DIR, `${id}.cast`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    return fs.readFileSync(filePath, 'utf-8');
  }

  deleteRecording(id) {
    const filePath = path.join(RECORDINGS_DIR, `${id}.cast`);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    this.recordingsMetadata.delete(id);

    if (this.activeRecorders.has(id)) {
      const recorder = this.activeRecorders.get(id);
      recorder.stop();
      this.activeRecorders.delete(id);
    }

    return true;
  }

  cleanupOldRecordings() {
    const now = Date.now();
    const maxAge = RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    for (const [id, metadata] of this.recordingsMetadata.entries()) {
      if (now - metadata.createdAt > maxAge && !metadata.isRecording) {
        this.deleteRecording(id);
        console.log(`Cleaned up old recording: ${id}`);
      }
    }
  }

  startCleanupInterval() {
    setInterval(() => {
      this.cleanupOldRecordings();
    }, 24 * 60 * 60 * 1000);
  }
}

const manager = new RecordingManager();

module.exports = {
  startRecording: (options) => manager.startRecording(options),
  stopRecording: (id) => manager.stopRecording(id),
  recordOutput: (id, data) => manager.recordOutput(id, data),
  recordInput: (id, data) => manager.recordInput(id, data),
  recordResize: (id, width, height) => manager.recordResize(id, width, height),
  isRecording: (id) => manager.isRecording(id),
  getRecording: (id) => manager.getRecording(id),
  getAllRecordings: () => manager.getAllRecordings(),
  getRecordingContent: (id) => manager.getRecordingContent(id),
  deleteRecording: (id) => manager.deleteRecording(id),
  RECORDING_RETENTION_DAYS,
};
