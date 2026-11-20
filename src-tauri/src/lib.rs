mod albums;
mod exports;
mod fonts;
mod layouts;
mod photos;
mod settings;
mod sorting;

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
fn set_side_pane(app: tauri::AppHandle, pane: settings::SidePane) -> Result<(), String> {
    settings::set_side_pane(&settings_file(&app)?, pane).map_err(|error| error.to_string())
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
async fn read_layout_library(root: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || layouts::read_library(Path::new(&root)))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn write_layout_library(root: String, json: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || layouts::write_library(Path::new(&root), &json))
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
async fn read_photos(root: String, paths: Vec<String>) -> Result<Vec<photos::Photo>, String> {
    tauri::async_runtime::spawn_blocking(move || photos::read_photos(Path::new(&root), &paths))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn folder_names(root: String, folder: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || sorting::folder_names(Path::new(&root), &folder))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn root_albums(root: String) -> Result<Vec<sorting::RootAlbum>, String> {
    tauri::async_runtime::spawn_blocking(move || sorting::root_albums(Path::new(&root)))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn create_folder(root: String, parent: String, name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        sorting::create_folder(Path::new(&root), &parent, &name)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn move_photos(
    root: String,
    moves: Vec<sorting::PhotoMove>,
    albums: Vec<sorting::AlbumRewrite>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        sorting::move_photos(Path::new(&root), &moves, &albums)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn rename_folder(
    root: String,
    rename: sorting::FolderRename,
    albums: Vec<sorting::AlbumRewrite>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        sorting::rename_folder(Path::new(&root), &rename, &albums)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn folder_exists(root: String, folder: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || sorting::folder_exists(Path::new(&root), &folder))
        .await
        .map_err(|error| error.to_string())
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

#[tauri::command]
async fn export_photo(
    root: String,
    path: String,
    request: exports::PhotoRequest,
) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        exports::export_photo(Path::new(&root), &path, request)
    })
    .await
    .map_err(|error| error.to_string())?
    .map(tauri::ipc::Response::new)
}

#[tauri::command]
async fn missing_photos(root: String, paths: Vec<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || exports::missing_photos(Path::new(&root), &paths))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_export_folder(root: String, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let folder = exports::existing_export_folder(Path::new(&root), &name)?;
        tauri_plugin_opener::open_path(folder, None::<&str>).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn prepare_export(root: String, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || exports::prepare_folder(Path::new(&root), &name))
        .await
        .map_err(|error| error.to_string())?
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportPageHeader {
    root: String,
    name: String,
    file_name: String,
    width: u32,
    height: u32,
    dpi: u16,
}

/// Takes a raw body, so a Page's pixels skip JSON: a little-endian `u32` length,
/// that many bytes of JSON `ExportPageHeader`, then the Page's RGBA pixels.
#[tauri::command]
async fn write_export_page(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(body) = request.body() else {
        return Err("Expected the Page's pixels as a raw body.".into());
    };
    let length = body
        .get(..4)
        .map(|bytes| u32::from_le_bytes(bytes.try_into().unwrap()) as usize)
        .ok_or("The Page export is incomplete.")?;
    let header: ExportPageHeader = serde_json::from_slice(
        body.get(4..4 + length).ok_or("The Page export is incomplete.")?,
    )
    .map_err(|error| error.to_string())?;
    let pixels = body[4 + length..].to_vec();
    tauri::async_runtime::spawn_blocking(move || {
        exports::write_page(
            Path::new(&header.root),
            &header.name,
            &header.file_name,
            &pixels,
            header.width,
            header.height,
            header.dpi,
        )
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
            set_side_pane,
            remember_album,
            forget_album,
            close_album,
            album_exists,
            read_album_file,
            write_album_file,
            read_layout_library,
            write_layout_library,
            scan_photos,
            read_photos,
            folder_names,
            root_albums,
            create_folder,
            move_photos,
            rename_folder,
            folder_exists,
            photo_thumbnail,
            photo_page_thumbnail,
            photo_preview,
            export_photo,
            missing_photos,
            open_export_folder,
            prepare_export,
            write_export_page,
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
