mod library;
mod photos;
mod settings;

use base64::Engine;
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

#[tauri::command]
async fn scan_photos(root: String) -> Result<photos::ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || photos::scan_library(Path::new(&root)))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn photo_thumbnail(
    app: tauri::AppHandle,
    root: String,
    path: String,
    revision: String,
) -> Result<String, String> {
    let cache = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("thumbnails");
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = photos::thumbnail(Path::new(&root), &cache, &path, &revision)?;
        Ok(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
    })
    .await
    .map_err(|error| error.to_string())?
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
            remember_library,
            scan_photos,
            photo_thumbnail
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
