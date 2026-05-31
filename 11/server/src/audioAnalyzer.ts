import { SubtitleChunk } from './streamer';

const SAMPLE_RATE = 44100;
const FRAME_SIZE = 1024;
const ZCR_THRESHOLD = 0.1;
const ENERGY_THRESHOLD = 0.01;
const MIN_SPEECH_DURATION = 0.15;
const MAX_SILENCE_GAP = 0.3;
const DRIFT_THRESHOLD_MS = 80;
const ANALYSIS_INTERVAL_MS = 30000;

export interface VoiceSegment {
  startPts: number;
  endPts: number;
}

export interface DriftDetectionResult {
  driftMs: number;
  confidence: number;
  audioStartPts: number;
  subtitleStartPts: number;
  sampleCount: number;
  timestamp: number;
}

export interface AudioAnalyzerConfig {
  sampleRate?: number;
  driftThresholdMs?: number;
  analysisIntervalMs?: number;
}

export class AudioAnalyzer {
  private config: Required<AudioAnalyzerConfig>;
  private voiceSegments: VoiceSegment[] = [];
  private subtitleSegments: VoiceSegment[] = [];
  private currentPts: number = 0;
  private isInSpeech: boolean = false;
  private speechStartPts: number = 0;
  private silenceFrames: number = 0;
  private lastAnalysisTime: number = 0;
  private accumulatedDrift: number[] = [];

  private analysisWindow: {
    voicePts: number[];
    subtitlePts: number[];
  } = {
    voicePts: [],
    subtitlePts: []
  };

  constructor(config: AudioAnalyzerConfig = {}) {
    this.config = {
      sampleRate: config.sampleRate ?? SAMPLE_RATE,
      driftThresholdMs: config.driftThresholdMs ?? DRIFT_THRESHOLD_MS,
      analysisIntervalMs: config.analysisIntervalMs ?? ANALYSIS_INTERVAL_MS
    };
  }

  processAudioChunk(pcmData: Buffer, pts: number): void {
    this.currentPts = pts;

    const numFrames = Math.floor(pcmData.length / (2 * 2));
    const frameDuration = FRAME_SIZE / this.config.sampleRate;

    for (let i = 0; i < numFrames; i += FRAME_SIZE) {
      const frameStart = i * 4;
      const frameEnd = Math.min(frameStart + FRAME_SIZE * 4, pcmData.length);
      const frameData = pcmData.slice(frameStart, frameEnd);

      const zcr = this.calculateZeroCrossingRate(frameData);
      const energy = this.calculateEnergy(frameData);
      const isSpeechFrame = this.detectSpeechFrame(zcr, energy);

      const framePts = pts + (i / numFrames) * (pcmData.length / (this.config.sampleRate * 4));

      if (isSpeechFrame) {
        this.silenceFrames = 0;

        if (!this.isInSpeech) {
          this.isInSpeech = true;
          this.speechStartPts = framePts;
        }
      } else {
        this.silenceFrames++;

        if (this.isInSpeech) {
          const silenceDuration = this.silenceFrames * frameDuration;

          if (silenceDuration > MAX_SILENCE_GAP) {
            this.endSpeechSegment(framePts - silenceDuration);
          }
        }
      }
    }
  }

  private calculateZeroCrossingRate(frame: Buffer): number {
    let crossings = 0;
    const samples = frame.length / 2;

    for (let i = 1; i < samples; i++) {
      const sample1 = frame.readInt16LE((i - 1) * 2);
      const sample2 = frame.readInt16LE(i * 2);

      if ((sample1 > 0 && sample2 < 0) || (sample1 < 0 && sample2 > 0)) {
        crossings++;
      }
    }

    return crossings / samples;
  }

  private calculateEnergy(frame: Buffer): number {
    let energy = 0;
    const samples = frame.length / 2;

    for (let i = 0; i < samples; i++) {
      const sample = frame.readInt16LE(i * 2) / 32768;
      energy += sample * sample;
    }

    return Math.sqrt(energy / samples);
  }

  private detectSpeechFrame(zcr: number, energy: number): boolean {
    return energy > ENERGY_THRESHOLD && zcr > ZCR_THRESHOLD;
  }

  private endSpeechSegment(endPts: number): void {
    this.isInSpeech = false;

    const duration = endPts - this.speechStartPts;

    if (duration >= MIN_SPEECH_DURATION) {
      const segment: VoiceSegment = {
        startPts: this.speechStartPts,
        endPts
      };

      this.voiceSegments.push(segment);
      this.analysisWindow.voicePts.push(this.speechStartPts);

      console.log(
        `[AudioAnalyzer] Voice segment detected: ${this.speechStartPts.toFixed(2)}s - ${endPts.toFixed(2)}s (${(duration * 1000).toFixed(0)}ms)`
      );
    }
  }

  addSubtitleSegment(chunk: SubtitleChunk): void {
    const segment: VoiceSegment = {
      startPts: chunk.pts,
      endPts: chunk.pts + chunk.duration
    };

    this.subtitleSegments.push(segment);
    this.analysisWindow.subtitlePts.push(chunk.pts);
  }

  checkDrift(currentTime: number): DriftDetectionResult | null {
    if (currentTime - this.lastAnalysisTime < this.config.analysisIntervalMs) {
      return null;
    }

    if (this.analysisWindow.voicePts.length < 2 || this.analysisWindow.subtitlePts.length < 2) {
      console.log(
        `[AudioAnalyzer] Not enough data for drift detection: voice=${this.analysisWindow.voicePts.length}, subtitle=${this.analysisWindow.subtitlePts.length}`
      );
      this.lastAnalysisTime = currentTime;
      return null;
    }

    const result = this.calculateDrift();

    this.analysisWindow.voicePts = [];
    this.analysisWindow.subtitlePts = [];
    this.lastAnalysisTime = currentTime;

    return result;
  }

  private calculateDrift(): DriftDetectionResult | null {
    const voicePts = this.analysisWindow.voicePts;
    const subtitlePts = this.analysisWindow.subtitlePts;

    if (voicePts.length === 0 || subtitlePts.length === 0) {
      return null;
    }

    const drifts: number[] = [];

    for (const voicePts of voicePts) {
      let bestMatch = subtitlePts[0];
      let minDiff = Math.abs(voicePts - subtitlePts[0]);

      for (const subPts of subtitlePts) {
        const diff = Math.abs(voicePts - subPts);
        if (diff < minDiff) {
          minDiff = diff;
          bestMatch = subPts;
        }
      }

      const drift = (voicePts - bestMatch) * 1000;
      drifts.push(drift);
    }

    if (drifts.length === 0) {
      return null;
    }

    const avgDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length;
    const variance =
      drifts.reduce((sum, d) => sum + Math.pow(d - avgDrift, 2), 0) / drifts.length;
    const stdDev = Math.sqrt(variance);

    const confidence = Math.max(0, 1 - stdDev / 200);

    this.accumulatedDrift.push(avgDrift);

    const smoothedDrift =
      this.accumulatedDrift.reduce((a, b) => a + b, 0) / this.accumulatedDrift.length;

    const result: DriftDetectionResult = {
      driftMs: Math.round(smoothedDrift),
      confidence,
      audioStartPts: voicePts[0],
      subtitleStartPts: subtitlePts[0],
      sampleCount: drifts.length,
      timestamp: Date.now()
    };

    console.log(
      `[AudioAnalyzer] Drift detection: drift=${result.driftMs}ms, confidence=${(confidence * 100).toFixed(1)}%, samples=${result.sampleCount}`
    );

    if (Math.abs(result.driftMs) > this.config.driftThresholdMs) {
      console.warn(
        `[AudioAnalyzer] Drift exceeds threshold (${this.config.driftThresholdMs}ms): ${result.driftMs}ms`
      );
    }

    return result;
  }

  getVoiceSegments(): VoiceSegment[] {
    return [...this.voiceSegments];
  }

  getSubtitleSegments(): VoiceSegment[] {
    return [...this.subtitleSegments];
  }

  getCurrentPts(): number {
    return this.currentPts;
  }

  reset(): void {
    this.voiceSegments = [];
    this.subtitleSegments = [];
    this.currentPts = 0;
    this.isInSpeech = false;
    this.speechStartPts = 0;
    this.silenceFrames = 0;
    this.lastAnalysisTime = 0;
    this.accumulatedDrift = [];
    this.analysisWindow = {
      voicePts: [],
      subtitlePts: []
    };
  }
}
