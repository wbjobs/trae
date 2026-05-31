-- 创建数据库
CREATE DATABASE sheet_music;

-- 连接到数据库
\c sheet_music;

-- 创建扩展（如果需要）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 房间表
CREATE TABLE IF NOT EXISTS rooms (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 乐谱版本表
CREATE TABLE IF NOT EXISTS sheet_versions (
  id SERIAL PRIMARY KEY,
  room_id VARCHAR(36) REFERENCES rooms(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  yjs_state BYTEA,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(36)
);

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(7) NOT NULL,
  room_id VARCHAR(36) REFERENCES rooms(id) ON DELETE CASCADE,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_sheet_versions_room ON sheet_versions(room_id);
CREATE INDEX IF NOT EXISTS idx_users_room ON users(room_id);

-- 插入一些示例数据
INSERT INTO rooms (id, name) VALUES 
  ('sample-1', '欢乐颂练习室'),
  ('sample-2', '小星星创作空间'),
  ('sample-3', '古典音乐研讨室')
ON CONFLICT DO NOTHING;
