use anyhow::{Context, Result};
use base64::Engine;
use bytes::Bytes;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue};
use reqwest::Body;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio_util::io::ReaderStream;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WebDAVFile {
    pub href: String,
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<i64>,
    pub modified: Option<String>,
    pub content_type: Option<String>,
    pub etag: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProgressInfo {
    pub file_path: String,
    pub file_size: i64,
    pub transferred: i64,
    pub progress: f64,
}

pub struct WebDAVClient {
    pub url: String,
    pub username: String,
    pub password: String,
    pub server_type: String,
    pub client: reqwest::Client,
}

impl WebDAVClient {
    pub fn new(url: &str, username: &str, password: &str, server_type: &str) -> Self {
        let mut headers = HeaderMap::new();
        let auth = format!("{}:{}", username, password);
        let auth_b64 = base64::engine::general_purpose::STANDARD.encode(auth);
        headers.insert(
            "Authorization",
            HeaderValue::from_str(&format!("Basic {}", auth_b64)).unwrap(),
        );

        let mut client_builder = reqwest::Client::builder()
            .default_headers(headers)
            .danger_accept_invalid_certs(true)
            .timeout(std::time::Duration::from_secs(300));

        if server_type == "jianguoyun" {
            client_builder = client_builder.user_agent("WebDAV-Desktop-Client");
        }

        Self {
            url: url.trim_end_matches('/').to_string(),
            username: username.to_string(),
            password: password.to_string(),
            server_type: server_type.to_string(),
            client: client_builder.build().unwrap(),
        }
    }

    pub async fn test_connection(&self) -> Result<()> {
        let resp = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND")?, &self.url)
            .header("Depth", "0")
            .send()
            .await
            .context("连接服务器失败")?;

        if resp.status().is_success() {
            Ok(())
        } else {
            Err(anyhow::anyhow!(
                "连接失败: HTTP {}",
                resp.status()
            ))
        }
    }

    pub async fn list_files(&self, path: &str) -> Result<Vec<WebDAVFile>> {
        let full_url = format!("{}{}", self.url, path);
        let resp = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND")?, &full_url)
            .header("Depth", "1")
            .send()
            .await
            .context("获取文件列表失败")?;

        let status = resp.status();
        let body = resp.text().await.context("读取响应失败")?;

        if !status.is_success() {
            return Err(anyhow::anyhow!("获取文件列表失败: HTTP {}", status));
        }

        self.parse_propfind_response(&body, path)
    }

    fn parse_propfind_response(&self, xml: &str, base_path: &str) -> Result<Vec<WebDAVFile>> {
        let mut files = Vec::new();
        let doc = quick_xml::Document::from(xml);

        for response in doc.find_all("D:response") {
            let href = response
                .find("D:href")
                .map(|e| e.text())
                .unwrap_or_default();

            let href_decoded = urlencoding::decode(&href)
                .unwrap_or_default()
                .to_string();

            let name = Path::new(&href_decoded)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            if name.is_empty() {
                continue;
            }

            let propstat = response.find("D:propstat");
            let mut is_dir = false;
            let mut size = None;
            let mut modified = None;
            let mut content_type = None;
            let mut etag = None;

            if let Some(prop) = propstat {
                if let Some(prop_inner) = prop.find("D:prop") {
                    if let Some(resourcetype) = prop_inner.find("D:resourcetype") {
                        is_dir = resourcetype.find("D:collection").is_some();
                    }
                    if let Some(getcontentlength) = prop_inner.find("D:getcontentlength") {
                        size = getcontentlength.text().parse::<i64>().ok();
                    }
                    if let Some(getlastmodified) = prop_inner.find("D:getlastmodified") {
                        modified = Some(getlastmodified.text());
                    }
                    if let Some(getcontenttype) = prop_inner.find("D:getcontenttype") {
                        content_type = Some(getcontenttype.text());
                    }
                    if let Some(getetag) = prop_inner.find("D:getetag") {
                        etag = Some(getetag.text());
                    }
                }
            }

            let relative_path = if href_decoded.starts_with(&self.url) {
                href_decoded[self.url.len()..].to_string()
            } else {
                href_decoded
            };

            files.push(WebDAVFile {
                href: href_decoded,
                name,
                path: relative_path,
                is_dir,
                size,
                modified,
                content_type,
                etag,
            });
        }

        files.retain(|f| f.path != base_path && f.path != format!("{}/", base_path));
        Ok(files)
    }

    pub async fn download_file<F>(
        &self,
        remote_path: &str,
        local_path: &str,
        mut progress_callback: F,
    ) -> Result<()>
    where
        F: FnMut(ProgressInfo) + Send + 'static,
    {
        let full_url = format!("{}{}", self.url, remote_path);
        let resp = self
            .client
            .get(&full_url)
            .send()
            .await
            .context("下载文件失败")?;

        if !resp.status().is_success() {
            return Err(anyhow::anyhow!("下载失败: HTTP {}", resp.status()));
        }

        let file_size = resp
            .headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);

        let mut file = File::create(local_path)
            .await
            .context("创建本地文件失败")?;

        let mut stream = resp.bytes_stream();
        let mut transferred = 0i64;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("读取数据块失败")?;
            file.write_all(&chunk)
                .await
                .context("写入文件失败")?;

            transferred += chunk.len() as i64;
            let progress = if file_size > 0 {
                (transferred as f64 / file_size as f64) * 100.0
            } else {
                0.0
            };

            progress_callback(ProgressInfo {
                file_path: remote_path.to_string(),
                file_size,
                transferred,
                progress,
            });
        }

        file.flush().await.context("刷新文件失败")?;
        Ok(())
    }

    pub async fn upload_file<F>(
        &self,
        local_path: &str,
        remote_path: &str,
        progress_callback: F,
    ) -> Result<()>
    where
        F: FnMut(ProgressInfo) + Send + 'static,
    {
        let file = File::open(local_path)
            .await
            .context("打开本地文件失败")?;

        let file_size = file
            .metadata()
            .await
            .context("获取文件元数据失败")?
            .len() as i64;

        let full_url = format!("{}{}", self.url, remote_path);
        let content_type = mime_guess::from_path(local_path)
            .first_or_octet_stream()
            .to_string();

        let remote_path_clone = remote_path.to_string();
        let callback_mutex = Mutex::new(progress_callback);
        let stream = ReaderStream::new(file);

        let mut transferred = 0i64;
        let progress_stream = stream.map(move |result| {
            result.map(|bytes| {
                let len = bytes.len() as i64;
                transferred += len;
                let progress = if file_size > 0 {
                    (transferred as f64 / file_size as f64) * 100.0
                } else {
                    0.0
                };

                let info = ProgressInfo {
                    file_path: remote_path_clone.clone(),
                    file_size,
                    transferred,
                    progress,
                };

                if let Ok(mut cb) = callback_mutex.lock() {
                    cb(info);
                }

                Bytes::from(bytes)
            })
        });

        let body = Body::wrap_stream(progress_stream);

        let resp = self
            .client
            .put(&full_url)
            .header("Content-Type", content_type)
            .header("Content-Length", file_size.to_string())
            .body(body)
            .send()
            .await
            .context("上传文件失败")?;

        if resp.status().is_success() || resp.status() == reqwest::StatusCode::NO_CONTENT {
            if let Ok(mut cb) = callback_mutex.lock() {
                cb(ProgressInfo {
                    file_path: remote_path.to_string(),
                    file_size,
                    transferred: file_size,
                    progress: 100.0,
                });
            }
            Ok(())
        } else {
            Err(anyhow::anyhow!("上传失败: HTTP {}", resp.status()))
        }
    }

    pub async fn upload_file_chunked<F>(
        &self,
        local_path: &str,
        remote_path: &str,
        chunk_size: usize,
        mut progress_callback: F,
    ) -> Result<()>
    where
        F: FnMut(ProgressInfo) + Send + 'static,
    {
        let mut file = File::open(local_path)
            .await
            .context("打开本地文件失败")?;

        let file_size = file
            .metadata()
            .await
            .context("获取文件元数据失败")?
            .len() as i64;

        let full_url = format!("{}{}", self.url, remote_path);
        let content_type = mime_guess::from_path(local_path)
            .first_or_octet_stream()
            .to_string();

        let total_chunks = ((file_size as usize) + chunk_size - 1) / chunk_size;
        let mut uploaded = 0u64;

        for chunk_index in 0..total_chunks {
            let start = (chunk_index * chunk_size) as u64;
            let remaining = file_size as usize - start as usize;
            let current_chunk_size = std::cmp::min(chunk_size, remaining);

            file.seek(std::io::SeekFrom::Start(start))
                .await
                .context("定位文件失败")?;

            let mut buffer = vec![0u8; current_chunk_size];
            file.read_exact(&mut buffer)
                .await
                .context("读取文件分片失败")?;

            let end = start + current_chunk_size as u64;
            let content_range = format!("bytes {}-{}/{}", start, end - 1, file_size);

            let resp = self
                .client
                .put(&full_url)
                .header("Content-Type", &content_type)
                .header("Content-Range", &content_range)
                .body(buffer)
                .send()
                .await
                .context("上传分片失败")?;

            if !resp.status().is_success() && resp.status() != reqwest::StatusCode::NO_CONTENT {
                return Err(anyhow::anyhow!(
                    "上传分片失败: HTTP {}",
                    resp.status()
                ));
            }

            uploaded = end;
            let progress = (uploaded as f64 / file_size as f64) * 100.0;

            progress_callback(ProgressInfo {
                file_path: remote_path.to_string(),
                file_size,
                transferred: uploaded as i64,
                progress,
            });
        }

        Ok(())
    }

    pub async fn delete_file(&self, path: &str) -> Result<()> {
        let full_url = format!("{}{}", self.url, path);
        let resp = self
            .client
            .delete(&full_url)
            .send()
            .await
            .context("删除文件失败")?;

        if resp.status().is_success() || resp.status() == reqwest::StatusCode::NO_CONTENT {
            Ok(())
        } else {
            Err(anyhow::anyhow!("删除失败: HTTP {}", resp.status()))
        }
    }

    pub async fn create_folder(&self, path: &str) -> Result<()> {
        let full_url = format!("{}{}", self.url, path);
        let resp = self
            .client
            .request(reqwest::Method::from_bytes(b"MKCOL")?, &full_url)
            .send()
            .await
            .context("创建文件夹失败")?;

        if resp.status().is_success() || resp.status() == reqwest::StatusCode::CREATED {
            Ok(())
        } else {
            Err(anyhow::anyhow!("创建文件夹失败: HTTP {}", resp.status()))
        }
    }

    pub async fn rename_file(&self, old_path: &str, new_name: &str) -> Result<()> {
        let full_old_url = format!("{}{}", self.url, old_path);

        let parent = Path::new(old_path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "/".to_string());

        let new_path = if parent == "/" || parent.is_empty() {
            format!("/{}", new_name)
        } else {
            format!("{}/{}", parent, new_name)
        };

        let full_new_url = format!("{}{}", self.url, new_path);

        let resp = self
            .client
            .request(reqwest::Method::from_bytes(b"MOVE")?, &full_old_url)
            .header("Destination", &full_new_url)
            .header("Overwrite", "T")
            .send()
            .await
            .context("重命名失败")?;

        if resp.status().is_success() {
            Ok(())
        } else {
            Err(anyhow::anyhow!("重命名失败: HTTP {}", resp.status()))
        }
    }

    pub async fn get_file_content(&self, path: &str) -> Result<String> {
        let full_url = format!("{}{}", self.url, path);
        let resp = self
            .client
            .get(&full_url)
            .send()
            .await
            .context("获取文件内容失败")?;

        if resp.status().is_success() {
            resp.text().await.context("读取文件内容失败")
        } else {
            Err(anyhow::anyhow!("获取文件内容失败: HTTP {}", resp.status()))
        }
    }

    pub async fn get_file_metadata(&self, path: &str) -> Result<WebDAVFile> {
        let full_url = format!("{}{}", self.url, path);
        let resp = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND")?, &full_url)
            .header("Depth", "0")
            .send()
            .await
            .context("获取文件元数据失败")?;

        let status = resp.status();
        let body = resp.text().await.context("读取响应失败")?;

        if !status.is_success() {
            return Err(anyhow::anyhow!("获取文件元数据失败: HTTP {}", status));
        }

        let files = self.parse_propfind_response(&body, path)?;
        files
            .into_iter()
            .find(|f| f.path == path || f.path.ends_with(&path))
            .ok_or_else(|| anyhow::anyhow!("文件未找到"))
    }

    pub async fn upload_file_with_etag<F>(
        &self,
        local_path: &str,
        remote_path: &str,
        if_none_match: Option<String>,
        mut progress_callback: F,
    ) -> Result<UploadResult>
    where
        F: FnMut(ProgressInfo) + Send + 'static,
    {
        let file = File::open(local_path)
            .await
            .context("打开本地文件失败")?;

        let file_size = file
            .metadata()
            .await
            .context("获取文件元数据失败")?
            .len() as i64;

        let full_url = format!("{}{}", self.url, remote_path);
        let content_type = mime_guess::from_path(local_path)
            .first_or_octet_stream()
            .to_string();

        let mut request_builder = self
            .client
            .put(&full_url)
            .header("Content-Type", content_type)
            .header("Content-Length", file_size.to_string());

        if let Some(etag) = if_none_match {
            request_builder = request_builder.header("If-None-Match", etag);
        }

        let remote_path_clone = remote_path.to_string();
        let callback_mutex = Mutex::new(progress_callback);
        let stream = ReaderStream::new(file);

        let mut transferred = 0i64;
        let progress_stream = stream.map(move |result| {
            result.map(|bytes| {
                let len = bytes.len() as i64;
                transferred += len;
                let progress = if file_size > 0 {
                    (transferred as f64 / file_size as f64) * 100.0
                } else {
                    0.0
                };

                let info = ProgressInfo {
                    file_path: remote_path_clone.clone(),
                    file_size,
                    transferred,
                    progress,
                };

                if let Ok(mut cb) = callback_mutex.lock() {
                    cb(info);
                }

                Bytes::from(bytes)
            })
        });

        let body = Body::wrap_stream(progress_stream);
        let request = request_builder.body(body).build()?;
        let resp = self
            .client
            .execute(request)
            .await
            .context("上传文件失败")?;

        let status = resp.status();
        let etag = resp
            .headers()
            .get("ETag")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        if status.is_success() || status == reqwest::StatusCode::NO_CONTENT {
            if let Ok(mut cb) = callback_mutex.lock() {
                cb(ProgressInfo {
                    file_path: remote_path.to_string(),
                    file_size,
                    transferred: file_size,
                    progress: 100.0,
                });
            }
            Ok(UploadResult {
                success: true,
                conflict: false,
                etag,
            })
        } else if status == reqwest::StatusCode::PRECONDITION_FAILED {
            Ok(UploadResult {
                success: false,
                conflict: true,
                etag: None,
            })
        } else {
            Err(anyhow::anyhow!("上传失败: HTTP {}", status))
        }
    }

    pub async fn download_file_to_temp(
        &self,
        remote_path: &str,
    ) -> Result<(String, String, Option<String>)> {
        let temp_dir = std::env::temp_dir();
        let file_name = Path::new(remote_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "temp_file".to_string());

        let unique_name = format!(
            "{}_{}",
            uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("temp"),
            file_name
        );
        let local_path = temp_dir.join(unique_name).to_string_lossy().to_string();

        self.download_file(remote_path, &local_path, |_| {})
            .await?;

        let metadata = self.get_file_metadata(remote_path).await?;
        Ok((local_path, file_name, metadata.etag))
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UploadResult {
    pub success: bool,
    pub conflict: bool,
    pub etag: Option<String>,
}
