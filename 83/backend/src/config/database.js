const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcryptjs');

let dbInstance = null;

const dbPath = path.join(__dirname, '../../database/secure_doc.db');

const initDatabase = async () => {
  await fs.ensureDir(path.dirname(dbPath));
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('数据库连接失败:', err);
        reject(err);
        return;
      }
      console.log('SQLite数据库连接成功');
    });

    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        real_name TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        department TEXT,
        permissions TEXT,
        offline_token TEXT,
        offline_expire_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status INTEGER DEFAULT 1
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_uuid TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        file_type TEXT,
        secret_level TEXT NOT NULL DEFAULT 'internal',
        fingerprint TEXT NOT NULL,
        encryption_key TEXT NOT NULL,
        uploader_id INTEGER NOT NULL,
        uploader_name TEXT,
        department TEXT,
        description TEXT,
        is_encrypted INTEGER DEFAULT 1,
        version INTEGER DEFAULT 1,
        parent_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status INTEGER DEFAULT 1,
        FOREIGN KEY (uploader_id) REFERENCES users(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS document_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        user_id INTEGER,
        department TEXT,
        role TEXT,
        permission_type TEXT NOT NULL,
        granted_by INTEGER,
        granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        FOREIGN KEY (document_id) REFERENCES documents(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        operation_type TEXT NOT NULL,
        document_id INTEGER,
        document_title TEXT,
        ip_address TEXT,
        user_agent TEXT,
        details TEXT,
        is_offline INTEGER DEFAULT 0,
        sync_status INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS watermark_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT,
        font_size INTEGER DEFAULT 14,
        opacity REAL DEFAULT 0.3,
        angle INTEGER DEFAULT -30,
        color TEXT DEFAULT '#000000',
        position TEXT DEFAULT 'full',
        is_default INTEGER DEFAULT 0,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS sync_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_type TEXT NOT NULL,
        record_id INTEGER,
        cloud_id TEXT,
        status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        last_attempt DATETIME,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS trace_fingerprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        fingerprint TEXT NOT NULL,
        hash_algorithm TEXT NOT NULL,
        block_size INTEGER,
        block_hashes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS document_borrows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        borrower_name TEXT,
        borrow_type TEXT NOT NULL DEFAULT 'offline',
        borrow_reason TEXT,
        borrow_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        due_at DATETIME NOT NULL,
        returned_at DATETIME,
        status TEXT NOT NULL DEFAULT 'active',
        max_offline_hours INTEGER DEFAULT 72,
        auto_return INTEGER DEFAULT 1,
        access_count INTEGER DEFAULT 0,
        last_access_at DATETIME,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS borrow_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        secret_level TEXT NOT NULL,
        max_borrow_days INTEGER NOT NULL DEFAULT 7,
        max_borrow_count INTEGER NOT NULL DEFAULT 10,
        require_approval INTEGER DEFAULT 0,
        approval_role TEXT,
        allow_offline INTEGER DEFAULT 1,
        max_offline_hours INTEGER DEFAULT 72,
        auto_return INTEGER DEFAULT 1,
        allow_extension INTEGER DEFAULT 1,
        max_extensions INTEGER DEFAULT 2,
        is_default INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS environment_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        env_name TEXT NOT NULL,
        env_type TEXT NOT NULL DEFAULT 'intranet',
        base_url TEXT,
        cloud_sync_url TEXT,
        cloud_api_key TEXT,
        cloud_sync_enabled INTEGER DEFAULT 0,
        offline_enabled INTEGER DEFAULT 1,
        max_offline_days INTEGER DEFAULT 30,
        password_policy TEXT,
        session_timeout INTEGER DEFAULT 3600,
        login_fail_limit INTEGER DEFAULT 5,
        ip_whitelist TEXT,
        ip_blacklist TEXT,
        security_level TEXT DEFAULT 'high',
        audit_enabled INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      const checkAdmin = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?');
      checkAdmin.get('admin', (err, row) => {
        if (err) {
          console.error('检查管理员账户失败:', err);
          return;
        }
        if (row.count === 0) {
          const salt = bcrypt.genSaltSync(10);
          const hashedPassword = bcrypt.hashSync('admin123', salt);
          const stmt = db.prepare(`INSERT INTO users 
            (username, password, real_name, role, department, permissions) 
            VALUES (?, ?, ?, ?, ?, ?)`);
          stmt.run(
            'admin',
            hashedPassword,
            '系统管理员',
            'admin',
            '信息安全部',
            JSON.stringify(['*'])
          );
          console.log('默认管理员账户已创建: admin / admin123');
        }
      });

      const checkWatermark = db.prepare('SELECT COUNT(*) as count FROM watermark_configs');
      checkWatermark.get((err, row) => {
        if (err) return;
        if (row.count === 0) {
          const stmt = db.prepare(`INSERT INTO watermark_configs 
            (name, type, content, font_size, opacity, angle, color, position, is_default) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          stmt.run(
            '默认文字水印',
            'text',
            '${username} - ${date} - 涉密文档',
            14,
            0.3,
            -30,
            '#ff0000',
            'full',
            1
          );
          console.log('默认水印配置已创建');
        }
      });

      const checkBorrowRules = db.prepare('SELECT COUNT(*) as count FROM borrow_rules');
      checkBorrowRules.get((err, row) => {
        if (err) return;
        if (row.count === 0) {
          const stmt = db.prepare(`INSERT INTO borrow_rules 
            (name, secret_level, max_borrow_days, max_borrow_count, require_approval, approval_role, 
             allow_offline, max_offline_hours, auto_return, allow_extension, max_extensions, is_default) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          
          stmt.run(
            '公开文档借阅规则',
            'public',
            30,
            50,
            0,
            null,
            1,
            168,
            1,
            1,
            3,
            1
          );
          stmt.run(
            '内部文档借阅规则',
            'internal',
            14,
            20,
            0,
            null,
            1,
            72,
            1,
            1,
            2,
            1
          );
          stmt.run(
            '机密文档借阅规则',
            'secret',
            7,
            10,
            1,
            'manager',
            1,
            48,
            1,
            0,
            0,
            1
          );
          stmt.run(
            '绝密文档借阅规则',
            'top_secret',
            3,
            3,
            1,
            'admin',
            0,
            0,
            1,
            0,
            0,
            1
          );
          console.log('默认借阅规则已创建');
        }
      });

      const checkEnvConfig = db.prepare('SELECT COUNT(*) as count FROM environment_configs');
      checkEnvConfig.get((err, row) => {
        if (err) return;
        if (row.count === 0) {
          const stmt = db.prepare(`INSERT INTO environment_configs 
            (env_name, env_type, base_url, cloud_sync_url, cloud_sync_enabled, 
             offline_enabled, max_offline_days, session_timeout, login_fail_limit, 
             security_level, audit_enabled, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          
          stmt.run(
            '内网环境',
            'intranet',
            'http://192.168.1.100:3000',
            '',
            0,
            1,
            30,
            3600,
            5,
            'high',
            1,
            1
          );
          stmt.run(
            '外网环境',
            'internet',
            'https://secure-doc.example.com',
            'https://cloud-sync.example.com',
            1,
            1,
            7,
            1800,
            3,
            'critical',
            1,
            0
          );
          console.log('默认环境配置已创建');
        }
      });
    });

    dbInstance = db;
    resolve(db);
  });
};

const getDb = () => {
  if (!dbInstance) {
    throw new Error('数据库未初始化');
  }
  return dbInstance;
};

const close = () => {
  if (dbInstance) {
    dbInstance.close();
    console.log('数据库连接已关闭');
  }
};

const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const getQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const allQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

module.exports = {
  initDatabase,
  getDb,
  close,
  runQuery,
  getQuery,
  allQuery,
};
