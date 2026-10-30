mod library;
mod settings;

use std::path::{Path, PathBuf};
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello from Rust, {name}!")
}

fn settings_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|dir| dir.join("settings.json"))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn is_library(folder: String) -> bool {
    library::is_library(Path::new(&folder))
}

#[tauri::command]
fn create_library(folder: String) -> Result<(), String> {
    library::create_library(Path::new(&folder)).map_err(|error| error.to_string())
}

#[tauri::command]
fn recall_library(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(settings::read_last_library(&settings_file(&app)?)
        .map(|root| root.to_string_lossy().into_owned()))
}

#[tauri::command]
fn remember_library(app: tauri::AppHandle, root: String) -> Result<(), String> {
    settings::write_last_library(&settings_file(&app)?, Path::new(&root))
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            is_library,
            create_library,
            recall_library,
            remember_library
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
