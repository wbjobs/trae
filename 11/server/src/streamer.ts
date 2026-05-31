import { ChildProcess, spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { AudioAnalyzer, DriftDetectionResult } from './audioAnalyzer';

export interface VideoChunk {
  type: 'video';
  data: Buffer;
  pts: number;
  dts: number;
  isKeyFrame: boolean;
}

export interface SubtitleChunk {
  type: 'subtitle';
  data: string;
  pts: number;
  duration: number;
}

export interface DriftEvent {
  type: 'drift';
  result: DriftDetectionResult;
}

export interface StreamConfig {
  videoPath: string;
  fps: number;
  bitrate: string;
}

const AUDIO_SAMPLE_RATE = 44100;
const AUDIO_CHANNELS = 2;

export class VideoStreamer extends EventEmitter {
  private process: ChildProcess | null = null;
  private audioProcess: ChildProcess | null = null;
  private running = false;
  private config: StreamConfig;
  private startTime: number = 0;
  private audioAnalyzer: AudioAnalyzer;
  private driftCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: StreamConfig) {
    super();
    this.config = config;
    this.audioAnalyzer = new AudioAnalyzer({
      driftThresholdMs: 80,
      analysisIntervalMs: 30000
    });

    if (!fs.existsSync(config.videoPath)) {
      throw new Error(`Video file not found: ${config.videoPath}`);
    }
  }

  start(): void {
    if (this.running) return;

    this.running = true;
    this.startTime = Date.now();
    this.audioAnalyzer.reset();

    const args = [
      '-re',
      '-i', this.config.videoPath,
      '-an',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-b:v', this.config.bitrate,
      '-r', this.config.fps.toString(),
      '-g', (this.config.fps * 2).toString(),
      '-keyint_min', this.config.fps.toString(),
      '-pix_fmt', 'yuv420p',
      '-f', 'h264',
      '-bsf:v', 'h264_mp4toannexb',
      '-'
    ];

    this.process = spawn(ffmpegPath as string, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let buffer = Buffer.alloc(0);
    const NAL_START = Buffer.from([0x00, 0x00, 0x00, 0x01]);

    this.process.stdout?.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (true) {
        const startIdx = buffer.indexOf(NAL_START);
        if (startIdx === -1) break;

        const nextStartIdx = buffer.indexOf(NAL_START, startIdx + 4);
        if (nextStartIdx === -1) break;

        const nalUnit = buffer.slice(startIdx, nextStartIdx);
        buffer = buffer.slice(nextStartIdx);

        const isKeyFrame = this.isKeyFrame(nalUnit);
        const now = Date.now();
        const pts = (now - this.startTime) / 1000;

        const videoChunk: VideoChunk = {
          type: 'video',
          data: nalUnit,
          pts,
          dts: pts,
          isKeyFrame
        };

        this.emit('video', videoChunk);
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.log('[ffmpeg-video]', data.toString().trim());
    });

    this.process.on('close', (code) => {
      console.log(`FFmpeg video exited with code ${code}`);
      this.stop();
    });

    this.startAudioExtraction();
    this.startSubtitleExtraction();
    this.startDriftCheck();
  }

  private startAudioExtraction(): void {
    const audioArgs = [
      '-re',
      '-i', this.config.videoPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', AUDIO_SAMPLE_RATE.toString(),
      '-ac', AUDIO_CHANNELS.toString(),
      '-f', 's16le',
      '-'
    ];

    this.audioProcess = spawn(ffmpegPath as string, audioArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let audioStartTime = Date.now();

    this.audioProcess.stdout?.on('data', (chunk: Buffer) => {
      const now = Date.now();
      const pts = (now - audioStartTime) / 1000;
      this.audioAnalyzer.processAudioChunk(chunk, pts);
    });

    this.audioProcess.stderr?.on('data', (data: Buffer) => {
      console.log('[ffmpeg-audio]', data.toString().trim());
    });

    this.audioProcess.on('close', (code) => {
      console.log(`FFmpeg audio exited with code ${code}`);
    });
  }

  private startDriftCheck(): void {
    this.driftCheckTimer = setInterval(() => {
      if (!this.running) return;

      const result = this.audioAnalyzer.checkDrift(Date.now());
      if (result) {
        if (Math.abs(result.driftMs) > 80) {
          const driftEvent: DriftEvent = {
            type: 'drift',
            result
          };
          this.emit('drift', driftEvent);
          console.log(
            `[VideoStreamer] Drift detected: ${result.driftMs}ms, confidence: ${(result.confidence * 100).toFixed(1)}%`
          );
        }
      }
    }, 5000);
  }

  private isKeyFrame(nalUnit: Buffer): boolean {
    if (nalUnit.length < 5) return false;
    const nalType = nalUnit[4] & 0x1F;
    return nalType === 5;
  }

  private startSubtitleExtraction(): void {
    const subtitleArgs = [
      '-i', this.config.videoPath,
      '-map', '0:s:0',
      '-f', 'srt',
      '-'
    ];

    const subtitleProcess = spawn(ffmpegPath as string, subtitleArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let subtitleBuffer = '';
    subtitleProcess.stdout?.on('data', (chunk: Buffer) => {
      subtitleBuffer += chunk.toString('utf8');
      this.parseSubtitles(subtitleBuffer);
    });

    subtitleProcess.stderr?.on('data', (data: Buffer) => {
      console.log('[ffmpeg-subtitle]', data.toString().trim());
    });
  }

  private parseSubtitles(data: string): void {
    const blocks = data.split(/\n\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 3) continue;

      const timeLine = lines[1];
      const timeMatch = timeLine.match(
        /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
      );

      if (!timeMatch) continue;

      const startTime =
        parseInt(timeMatch[1]) * 3600 +
        parseInt(timeMatch[2]) * 60 +
        parseInt(timeMatch[3]) +
        parseInt(timeMatch[4]) / 1000;

      const endTime =
        parseInt(timeMatch[5]) * 3600 +
        parseInt(timeMatch[6]) * 60 +
        parseInt(timeMatch[7]) +
        parseInt(timeMatch[8]) / 1000;

      const text = lines.slice(2).join('\n').trim();
      if (!text) continue;

      const subtitleChunk: SubtitleChunk = {
        type: 'subtitle',
        data: text,
        pts: startTime,
        duration: endTime - startTime
      };

      this.audioAnalyzer.addSubtitleSegment(subtitleChunk);
      this.scheduleSubtitle(subtitleChunk, startTime);
    }
  }

  private scheduleSubtitle(chunk: SubtitleChunk, delaySec: number): void {
    setTimeout(() => {
      if (this.running) {
        this.emit('subtitle', chunk);
      }
    }, delaySec * 1000);
  }

  stop(): void {
    this.running = false;

    if (this.driftCheckTimer) {
      clearInterval(this.driftCheckTimer);
      this.driftCheckTimer = null;
    }

    if (this.process) {
      try {
        this.process.kill('SIGKILL');
      } catch (e) {}
      this.process = null;
    }

    if (this.audioProcess) {
      try {
        this.audioProcess.kill('SIGKILL');
      } catch (e) {}
      this.audioProcess = null;
    }

    this.emit('end');
  }

  isRunning(): boolean {
    return this.running;
  }

  getAudioAnalyzer(): AudioAnalyzer {
    return this.audioAnalyzer;
  }
}

export function getVideoFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];

  const files = fs.readdirSync(directory);
  return files.filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return ['.mp4', '.mov', '.mkv', '.avi'].includes(ext);
  });
}
