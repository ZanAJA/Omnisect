use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::Manager;

struct BackendProcess(Mutex<Option<Child>>);

fn repo_root() -> PathBuf {
  if let Ok(root) = std::env::var("OMNISECT_ROOT") {
    return PathBuf::from(root);
  }

  // apps/desktop/src-tauri -> repo root
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("../../..")
    .canonicalize()
    .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.."))
}

fn backend_dir() -> PathBuf {
  repo_root().join("backend")
}

fn spawn_backend() -> Option<Child> {
  let dir = backend_dir();
  let server = dir.join("server.js");
  if !server.exists() {
    eprintln!("[omnisect] backend missing at {}", server.display());
    return None;
  }

  let mut cmd = Command::new("node");
  cmd.arg("server.js")
    .current_dir(&dir)
    .env("HOST", std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".into()))
    .env("PORT", std::env::var("PORT").unwrap_or_else(|_| "3001".into()))
    .env("OMNISECT_ROOT", repo_root())
    .stdin(Stdio::null())
    .stdout(Stdio::inherit())
    .stderr(Stdio::inherit());

  match cmd.spawn() {
    Ok(child) => {
      println!(
        "[omnisect] backend started (pid {}) from {}",
        child.id(),
        dir.display()
      );
      Some(child)
    }
    Err(err) => {
      eprintln!("[omnisect] failed to start backend: {err}");
      None
    }
  }
}

#[tauri::command]
fn get_paths() -> serde_json::Value {
  serde_json::json!({
    "repoRoot": repo_root().to_string_lossy(),
    "backendDir": backend_dir().to_string_lossy(),
    "apiBase": format!(
      "http://127.0.0.1:{}",
      std::env::var("PORT").unwrap_or_else(|_| "3001".into())
    ),
  })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .manage(BackendProcess(Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![get_paths])
    .setup(|app| {
      let child = spawn_backend();
      if let Some(state) = app.try_state::<BackendProcess>() {
        *state.0.lock().unwrap() = child;
      }
      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { .. } = event {
        if let Some(state) = window.app_handle().try_state::<BackendProcess>() {
          if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
              let _ = child.kill();
              let _ = child.wait();
            }
          }
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running Omnisect desktop");
}
