mod webdav;
mod db;
mod search;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            init_app,
            add_server,
            list_servers,
            remove_server,
            test_connection,
            list_files,
            download_file,
            upload_file,
            upload_file_chunked,
            delete_file,
            create_folder,
            rename_file,
            search_files,
            search_content,
            get_file_content,
            refresh_cache,
            start_edit,
            save_edit,
            force_save,
            get_remote_content,
            is_editable,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn init_app(state: tauri::State<'_, AppState>) -> Result<String, String> {
    state.init().await.map_err(|e| e.to_string())?;
    Ok("初始化成功".to_string())
}

#[tauri::command]
async fn add_server(
    state: tauri::State<'_, AppState>,
    name: String,
    url: String,
    username: String,
    password: String,
    server_type: String,
) -> Result<i64, String> {
    state.add_server(&name, &url, &username, &password, &server_type)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_servers(state: tauri::State<'_, AppState>) -> Result<Vec<state::Server>, String> {
    state.list_servers().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_server(state: tauri::State<'_, AppState>, id: i64) -> Result<String, String> {
    state.remove_server(id).await.map_err(|e| e.to_string())?;
    Ok("删除成功".to_string())
}

#[tauri::command]
async fn test_connection(
    url: String,
    username: String,
    password: String,
    server_type: String,
) -> Result<String, String> {
    let client = webdav::WebDAVClient::new(&url, &username, &password, &server_type);
    client
        .test_connection()
        .await
        .map_err(|e| e.to_string())?;
    Ok("连接成功".to_string())
}

#[tauri::command]
async fn list_files(
    state: tauri::State<'_, AppState>,
    server_id: i64,
    path: String,
) -> Result<Vec<state::FileItem>, String> {
    state.list_files(server_id, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn download_file(
    state: tauri::State<'_, AppState>,
    server_id: i64,
    remote_path: String,
    local_path: String,
    progress_window: tauri::Window,
) -> Result<String, String> {
    state
        .download_file(server_id, &remote_path, &local_path, move |progress| {
            let _ = progress_window.emit("download_progress", progress);
        })
        .await
        .map_err(|e| e.to_string())?;
    Ok("下载完成".to_string())
}

#[tauri::command]
async fn upload_file(
    state: tauri::State<'_, AppState>,
    server_id: i64,
    local_path: String,
    remote_path: String,
    progress_window: tauri::Window,
) -> Result<String, String> {
    state
        .upload_file(server_id, &local_path, &remote_path, move |progress| {
            let _ = progress_window.emit("upload_progress", progress);
        })
        .await
        .map_err(|e| e.to_string())?;
    Ok("上传完成".to_string())
}

#[tauri::command]
async fn upload_file_chunked(
    state: tauri::State<'_, AppState>,
    server_id: i64,
    local_path: String,
    remote_path: String,
    chunk_size: usize,
    progress_window: tauri::Window,
) -> Result<String, String> {
    state
        .upload_file_chunked(
            server_id,
            &local_path,
            &remote_path,
            chunk_size,
            move |progress| {
                let _ = progress_window.emit("upload_progress", progress);
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok("上传完成".to_string())
}

#[tauri::command]
async fn delete_file(
    state: tauri::State<'_, AppState>,
    server_id: i64,
    path: String,
) -> Result<String, String> {
    state.delete_file(server_id, &path)
        .await
        .map_err(|e| e.to_string())?;
    Ok("删除成功".to_string())
}

#[tauri::command]
async fn create_folder(
    state: tauri::State<'_, AppState>,
    server_id: i64,
    path: String,
) -> Result<String, String> {
    state.create_folder(server_id, &path)
        .await
        .map_err(|e| e.to_string())?;
    Ok("创建成功".to_string())
}

#[tauri::command]
async fn rename_file(
    state: tauri::State<'_, AppState>,
    server_id: i64,
    old_path: String,
    new_name: String,
) -> Result<String, String> {
    state.rename_file(server_id, &old_path, &new_name)
        .await
        .map_err(|e| e.to_string())?;
    Ok("重命名成功".to_string())
}

#[tauri::command]
async fn search_files(
    state: tauri::State<'_, AppState>,
    server_id: Option<i64>,
    query: String,
) -> Result<Vec<state::FileItem>, String> {
    state.search_files(server_id, &query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn search_content(
    state: tauri::State<'_, AppState>,
    server_id: Option<i64>,
    query: String,
) -> Result<Vec<state::SearchResult>, String> {
    state.search_content(server_id, &query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_file_content(
    state: tauri::State<'_, AppState>,
    server_id: i64,
    path: String,
) -> Result<String, String> {
    state.get_file_content(server_id, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn refresh_cache(
    state: tauri::State<'_, AppState>,
    server_id: i64,
    path: String,
) -> Result<String, String> {
    state.refresh_cache(server_id, &path)
        .await
        .map_err(|e| e.to_string())?;
    Ok("刷新成功".to_string())
}

#[tauri::command]
async fn start_edit(
    state: tauri::State<'_, AppState>,
    server_id: i64,
    path: String,
) -> Result<state::LocalEdit, String> {
    state
        .start_edit(server_id, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_edit(
    state: tauri::State<'_, AppState>,
    server_id: i64,
    path: String,
    content: String,
    original_etag: Option<String>,
) -> Result<state::SyncResult, String> {
    state
        .save_edit(server_id, &path, &content, original_etag)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn force_save(
    state: tauri::State<'_, AppState>,
    server_id: i64,
    path: String,
    content: String,
) -> Result<state::SyncResult, String> {
    state
        .force_save(server_id, &path, &content)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_remote_content(
    state: tauri::State<'_, AppState>,
    server_id: i64,
    path: String,
) -> Result<(String, Option<String>), String> {
    state
        .get_remote_content(server_id, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn is_editable(name: String) -> bool {
    AppState::is_editable_file(&name)
}
