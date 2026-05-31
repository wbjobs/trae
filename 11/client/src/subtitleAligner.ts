import { SubtitleChunk } from './protocol';

export interface SubtitleEntry {
  id: string;
  text: string;
  startPts: number;
  endPts: number;
}

export interface AlignerConfig {
  offsetMs: number;
}

export class SubtitleAligner {
  private config: AlignerConfig;
  private pendingSubtitles: SubtitleEntry[] = [];
  private activeSubtitle: SubtitleEntry | null = null;
  private currentVideoPts: number = 0;
  private idCounter: number = 0;

  constructor(config: AlignerConfig = { offsetMs: 0 }) {
    this.config = config;
  }

  setOffset(offsetMs: number): void {
    this.config.offsetMs = offsetMs;
  }

  getOffset(): number {
    return this.config.offsetMs;
  }

  addSubtitle(chunk: SubtitleChunk): void {
    const entry: SubtitleEntry = {
      id: `sub_${++this.idCounter}`,
      text: chunk.data,
      startPts: chunk.pts,
      endPts: chunk.pts + chunk.duration
    };

    const insertIdx = this.pendingSubtitles.findIndex(
      (s) => s.startPts > entry.startPts
    );

    if (insertIdx === -1) {
      this.pendingSubtitles.push(entry);
    } else {
      this.pendingSubtitles.splice(insertIdx, 0, entry);
    }
  }

  updateVideoPts(videoPts: number): SubtitleEntry | null {
    this.currentVideoPts = videoPts;

    const effectivePts = videoPts - this.config.offsetMs / 1000;

    if (this.activeSubtitle) {
      if (effectivePts >= this.activeSubtitle.endPts) {
        this.activeSubtitle = null;
      }
    }

    while (this.pendingSubtitles.length > 0) {
      const next = this.pendingSubtitles[0];

      if (effectivePts >= next.startPts) {
        if (effectivePts < next.endPts) {
          this.activeSubtitle = next;
        }
        this.pendingSubtitles.shift();
      } else {
        break;
      }
    }

    return this.activeSubtitle;
  }

  getActiveSubtitle(): SubtitleEntry | null {
    return this.activeSubtitle;
  }

  getCurrentVideoPts(): number {
    return this.currentVideoPts;
  }

  getEffectivePts(): number {
    return this.currentVideoPts - this.config.offsetMs / 1000;
  }

  clear(): void {
    this.pendingSubtitles = [];
    this.activeSubtitle = null;
    this.currentVideoPts = 0;
  }

  getPendingCount(): number {
    return this.pendingSubtitles.length;
  }
}
