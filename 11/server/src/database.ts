import Database from 'better-sqlite3';
import path from 'path';

export interface OffsetRecord {
  id: number;
  videoId: string;
  offsetMs: number;
  createdAt: string;
  updatedAt: string;
}

export class SubtitleOffsetStore {
  private db: Database.Database;

  constructor(dbPath: string = path.join(process.cwd(), 'offsets.db')) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subtitle_offsets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id TEXT NOT NULL UNIQUE,
        offset_ms INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_video_id ON subtitle_offsets(video_id);
    `);
  }

  getOffset(videoId: string): number | null {
    const row = this.db
      .prepare('SELECT offset_ms FROM subtitle_offsets WHERE video_id = ?')
      .get(videoId) as { offset_ms: number } | undefined;

    return row ? row.offset_ms : null;
  }

  saveOffset(videoId: string, offsetMs: number): OffsetRecord {
    const existing = this.getOffset(videoId);

    if (existing !== null) {
      this.db
        .prepare(
          'UPDATE subtitle_offsets SET offset_ms = ?, updated_at = datetime(\'now\') WHERE video_id = ?'
        )
        .run(offsetMs, videoId);
    } else {
      this.db
        .prepare(
          'INSERT INTO subtitle_offsets (video_id, offset_ms) VALUES (?, ?)'
        )
        .run(videoId, offsetMs);
    }

    const record = this.db
      .prepare(
        'SELECT id, video_id AS videoId, offset_ms AS offsetMs, created_at AS createdAt, updated_at AS updatedAt FROM subtitle_offsets WHERE video_id = ?'
      )
      .get(videoId) as OffsetRecord;

    return record;
  }

  getAllOffsets(): OffsetRecord[] {
    const rows = this.db
      .prepare(
        'SELECT id, video_id AS videoId, offset_ms AS offsetMs, created_at AS createdAt, updated_at AS updatedAt FROM subtitle_offsets ORDER BY updated_at DESC'
      )
      .all() as OffsetRecord[];

    return rows;
  }

  close(): void {
    this.db.close();
  }
}
