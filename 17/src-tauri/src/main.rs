#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod screenshot;
mod ocr;
mod rules;
mod script_executor;
mod window_manager;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_window_label,
            set_always_on_top,
            set_click_through,
            show_annotation_window,
            hide_annotation_window,
            start_selection_mode,
            stop_selection_mode,
            get_screen_size,
            get_physical_screen_size_cmd,
            get_dpi_scale_cmd,
            get_dpi_info_cmd,
            capture_full_screen_base64,
            capture_region,
            perform_ocr_on_region,
            full_screen_ocr,
            sync_rules,
            sync_scripts,
            test_rules_with_text,
            test_script,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn get_window_label(window: tauri::WebviewWindow) -> String {
    window.label().to_string()
}

#[tauri::command]
fn set_always_on_top(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    window
        .set_always_on_top(enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_click_through(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn show_annotation_window(app: tauri::AppHandle) -> Result<(), String> {
    window_manager::show_annotation_window(&app)
}

#[tauri::command]
fn hide_annotation_window(app: tauri::AppHandle) -> Result<(), String> {
    window_manager::hide_annotation_window(&app)
}

#[tauri::command]
fn start_selection_mode(app: tauri::AppHandle) -> Result<(), String> {
    window_manager::start_selection_mode(&app)
}

#[tauri::command]
fn stop_selection_mode(app: tauri::AppHandle) -> Result<(), String> {
    window_manager::stop_selection_mode(&app)
}

#[tauri::command]
fn get_screen_size() -> Result<(u32, u32), String> {
    screenshot::get_screen_size().map_err(|e| e.to_string())
}

#[tauri::command]
fn capture_full_screen_base64() -> Result<String, String> {
    screenshot::capture_full_screen_base64().map_err(|e| e.to_string())
}

#[tauri::command]
fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<Vec<u8>, String> {
    screenshot::capture_region(x, y, width, height).map_err(|e| e.to_string())
}

#[tauri::command]
fn perform_ocr_on_region(
    app: tauri::AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    language: String,
) -> Result<(), String> {
    tokio::spawn(async move {
        let result = ocr::perform_ocr_on_region(x, y, width, height, &language)
            .map_err(|e| e.to_string());

        match result {
            Ok(ocr_result) => {
                let _ = app.emit("ocr-result", &ocr_result);

                if let Some(rule) = rules::find_matching_rule(&ocr_result.raw_text) {
                    let capture_groups = rule.capture_groups(&ocr_result.raw_text);
                    let _ = app.emit(
                        "rule-match",
                        serde_json::json!({
                            "rule_id": rule.id,
                            "rule_name": rule.name,
                            "matched_text": rule.matched_text(&ocr_result.raw_text),
                            "capture_groups": capture_groups,
                        }),
                    );

                    if !rule.script_id.is_empty() {
                        if let Err(e) =
                            script_executor::execute_script(&rule.script_id, &capture_groups)
                        {
                            eprintln!("Script execution error: {}", e);
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("OCR error: {}", e);
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn full_screen_ocr(language: String) -> Result<ocr::OCRResult, String> {
    ocr::full_screen_ocr(&language).map_err(|e| e.to_string())
}

#[tauri::command]
fn sync_rules(rules: Vec<rules::Rule>) -> Result<(), String> {
    rules::sync_rules(rules);
    Ok(())
}

#[tauri::command]
fn sync_scripts(scripts: Vec<script_executor::Script>) -> Result<(), String> {
    script_executor::sync_scripts(scripts);
    Ok(())
}

#[tauri::command]
fn test_rules_with_text(text: String) -> Result<(String, Vec<String>), String> {
    if let Some(rule) = rules::find_matching_rule(&text) {
        let captures = rule.capture_groups(&text);
        Ok((rule.name, captures))
    } else {
        Ok(("".to_string(), vec![]))
    }
}

#[tauri::command]
fn test_script(script: script_executor::Script) -> Result<(), String> {
    script_executor::execute_script_direct(&script, &[]).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_physical_screen_size_cmd() -> Result<(u32, u32), String> {
    screenshot::get_physical_screen_size().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_dpi_scale_cmd() -> Result<f64, String> {
    Ok(screenshot::get_dpi_scale())
}

#[tauri::command]
fn get_dpi_info_cmd() -> Result<(f64, (u32, u32), (u32, u32)>, String> {
    screenshot::get_dpi_info().map_err(|e| e.to_string())
}
