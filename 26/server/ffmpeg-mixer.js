const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class FFmpegMixer extends EventEmitter {
  constructor(outputDir) {
    super();
    this.outputDir = outputDir || path.join(__dirname, 'recordings');
    this.streams = new Map();
    this.ffmpegProcess = null;
    this.outputPath = null;
    this.isRecording = false;
    this.currentLayout = '2x2';
    this.startTime = null;
    this.activeSpeakerId = null;
    this.activeSpeakerName = null;
    this.watermarkFile = null;
    
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  addStream(streamId) {
    if (!this.streams.has(streamId)) {
      this.streams.set(streamId, {
        id: streamId,
        buffer: [],
        lastData: null,
        writer: null,
        firstPacketTime: null,
        packetCount: 0
      });
      console.log(`[FFmpegMixer] Stream added: ${streamId}`);
    }
  }

  removeStream(streamId) {
    if (this.streams.has(streamId)) {
      const stream = this.streams.get(streamId);
      if (stream.writer) {
        try {
          stream.writer.end();
        } catch (e) {
        }
      }
      this.streams.delete(streamId);
      console.log(`[FFmpegMixer] Stream removed: ${streamId}`);
    }
  }

  writeData(streamId, data) {
    const stream = this.streams.get(streamId);
    if (stream) {
      const now = Date.now();
      if (!stream.firstPacketTime) {
        stream.firstPacketTime = now;
      }
      stream.lastData = now;
      stream.packetCount++;
      
      if (this.isRecording && stream.writer) {
        try {
          stream.writer.write(data);
        } catch (e) {
          console.error('[FFmpegMixer] Error writing to stream:', streamId, e.message);
        }
      } else {
        stream.buffer.push(data);
        if (stream.buffer.length > 1000) {
          stream.buffer.shift();
        }
      }
    }
  }

  updateActiveSpeaker(speakerId, speakerName) {
    this.activeSpeakerId = speakerId;
    this.activeSpeakerName = speakerName;
    
    if (this.watermarkFile) {
      const text = speakerName ? `Speaking: ${speakerName}` : '';
      try {
        fs.writeFileSync(this.watermarkFile, text);
      } catch (e) {
        console.error('[FFmpegMixer] Error writing watermark file:', e.message);
      }
    }
    
    console.log(`[FFmpegMixer] Active speaker updated: ${speakerName || 'none'}`);
  }

  buildFilterComplex(streamCount, layoutConfig) {
    const { width, height, cols, rows } = layoutConfig;
    const cellWidth = Math.floor(width / cols);
    const cellHeight = Math.floor(height / rows);
    
    let filter = '';
    
    for (let i = 0; i < streamCount; i++) {
      filter += `[${i}:v]scale=${cellWidth}:${cellHeight},fps=30,setpts=PTS-STARTPTS[v${i}];`;
    }
    
    if (streamCount > 0) {
      filter += `[v0]`;
      for (let i = 1; i < streamCount; i++) {
        filter += `[v${i}]`;
      }
      filter += `xstack=inputs=${streamCount}:layout=`;
      
      const layouts = [];
      for (let i = 0; i < streamCount; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        layouts.push(`${col * cellWidth}_${row * cellHeight}`);
      }
      filter += layouts.join('|');
      filter += `[stacked];`;
      
      filter += `[stacked]drawtext=textfile=${this.watermarkFile}:fontsize=28:fontcolor=white:x=20:y=20:box=1:boxcolor=black@0.6:borderw=2:bordercolor=white@0.5:reload=1[watermarked];`;
      filter += `[watermarked]fps=30,setpts=PTS-STARTPTS[out]`;
    }
    
    return filter;
  }

  startMixing(layout = '2x2') {
    if (this.isRecording) {
      console.log('[FFmpegMixer] Already recording');
      return false;
    }

    const streamCount = this.streams.size;
    if (streamCount === 0) {
      console.log('[FFmpegMixer] No streams to mix');
      return false;
    }

    this.currentLayout = layout;
    this.startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.outputPath = path.join(this.outputDir, `mixed-${timestamp}.mp4`);
    
    this.watermarkFile = path.join(this.outputDir, `watermark-${timestamp}.txt`);
    fs.writeFileSync(this.watermarkFile, '');
    
    const layoutConfig = this.getLayoutConfig(layout, streamCount);
    const { width, height } = layoutConfig;
    
    const streamIds = Array.from(this.streams.keys());
    
    const args = [
      '-y',
      '-fflags', '+genpts+igndts+flush_packets+nobuffer',
      '-avioflags', 'direct',
      '-analyzeduration', '500000',
      '-probesize', '500000',
      '-rtbufsize', '100M'
    ];
    
    streamIds.forEach((id, index) => {
      const stream = this.streams.get(id);
      if (stream && stream.firstPacketTime && this.startTime) {
        const offset = (this.startTime - stream.firstPacketTime) / 1000;
        if (offset > 0) {
          args.push('-itsoffset', offset.toString());
        }
      }
      args.push('-f', 'webm');
      args.push('-i', `pipe:${index}`);
    });
    
    args.push('-filter_complex', this.buildFilterComplex(streamCount, layoutConfig));
    
    args.push(
      '-map', '[out]',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '23',
      '-r', '30',
      '-s', `${width}x${height}`,
      '-pix_fmt', 'yuv420p',
      '-async', '1000',
      '-vsync', '1',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-movflags', '+faststart+empty_moov',
      '-max_muxing_queue_size', '9999',
      '-bufsize', '50M',
      this.outputPath
    );

    console.log('[FFmpegMixer] Starting FFmpeg with args:', args.join(' '));
    
    const stdio = ['pipe', 'pipe', 'pipe'];
    for (let i = 0; i < streamCount; i++) {
      stdio.push('pipe');
    }
    
    this.ffmpegProcess = spawn('ffmpeg', args, {
      stdio: stdio
    });

    streamIds.forEach((id, index) => {
      const stream = this.streams.get(id);
      stream.writer = this.ffmpegProcess.stdio[3 + index];
      
      stream.buffer.forEach(data => {
        try {
          stream.writer.write(data);
        } catch (e) {}
      });
      stream.buffer = [];
    });

    this.ffmpegProcess.on('error', (err) => {
      console.error('[FFmpegMixer] FFmpeg error:', err);
      this.isRecording = false;
      this.cleanupWatermarkFile();
      this.emit('error', err);
    });

    this.ffmpegProcess.on('exit', (code, signal) => {
      console.log(`[FFmpegMixer] FFmpeg exited with code ${code}, signal ${signal}`);
      this.isRecording = false;
      
      this.streams.forEach(stream => {
        if (stream.writer) {
          try {
            stream.writer = null;
          } catch (e) {}
        }
      });
      
      this.cleanupWatermarkFile();
      
      if (code === 0) {
        this.emit('finished', this.outputPath);
      } else {
        this.emit('error', new Error(`FFmpeg exited with code ${code}`));
      }
    });

    this.ffmpegProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('error') || msg.includes('Error')) {
        console.error(`[FFmpegMixer] ${msg}`);
      } else if (msg.includes('frame=')) {
        console.log(`[FFmpegMixer] ${msg.trim()}`);
      }
    });

    this.ffmpegProcess.stdout.on('data', (data) => {
    });

    this.isRecording = true;
    this.emit('started', this.outputPath);
    return true;
  }

  cleanupWatermarkFile() {
    if (this.watermarkFile && fs.existsSync(this.watermarkFile)) {
      try {
        fs.unlinkSync(this.watermarkFile);
      } catch (e) {
        console.error('[FFmpegMixer] Error deleting watermark file:', e.message);
      }
      this.watermarkFile = null;
    }
  }

  stopMixing() {
    if (!this.isRecording || !this.ffmpegProcess) {
      return false;
    }

    console.log('[FFmpegMixer] Stopping FFmpeg...');
    
    this.streams.forEach(stream => {
      if (stream.writer) {
        try {
          stream.writer.end();
        } catch (e) {}
      }
    });

    setTimeout(() => {
      if (this.ffmpegProcess && this.ffmpegProcess.pid) {
        this.ffmpegProcess.kill('SIGINT');
      }
    }, 5000);

    this.isRecording = false;
    return true;
  }

  getLayoutConfig(layout, streamCount) {
    const layouts = {
      '1x1': { width: 1280, height: 720, cols: 1, rows: 1 },
      '2x2': { width: 1280, height: 720, cols: 2, rows: 2 },
      '3x3': { width: 1920, height: 1080, cols: 3, rows: 3 },
      '1x2': { width: 1280, height: 720, cols: 2, rows: 1 },
      '2x1': { width: 1280, height: 720, cols: 1, rows: 2 }
    };
    return layouts[layout] || layouts['2x2'];
  }

  getOutputPath() {
    return this.outputPath;
  }

  getStreamCount() {
    return this.streams.size;
  }

  destroy() {
    this.stopMixing();
    this.streams.clear();
    this.cleanupWatermarkFile();
  }
}

module.exports = FFmpegMixer;
