import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'router.db');

export const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    isActive INTEGER DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    groupId TEXT NOT NULL,
    name TEXT NOT NULL,
    urlPattern TEXT NOT NULL,
    methods TEXT NOT NULL,
    headerConditions TEXT,
    actionType TEXT NOT NULL,
    forwardUrl TEXT,
    mockStatusCode INTEGER,
    mockHeaders TEXT,
    mockBody TEXT,
    requestHeaders TEXT,
    responseHeaders TEXT,
    enabled INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    ruleId TEXT,
    ruleName TEXT,
    requestUrl TEXT NOT NULL,
    requestMethod TEXT NOT NULL,
    actionType TEXT NOT NULL,
    status TEXT NOT NULL,
    responseTime INTEGER,
    responseStatusCode INTEGER,
    errorMessage TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const defaultApiKey = 'dev-api-key-12345';
const existingKey = db.prepare('SELECT value FROM settings WHERE key = ?').get('apiKey');
if (!existingKey) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('apiKey', defaultApiKey);
  console.log(`[Database] Default API Key: ${defaultApiKey}`);
}

const existingGroups = db.prepare('SELECT COUNT(*) as count FROM groups').get() as { count: number };
if (existingGroups.count === 0) {
  const defaultGroupId = 'group_default';
  db.prepare(`
    INSERT INTO groups (id, name, description, isActive)
    VALUES (?, ?, ?, 1)
  `).run(defaultGroupId, 'Default', 'Default rule group');
  console.log(`[Database] Created default group`);
}
