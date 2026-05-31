import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sheet_versions (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(36) REFERENCES rooms(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        yjs_state BYTEA,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(36)
      );

      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        color VARCHAR(7) NOT NULL,
        room_id VARCHAR(36) REFERENCES rooms(id) ON DELETE CASCADE,
        connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sheet_versions_room ON sheet_versions(room_id);
      CREATE INDEX IF NOT EXISTS idx_users_room ON users(room_id);
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

export async function createRoom(roomId: string, name: string) {
  await pool.query(
    'INSERT INTO rooms (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [roomId, name]
  );
}

export async function saveVersion(roomId: string, content: string, yjsState: Buffer, userId: string) {
  await pool.query(
    'INSERT INTO sheet_versions (room_id, content, yjs_state, created_by) VALUES ($1, $2, $3, $4)',
    [roomId, content, yjsState, userId]
  );
}

export async function getLatestVersion(roomId: string) {
  const result = await pool.query(
    'SELECT * FROM sheet_versions WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1',
    [roomId]
  );
  return result.rows[0] || null;
}

export async function getVersionHistory(roomId: string, limit: number = 20) {
  const result = await pool.query(
    'SELECT id, content, created_at, created_by FROM sheet_versions WHERE room_id = $1 ORDER BY created_at DESC LIMIT $2',
    [roomId, limit]
  );
  return result.rows;
}

export async function addUser(userId: string, name: string, color: string, roomId: string) {
  await pool.query(
    'INSERT INTO users (id, name, color, room_id) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET name = $2, color = $3, room_id = $4, connected_at = CURRENT_TIMESTAMP',
    [userId, name, color, roomId]
  );
}

export async function removeUser(userId: string) {
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}

export async function getRoomUsers(roomId: string) {
  const result = await pool.query(
    'SELECT id, name, color FROM users WHERE room_id = $1',
    [roomId]
  );
  return result.rows;
}
