mod albums;
mod fonts;
mod photos;
mod settings;

use base64::Engine;
use std::path::{Path, PathBuf};
use tauri::Manager;

fn settings_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|dir| dir.join("settings.json"))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn album_settings(app: tauri::AppHandle) -> Result<settings::AlbumSettings, String> {
    settings::read_album_settings(&settings_file(&app)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_confirm_spread_deletion(app: tauri::AppHandle, value: bool) -> Result<(), String> {
    settings::set_confirm_spread_deletion(&settings_file(&app)?, value)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_confirm_slot_deletion(app: tauri::AppHandle, value: bool) -> Result<(), String> {
    settings::set_confirm_slot_deletion(&settings_file(&app)?, value)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn remember_album(app: tauri::AppHandle, path: String) -> Result<(), String> {
    settings::remember_album(&settings_file(&app)?, Path::new(&path))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn forget_album(app: tauri::AppHandle, path: String) -> Result<(), String> {
    settings::forget_album(&settings_file(&app)?, Path::new(&path))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn close_album(app: tauri::AppHandle) -> Result<(), String> {
    settings::clear_last_album(&settings_file(&app)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn album_exists(path: String) -> Result<bool, String> {
    match std::fs::metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
async fn read_album_file(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || albums::read_file(Path::new(&path)))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn write_album_file(path: String, json: String, create: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        albums::write_file(Path::new(&path), &json, create)
    })
    .await
    .map_err(|error| error.to_string())?
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

#[tauri::command]
async fn photo_preview(
    app: tauri::AppHandle,
    root: String,
    path: String,
) -> Result<String, String> {
    let cache = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("previews");
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = photos::preview(Path::new(&root), &cache, &path)?;
        Ok(format!(
            "data:image/jpeg;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn photo_page_thumbnail(
    app: tauri::AppHandle,
    root: String,
    path: String,
) -> Result<String, String> {
    let cache = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("thumbnails");
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = photos::page_thumbnail(Path::new(&root), &cache, &path)?;
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
            album_settings,
            set_confirm_spread_deletion,
            set_confirm_slot_deletion,
            remember_album,
            forget_album,
            close_album,
            album_exists,
            read_album_file,
            write_album_file,
            scan_photos,
            photo_thumbnail,
            photo_page_thumbnail,
            photo_preview,
            list_system_fonts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn list_system_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(fonts::system_fonts)
        .await
        .map_err(|error| error.to_string())?
}
