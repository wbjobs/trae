use serde::{Deserialize, Serialize};
use std::sync::Mutex;

static SCRIPTS: Mutex<Vec<Script>> = Mutex::new(Vec::new());

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Script {
    pub id: String,
    pub name: String,
    pub description: String,
    pub actions: Vec<ScriptAction>,
    pub timeout: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptAction {
    #[serde(rename = "type")]
    pub action_type: String,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpActionConfig {
    pub method: String,
    pub url: String,
    pub headers: Option<std::collections::HashMap<String, String>>,
    pub body: Option<String>,
    #[serde(rename = "use_capture_groups")]
    pub use_capture_groups: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyboardActionConfig {
    pub keys: Vec<String>,
    pub modifiers: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellActionConfig {
    pub command: String,
    pub args: Option<Vec<String>>,
}

pub fn sync_scripts(new_scripts: Vec<Script>) {
    if let Ok(mut scripts) = SCRIPTS.lock() {
        *scripts = new_scripts;
    }
}

pub fn get_script(id: &str) -> Option<Script> {
    let scripts = SCRIPTS.lock().ok()?;
    scripts.iter().find(|s| s.id == id).cloned()
}

fn replace_capture_groups(text: &str, captures: &[String]) -> String {
    let mut result = text.to_string();
    for (i, cap) in captures.iter().enumerate() {
        result = result.replace(&format!("${}", i), cap);
    }
    result
}

pub fn execute_script(script_id: &str, captures: &[String]) -> Result<(), String> {
    let script = get_script(script_id).ok_or_else(|| format!("Script not found: {}", script_id))?;
    execute_script_direct(&script, captures)
}

pub fn execute_script_direct(script: &Script, captures: &[String]) -> Result<(), String> {
    println!("Executing script: {}", script.name);

    for (i, action) in script.actions.iter().enumerate() {
        println!("Action {}: {}", i + 1, action.action_type);
        match action.action_type.as_str() {
            "http" => execute_http_action(action, captures)?,
            "keyboard" => execute_keyboard_action(action)?,
            "shell" => execute_shell_action(action, captures)?,
            other => return Err(format!("Unknown action type: {}", other)),
        }
    }

    Ok(())
}

fn execute_http_action(action: &ScriptAction, captures: &[String]) -> Result<(), String> {
    let config: HttpActionConfig =
        serde_json::from_value(action.config.clone()).map_err(|e| e.to_string())?;

    let use_captures = config.use_capture_groups.unwrap_or(false);

    let url = if use_captures {
        replace_capture_groups(&config.url, captures)
    } else {
        config.url.clone()
    };

    let body = config.body.as_ref().map(|b| {
        if use_captures {
            replace_capture_groups(b, captures)
        } else {
            b.clone()
        }
    });

    println!(
        "HTTP {} {} (body: {})",
        config.method,
        url,
        body.as_deref().unwrap_or("none")
    );

    #[cfg(feature = "http")]
    {
        tokio::spawn(async move {
            let client = reqwest::Client::new();
            let mut builder = match config.method.as_str() {
                "GET" => client.get(&url),
                "POST" => client.post(&url),
                "PUT" => client.put(&url),
                "DELETE" => client.delete(&url),
                _ => client.get(&url),
            };

            if let Some(headers) = config.headers {
                for (k, v) in headers {
                    builder = builder.header(&k, &v);
                }
            }

            if let Some(b) = body {
                builder = builder.body(b);
            }

            match builder.send().await {
                Ok(res) => println!("HTTP response status: {}", res.status()),
                Err(e) => eprintln!("HTTP error: {}", e),
            }
        });
    }

    Ok(())
}

fn execute_keyboard_action(action: &ScriptAction) -> Result<(), String> {
    let config: KeyboardActionConfig =
        serde_json::from_value(action.config.clone()).map_err(|e| e.to_string())?;

    let modifiers = config.modifiers.unwrap_or_default();
    let keys = config.keys;

    println!("Keyboard: {:?} + {:?}", modifiers, keys);

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::*;
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            keybd_event,
            KEYBD_EVENT_FLAGS,
            VIRTUAL_KEY,
        };

        unsafe {
            let modifier_keys = [
                ("ctrl", VK_CONTROL),
                ("alt", VK_MENU),
                ("shift", VK_SHIFT),
                ("meta", VK_LWIN),
            ];

            for m in &modifiers {
                if let Some(&vk) = modifier_keys.iter().find(|(k, _)| k == m).map(|(_, v)| v) {
                    keybd_event(vk.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
                }
            }

            for key in &keys {
                let vk = match key.to_lowercase().as_str() {
                    "a" => b'A',
                    "b" => b'B',
                    "c" => b'C',
                    "v" => b'V',
                    "x" => b'X',
                    "y" => b'Y',
                    "z" => b'Z',
                    "enter" => VK_RETURN.0 as u8,
                    "escape" => VK_ESCAPE.0 as u8,
                    "tab" => VK_TAB.0 as u8,
                    _ => key.as_bytes().get(0).copied().unwrap_or(0),
                };
                keybd_event(vk, 0, KEYBD_EVENT_FLAGS(0), 0);
                keybd_event(vk, 0, KEYBD_EVENT_FLAGS(2), 0);
            }

            for m in modifiers.iter().rev() {
                if let Some(&vk) = modifier_keys.iter().find(|(k, _)| k == m).map(|(_, v)| v) {
                    keybd_event(vk.0 as u8, 0, KEYBD_EVENT_FLAGS(2), 0);
                }
            }
        }
    }

    Ok(())
}

fn execute_shell_action(action: &ScriptAction, captures: &[String]) -> Result<(), String> {
    let config: ShellActionConfig =
        serde_json::from_value(action.config.clone()).map_err(|e| e.to_string())?;

    let args = config.args.unwrap_or_default();
    let args: Vec<String> = args
        .iter()
        .map(|a| replace_capture_groups(a, captures))
        .collect();

    println!("Shell: {} {:?}", config.command, args);

    #[cfg(feature = "shell")]
    {
        tokio::spawn(async move {
            let mut cmd = tokio::process::Command::new(&config.command);
            cmd.args(&args);
            match cmd.output().await {
                Ok(output) => {
                    println!(
                        "Shell stdout: {}",
                        String::from_utf8_lossy(&output.stdout)
                    );
                    if !output.stderr.is_empty() {
                        eprintln!(
                            "Shell stderr: {}",
                            String::from_utf8_lossy(&output.stderr)
                        );
                    }
                }
                Err(e) => eprintln!("Shell error: {}", e),
            }
        });
    }

    Ok(())
}
