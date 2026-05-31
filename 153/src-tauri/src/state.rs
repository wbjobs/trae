use crate::db::Database;
use crate::search::SearchEngine;
use crate::webdav::{WebDAVClient, UploadResult};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Server {
    pub id: i64,
    pub name: String,
    pub url: String,
    pub username: String,
    pub password: String,
    pub server_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileItem {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<i64>,
    pub modified: Option<String>,
    pub content_type: Option<String>,
    pub etag: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub content: String,
    pub score: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalEdit {
    pub server_id: i64,
    pub path: String,
    pub name: String,
    pub local_path: String,
    pub content: String,
    pub original_etag: Option<String>,
    pub last_modified: String,
    pub is_synced: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncResult {
    pub success: bool,
    pub conflict: bool,
    pub local_etag: Option<String>,
    pub remote_etag: Option<String>,
    pub message: String,
}

pub struct AppState {
    db: Mutex<Option<Database>>,
    search_engine: Mutex<Option<SearchEngine>>,
    webdav_clients: Mutex<HashMap<i64, WebDAVClient>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            db: Mutex::new(None),
            search_engine: Mutex::new(None),
            webdav_clients: Mutex::new(HashMap::new()),
        }
    }

    pub async fn init(&self) -> Result<String> {
        let app_dir = dirs::data_dir()
            .map(|p| p.join("webdav-desktop"))
            .unwrap_or_else(|| std::path::PathBuf::from("."));

        std::fs::create_dir_all(&app_dir).context("创建应用目录失败")?;

        let db_path = app_dir.join("data.db").to_string_lossy().to_string();
        let search_path = app_dir
            .join("search_index")
            .to_string_lossy()
            .to_string();

        let db = Database::new(&db_path)?;
        let search_engine = SearchEngine::new(&search_path)?;

        *self.db.lock().unwrap() = Some(db);
        *self.search_engine.lock().unwrap() = Some(search_engine);

        self.reload_webdav_clients()?;

        Ok("初始化成功".to_string())
    }

    fn get_db(&self) -> Result<&Database> {
        self.db
            .lock()
            .unwrap()
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("数据库未初始化"))
    }

    fn get_search_engine(&self) -> Result<&SearchEngine> {
        self.search_engine
            .lock()
            .unwrap()
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("搜索引擎未初始化"))
    }

    fn reload_webdav_clients(&self) -> Result<()> {
        let db = self.get_db()?;
        let servers = db.list_servers()?;

        let mut clients = self.webdav_clients.lock().unwrap();
        clients.clear();

        for server in servers {
            let client = WebDAVClient::new(
                &server.url,
                &server.username,
                &server.password,
                &server.server_type,
            );
            clients.insert(server.id, client);
        }

        Ok(())
    }

    fn get_webdav_client(&self, server_id: i64) -> Result<WebDAVClient> {
        let db = self.get_db()?;
        let server = db
            .get_server(server_id)?
            .ok_or_else(|| anyhow::anyhow!("服务器不存在"))?;

        Ok(WebDAVClient::new(
            &server.url,
            &server.username,
            &server.password,
            &server.server_type,
        ))
    }

    pub async fn add_server(
        &self,
        name: &str,
        url: &str,
        username: &str,
        password: &str,
        server_type: &str,
    ) -> Result<i64> {
        let client = WebDAVClient::new(url, username, password, server_type);
        client.test_connection().await?;

        let db = self.get_db()?;
        let id = db.add_server(name, url, username, password, server_type)?;

        let mut clients = self.webdav_clients.lock().unwrap();
        clients.insert(id, client);

        Ok(id)
    }

    pub async fn list_servers(&self) -> Result<Vec<Server>> {
        let db = self.get_db()?;
        let servers = db.list_servers()?;
        Ok(servers)
    }

    pub async fn remove_server(&self, id: i64) -> Result<()> {
        let db = self.get_db()?;
        db.remove_server(id)?;

        let mut clients = self.webdav_clients.lock().unwrap();
        clients.remove(&id);

        Ok(())
    }

    pub async fn list_files(&self, server_id: i64, path: &str) -> Result<Vec<FileItem>> {
        let client = self.get_webdav_client(server_id)?;

        let remote_files = client.list_files(path).await?;
        let file_items: Vec<FileItem> = remote_files
            .into_iter()
            .map(|f| FileItem {
                path: f.path,
                name: f.name,
                is_dir: f.is_dir,
                size: f.size,
                modified: f.modified,
                content_type: f.content_type,
                etag: f.etag,
            })
            .collect();

        let db = self.get_db()?;
        db.upsert_files(server_id, &file_items)?;

        Ok(file_items)
    }

    pub async fn download_file<F>(
        &self,
        server_id: i64,
        remote_path: &str,
        local_path: &str,
        progress_callback: F,
    ) -> Result<()>
    where
        F: FnMut(crate::webdav::ProgressInfo) + Send + 'static,
    {
        let client = self.get_webdav_client(server_id)?;
        client
            .download_file(remote_path, local_path, progress_callback)
            .await?;
        Ok(())
    }

    pub async fn upload_file<F>(
        &self,
        server_id: i64,
        local_path: &str,
        remote_path: &str,
        progress_callback: F,
    ) -> Result<()>
    where
        F: FnMut(crate::webdav::ProgressInfo) + Send + 'static,
    {
        let client = self.get_webdav_client(server_id)?;
        client
            .upload_file(local_path, remote_path, progress_callback)
            .await?;
        Ok(())
    }

    pub async fn upload_file_chunked<F>(
        &self,
        server_id: i64,
        local_path: &str,
        remote_path: &str,
        chunk_size: usize,
        progress_callback: F,
    ) -> Result<()>
    where
        F: FnMut(crate::webdav::ProgressInfo) + Send + 'static,
    {
        let client = self.get_webdav_client(server_id)?;
        client
            .upload_file_chunked(local_path, remote_path, chunk_size, progress_callback)
            .await?;
        Ok(())
    }

    pub async fn delete_file(&self, server_id: i64, path: &str) -> Result<()> {
        let client = self.get_webdav_client(server_id)?;
        client.delete_file(path).await?;

        let db = self.get_db()?;
        db.delete_files_by_path(server_id, path)?;

        let search_engine = self.get_search_engine()?;
        search_engine.delete_document(path)?;

        Ok(())
    }

    pub async fn create_folder(&self, server_id: i64, path: &str) -> Result<()> {
        let client = self.get_webdav_client(server_id)?;
        client.create_folder(path).await?;
        Ok(())
    }

    pub async fn rename_file(
        &self,
        server_id: i64,
        old_path: &str,
        new_name: &str,
    ) -> Result<()> {
        let client = self.get_webdav_client(server_id)?;
        client.rename_file(old_path, new_name).await?;
        Ok(())
    }

    pub async fn search_files(
        &self,
        server_id: Option<i64>,
        query: &str,
    ) -> Result<Vec<FileItem>> {
        let db = self.get_db()?;
        db.search_files_by_name(server_id, query)
    }

    pub async fn search_content(
        &self,
        server_id: Option<i64>,
        query: &str,
    ) -> Result<Vec<SearchResult>> {
        let search_engine = self.get_search_engine()?;
        let results = search_engine.search(query, 50)?;

        let results = if let Some(sid) = server_id {
            let db = self.get_db()?;
            let all_files = db.get_all_text_files(Some(sid))?;
            let file_paths: std::collections::HashSet<String> =
                all_files.into_iter().map(|f| f.path).collect();

            results
                .into_iter()
                .filter(|r| file_paths.contains(&r.path))
                .collect()
        } else {
            results
        };

        Ok(results)
    }

    pub async fn get_file_content(&self, server_id: i64, path: &str) -> Result<String> {
        let client = self.get_webdav_client(server_id)?;
        let content = client.get_file_content(path).await?;

        let name = std::path::Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let search_engine = self.get_search_engine()?;
        search_engine.index_document(path, &name, &content)?;

        Ok(content)
    }

    pub async fn refresh_cache(&self, server_id: i64, path: &str) -> Result<String> {
        self.list_files(server_id, path).await?;
        Ok("刷新成功".to_string())
    }

    pub async fn start_edit(
        &self,
        server_id: i64,
        path: &str,
    ) -> Result<LocalEdit> {
        let client = self.get_webdav_client(server_id)?;
        let content = client.get_file_content(path).await?;

        let metadata = client.get_file_metadata(path).await.ok();
        let etag = metadata.and_then(|m| m.etag);

        let name = std::path::Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".to_string());

        let temp_dir = std::env::temp_dir();
        let local_path = temp_dir
            .join(format!("webdav_edit_{}_{}", server_id, name))
            .to_string_lossy()
            .to_string();

        std::fs::write(&local_path, &content).context("写入临时文件失败")?;

        let last_modified = chrono::Utc::now().to_rfc3339();

        Ok(LocalEdit {
            server_id,
            path: path.to_string(),
            name,
            local_path,
            content,
            original_etag: etag,
            last_modified,
            is_synced: true,
        })
    }

    pub async fn save_edit(
        &self,
        server_id: i64,
        path: &str,
        content: &str,
        original_etag: Option<String>,
    ) -> Result<SyncResult> {
        let client = self.get_webdav_client(server_id)?;

        let temp_dir = std::env::temp_dir();
        let name = std::path::Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".to_string());
        let local_path = temp_dir
            .join(format!("webdav_edit_{}_{}", server_id, name))
            .to_string_lossy()
            .to_string();

        std::fs::write(&local_path, content).context("写入临时文件失败")?;

        let upload_result = client
            .upload_file_with_etag(&local_path, path, original_etag.clone(), |_| {})
            .await?;

        if upload_result.conflict {
            let remote_metadata = client.get_file_metadata(path).await.ok();
            let remote_etag = remote_metadata.and_then(|m| m.etag);

            Ok(SyncResult {
                success: false,
                conflict: true,
                local_etag: original_etag,
                remote_etag,
                message: "文件已被其他人修改，请选择如何处理冲突".to_string(),
            })
        } else if upload_result.success {
            Ok(SyncResult {
                success: true,
                conflict: false,
                local_etag: upload_result.etag.clone(),
                remote_etag: upload_result.etag,
                message: "同步成功".to_string(),
            })
        } else {
            Ok(SyncResult {
                success: false,
                conflict: false,
                local_etag: original_etag,
                remote_etag: None,
                message: "同步失败".to_string(),
            })
        }
    }

    pub async fn force_save(
        &self,
        server_id: i64,
        path: &str,
        content: &str,
    ) -> Result<SyncResult> {
        let client = self.get_webdav_client(server_id)?;

        let temp_dir = std::env::temp_dir();
        let name = std::path::Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".to_string());
        let local_path = temp_dir
            .join(format!("webdav_edit_{}_{}", server_id, name))
            .to_string_lossy()
            .to_string();

        std::fs::write(&local_path, content).context("写入临时文件失败")?;

        let upload_result = client
            .upload_file_with_etag(&local_path, path, None, |_| {})
            .await?;

        if upload_result.success {
            Ok(SyncResult {
                success: true,
                conflict: false,
                local_etag: upload_result.etag.clone(),
                remote_etag: upload_result.etag,
                message: "强制覆盖成功".to_string(),
            })
        } else {
            Ok(SyncResult {
                success: false,
                conflict: false,
                local_etag: None,
                remote_etag: None,
                message: "强制覆盖失败".to_string(),
            })
        }
    }

    pub async fn get_remote_content(
        &self,
        server_id: i64,
        path: &str,
    ) -> Result<(String, Option<String>)> {
        let client = self.get_webdav_client(server_id)?;
        let content = client.get_file_content(path).await?;

        let metadata = client.get_file_metadata(path).await.ok();
        let etag = metadata.and_then(|m| m.etag);

        Ok((content, etag))
    }

    pub fn is_editable_file(name: &str) -> bool {
        let ext = std::path::Path::new(name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        matches!(
            ext.as_str(),
            "txt" | "md" | "markdown" | "html" | "htm" | "xml" | "json" | "yaml" | "yml" |
            "css" | "js" | "ts" | "py" | "java" | "c" | "cpp" | "h" | "hpp" | "rs" |
            "go" | "sh" | "bat" | "ini" | "cfg" | "conf" | "toml" | "log" | "csv"
        )
    }
}
