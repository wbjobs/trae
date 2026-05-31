use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path).context("打开数据库失败")?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .context("设置数据库参数失败")?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS servers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                username TEXT NOT NULL,
                password TEXT NOT NULL,
                server_type TEXT NOT NULL DEFAULT 'nextcloud',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                path TEXT NOT NULL,
                name TEXT NOT NULL,
                is_dir INTEGER NOT NULL DEFAULT 0,
                size INTEGER,
                modified TEXT,
                content_type TEXT,
                etag TEXT,
                indexed INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
                UNIQUE(server_id, path)
            );

            CREATE INDEX IF NOT EXISTS idx_files_server_id ON files(server_id);
            CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
            CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
            "
        )
        .context("创建数据表失败")?;

        Ok(())
    }

    pub fn add_server(
        &self,
        name: &str,
        url: &str,
        username: &str,
        password: &str,
        server_type: &str,
    ) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO servers (name, url, username, password, server_type) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![name, url, username, password, server_type],
        )
        .context("添加服务器失败")?;

        Ok(conn.last_insert_rowid())
    }

    pub fn list_servers(&self) -> Result<Vec<crate::state::Server>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, name, url, username, password, server_type FROM servers ORDER BY name")
            .context("查询服务器失败")?;

        let servers = stmt
            .query_map([], |row| {
                Ok(crate::state::Server {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    url: row.get(2)?,
                    username: row.get(3)?,
                    password: row.get(4)?,
                    server_type: row.get(5)?,
                })
            })
            .context("查询服务器失败")?
            .collect::<Result<Vec<_>, _>>()
            .context("获取服务器列表失败")?;

        Ok(servers)
    }

    pub fn get_server(&self, id: i64) -> Result<Option<crate::state::Server>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, name, url, username, password, server_type FROM servers WHERE id = ?1")
            .context("查询服务器失败")?;

        let server = stmt
            .query_row(params![id], |row| {
                Ok(crate::state::Server {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    url: row.get(2)?,
                    username: row.get(3)?,
                    password: row.get(4)?,
                    server_type: row.get(5)?,
                })
            })
            .optional()
            .context("查询服务器失败")?;

        Ok(server)
    }

    pub fn remove_server(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM servers WHERE id = ?1", params![id])
            .context("删除服务器失败")?;
        conn.execute("DELETE FROM files WHERE server_id = ?1", params![id])
            .context("清理文件缓存失败")?;
        Ok(())
    }

    pub fn upsert_files(&self, server_id: i64, files: &[crate::state::FileItem]) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        for file in files {
            conn.execute(
                "INSERT OR REPLACE INTO files (server_id, path, name, is_dir, size, modified, content_type, etag) 
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    server_id,
                    file.path,
                    file.name,
                    file.is_dir as i32,
                    file.size,
                    file.modified,
                    file.content_type,
                    file.etag,
                ],
            )
            .context("保存文件信息失败")?;
        }

        Ok(())
    }

    pub fn get_files_by_path(
        &self,
        server_id: i64,
        path: &str,
    ) -> Result<Vec<crate::state::FileItem>> {
        let conn = self.conn.lock().unwrap();

        let prefix = if path == "/" { "/%".to_string() } else { format!("{}/%", path) };

        let mut stmt = conn
            .prepare(
                "SELECT path, name, is_dir, size, modified, content_type, etag 
                 FROM files 
                 WHERE server_id = ?1 AND (path LIKE ?2 ESCAPE '\\')
                 ORDER BY is_dir DESC, name ASC"
            )
            .context("查询文件失败")?;

        let files = stmt
            .query_map(params![server_id, prefix], |row| {
                Ok(crate::state::FileItem {
                    path: row.get(0)?,
                    name: row.get(1)?,
                    is_dir: row.get::<_, i32>(2)? != 0,
                    size: row.get(3)?,
                    modified: row.get(4)?,
                    content_type: row.get(5)?,
                    etag: row.get(6)?,
                })
            })
            .context("查询文件失败")?
            .collect::<Result<Vec<_>, _>>()
            .context("获取文件列表失败")?;

        Ok(files)
    }

    pub fn search_files_by_name(
        &self,
        server_id: Option<i64>,
        query: &str,
    ) -> Result<Vec<crate::state::FileItem>> {
        let conn = self.conn.lock().unwrap();
        let search_pattern = format!("%{}%", query);

        let files = if let Some(sid) = server_id {
            let mut stmt = conn
                .prepare(
                    "SELECT path, name, is_dir, size, modified, content_type, etag 
                     FROM files 
                     WHERE server_id = ?1 AND name LIKE ?2
                     ORDER BY is_dir DESC, name ASC
                     LIMIT 100"
                )
                .context("搜索文件失败")?;

            stmt.query_map(params![sid, search_pattern], |row| {
                Ok(crate::state::FileItem {
                    path: row.get(0)?,
                    name: row.get(1)?,
                    is_dir: row.get::<_, i32>(2)? != 0,
                    size: row.get(3)?,
                    modified: row.get(4)?,
                    content_type: row.get(5)?,
                    etag: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT path, name, is_dir, size, modified, content_type, etag 
                     FROM files 
                     WHERE name LIKE ?1
                     ORDER BY is_dir DESC, name ASC
                     LIMIT 100"
                )
                .context("搜索文件失败")?;

            stmt.query_map(params![search_pattern], |row| {
                Ok(crate::state::FileItem {
                    path: row.get(0)?,
                    name: row.get(1)?,
                    is_dir: row.get::<_, i32>(2)? != 0,
                    size: row.get(3)?,
                    modified: row.get(4)?,
                    content_type: row.get(5)?,
                    etag: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        };

        Ok(files)
    }

    pub fn get_all_text_files(
        &self,
        server_id: Option<i64>,
    ) -> Result<Vec<crate::state::FileItem>> {
        let conn = self.conn.lock().unwrap();

        let files = if let Some(sid) = server_id {
            let mut stmt = conn
                .prepare(
                    "SELECT path, name, is_dir, size, modified, content_type, etag 
                     FROM files 
                     WHERE server_id = ?1 AND is_dir = 0 
                     AND (content_type LIKE '%text%' OR name LIKE '%.txt' OR name LIKE '%.md' 
                          OR name LIKE '%.html' OR name LIKE '%.xml' OR name LIKE '%.json'
                          OR name LIKE '%.csv' OR name LIKE '%.log')
                     ORDER BY name ASC"
                )
                .context("查询文本文件失败")?;

            stmt.query_map(params![sid], |row| {
                Ok(crate::state::FileItem {
                    path: row.get(0)?,
                    name: row.get(1)?,
                    is_dir: row.get::<_, i32>(2)? != 0,
                    size: row.get(3)?,
                    modified: row.get(4)?,
                    content_type: row.get(5)?,
                    etag: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT path, name, is_dir, size, modified, content_type, etag 
                     FROM files 
                     WHERE is_dir = 0 
                     AND (content_type LIKE '%text%' OR name LIKE '%.txt' OR name LIKE '%.md' 
                          OR name LIKE '%.html' OR name LIKE '%.xml' OR name LIKE '%.json'
                          OR name LIKE '%.csv' OR name LIKE '%.log')
                     ORDER BY name ASC
                     LIMIT 1000"
                )
                .context("查询文本文件失败")?;

            stmt.query_map([], |row| {
                Ok(crate::state::FileItem {
                    path: row.get(0)?,
                    name: row.get(1)?,
                    is_dir: row.get::<_, i32>(2)? != 0,
                    size: row.get(3)?,
                    modified: row.get(4)?,
                    content_type: row.get(5)?,
                    etag: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        };

        Ok(files)
    }

    pub fn delete_files_by_path(&self, server_id: i64, path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let prefix = format!("{}%", path);
        conn.execute(
            "DELETE FROM files WHERE server_id = ?1 AND path LIKE ?2",
            params![server_id, prefix],
        )
        .context("删除文件缓存失败")?;
        Ok(())
    }
}
