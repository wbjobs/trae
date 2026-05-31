use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use std::sync::Mutex;

static ANNOTATION_WINDOW: Mutex<Option<String>> = Mutex::new(None);
static SELECTION_WINDOW: Mutex<Option<String>> = Mutex::new(None);

pub fn show_annotation_window(app: &AppHandle) -> Result<(), String> {
    if let Ok(mut existing) = ANNOTATION_WINDOW.lock() {
        if let Some(label) = existing.as_ref() {
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.show();
                let _ = win.set_always_on_top(true);
                let _ = win.set_ignore_cursor_events(true);
                return Ok(());
            }
        }

        let screen_size = match crate::screenshot::get_screen_size() {
            Ok((w, h)) => (w, h),
            Err(_) => (1920, 1080),
        };

        let label = format!("annotation-{}", uuid::Uuid::new_v4());

        let win = WebviewWindowBuilder::new(app, label.clone(), WebviewUrl::App("index.html".into()))
            .title("Annotation Layer")
            .inner_size(screen_size.0 as f64, screen_size.1 as f64)
            .position(0.0, 0.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(true)
            .build()
            .map_err(|e| e.to_string())?;

        let _ = win.set_ignore_cursor_events(true);
        *existing = Some(label);
    }

    Ok(())
}

pub fn hide_annotation_window(app: &AppHandle) -> Result<(), String> {
    if let Ok(mut existing) = ANNOTATION_WINDOW.lock() {
        if let Some(label) = existing.as_ref() {
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.hide();
            }
        }
    }
    Ok(())
}

pub fn start_selection_mode(app: &AppHandle) -> Result<(), String> {
    if let Ok(mut existing) = SELECTION_WINDOW.lock() {
        let screen_size = match crate::screenshot::get_screen_size() {
            Ok((w, h)) => (w, h),
            Err(_) => (1920, 1080),
        };

        let label = format!("selection-{}", uuid::Uuid::new_v4());

        let win = WebviewWindowBuilder::new(app, label.clone(), WebviewUrl::App("index.html".into()))
            .title("Selection")
            .inner_size(screen_size.0 as f64, screen_size.1 as f64)
            .position(0.0, 0.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(true)
            .focus(true)
            .build()
            .map_err(|e| e.to_string())?;

        let _ = win.set_focus();
        *existing = Some(label);
    }
    Ok(())
}

pub fn stop_selection_mode(app: &AppHandle) -> Result<(), String> {
    if let Ok(mut existing) = SELECTION_WINDOW.lock() {
        if let Some(label) = existing.take() {
            if let Some(win) = app.get_webview_window(&label) {
                let _ = win.close();
            }
        }
    }
    Ok(())
}
