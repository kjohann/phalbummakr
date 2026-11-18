use serde::{Deserialize, Serialize};
use std::io;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AlbumSettings {
    pub last_album: Option<PathBuf>,
    pub recent_albums: Vec<PathBuf>,
    pub confirm_spread_deletion: bool,
    pub confirm_slot_deletion: bool,
    #[serde(alias = "photoPane")]
    pub side_pane: SidePane,
}

impl Default for AlbumSettings {
    fn default() -> Self {
        Self {
            last_album: None,
            recent_albums: Vec::new(),
            confirm_spread_deletion: true,
            confirm_slot_deletion: true,
            side_pane: SidePane::default(),
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SidePane {
    pub width: f64,
    pub collapsed: bool,
    pub compact: bool,
}

impl Default for SidePane {
    fn default() -> Self {
        Self {
            width: 340.0,
            collapsed: false,
            compact: false,
        }
    }
}

pub fn read_album_settings(path: &Path) -> io::Result<AlbumSettings> {
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).map_err(io::Error::other),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(AlbumSettings::default()),
        Err(error) => Err(error),
    }
}

fn write_album_settings(path: &Path, settings: &AlbumSettings) -> io::Result<()> {
    use std::io::Write;
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("Settings file has no parent"))?;
    std::fs::create_dir_all(parent)?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    serde_json::to_writer_pretty(&mut temp, settings)?;
    temp.flush()?;
    temp.persist(path).map_err(|error| error.error)?;
    Ok(())
}

pub fn remember_album(path: &Path, album: &Path) -> io::Result<()> {
    let mut settings = read_album_settings(path)?;
    settings.last_album = Some(album.to_path_buf());
    settings.recent_albums.retain(|entry| entry != album);
    settings.recent_albums.insert(0, album.to_path_buf());
    write_album_settings(path, &settings)
}

pub fn forget_album(path: &Path, album: &Path) -> io::Result<()> {
    let mut settings = read_album_settings(path)?;
    if settings.last_album.as_deref() == Some(album) {
        settings.last_album = None;
    }
    settings.recent_albums.retain(|entry| entry != album);
    write_album_settings(path, &settings)
}

pub fn clear_last_album(path: &Path) -> io::Result<()> {
    let mut settings = read_album_settings(path)?;
    settings.last_album = None;
    write_album_settings(path, &settings)
}

pub fn set_confirm_spread_deletion(path: &Path, value: bool) -> io::Result<()> {
    let mut settings = read_album_settings(path)?;
    settings.confirm_spread_deletion = value;
    write_album_settings(path, &settings)
}

pub fn set_confirm_slot_deletion(path: &Path, value: bool) -> io::Result<()> {
    let mut settings = read_album_settings(path)?;
    settings.confirm_slot_deletion = value;
    write_album_settings(path, &settings)
}

pub fn set_side_pane(path: &Path, pane: SidePane) -> io::Result<()> {
    let mut settings = read_album_settings(path)?;
    settings.side_pane = pane;
    write_album_settings(path, &settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spread_deletion_preference_defaults_to_enabled_and_survives_album_updates() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        assert!(read_album_settings(&path).unwrap().confirm_spread_deletion);
        std::fs::write(&path, r#"{"lastAlbum":null,"recentAlbums":[]}"#).unwrap();
        assert!(read_album_settings(&path).unwrap().confirm_spread_deletion);
        set_confirm_spread_deletion(&path, false).unwrap();
        remember_album(&path, Path::new("first.phalbum")).unwrap();
        assert!(!read_album_settings(&path).unwrap().confirm_spread_deletion);
        set_confirm_spread_deletion(&path, true).unwrap();
        assert!(read_album_settings(&path).unwrap().confirm_spread_deletion);
    }

    #[test]
    fn slot_deletion_preference_defaults_to_enabled_and_persists() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, r#"{"lastAlbum":null,"recentAlbums":[]}"#).unwrap();
        assert!(read_album_settings(&path).unwrap().confirm_slot_deletion);
        set_confirm_slot_deletion(&path, false).unwrap();
        remember_album(&path, Path::new("first.phalbum")).unwrap();
        let saved = read_album_settings(&path).unwrap();
        assert!(!saved.confirm_slot_deletion);
        assert!(saved.confirm_spread_deletion);
    }

    #[test]
    fn side_pane_defaults_to_open_and_persists_across_other_updates() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, r#"{"lastAlbum":null,"recentAlbums":[]}"#).unwrap();
        let pane = read_album_settings(&path).unwrap().side_pane;
        assert_eq!(
            (pane.width, pane.collapsed, pane.compact),
            (340.0, false, false)
        );
        set_side_pane(
            &path,
            SidePane {
                width: 512.0,
                collapsed: true,
                compact: true,
            },
        )
        .unwrap();
        remember_album(&path, Path::new("first.phalbum")).unwrap();
        let pane = read_album_settings(&path).unwrap().side_pane;
        assert_eq!(
            (pane.width, pane.collapsed, pane.compact),
            (512.0, true, true)
        );
    }

    #[test]
    fn side_pane_keeps_the_layout_saved_under_its_old_photo_pane_name() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(
            &path,
            r#"{"lastAlbum":null,"recentAlbums":[],"photoPane":{"width":420.0,"collapsed":true,"compact":true}}"#,
        )
        .unwrap();
        let pane = read_album_settings(&path).unwrap().side_pane;
        assert_eq!(
            (pane.width, pane.collapsed, pane.compact),
            (420.0, true, true)
        );
        remember_album(&path, Path::new("first.phalbum")).unwrap();
        let saved = std::fs::read_to_string(&path).unwrap();
        assert!(saved.contains("\"sidePane\"") && !saved.contains("photoPane"));
    }

    #[test]
    fn remembers_recent_albums_in_order_and_forgets_missing_choices() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        remember_album(&path, Path::new("first.phalbum")).unwrap();
        remember_album(&path, Path::new("second.phalbum")).unwrap();
        remember_album(&path, Path::new("first.phalbum")).unwrap();
        let saved = read_album_settings(&path).unwrap();
        assert_eq!(saved.last_album, Some(PathBuf::from("first.phalbum")));
        assert_eq!(
            saved.recent_albums,
            vec![
                PathBuf::from("first.phalbum"),
                PathBuf::from("second.phalbum")
            ]
        );
        forget_album(&path, Path::new("first.phalbum")).unwrap();
        let saved = read_album_settings(&path).unwrap();
        assert_eq!(saved.last_album, None);
        assert_eq!(saved.recent_albums, vec![PathBuf::from("second.phalbum")]);
    }
}
