use serde::{Deserialize, Serialize};
use std::io;
use std::path::{Path, PathBuf};

#[derive(Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AlbumSettings {
    pub last_album: Option<PathBuf>,
    pub recent_albums: Vec<PathBuf>,
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

#[cfg(test)]
mod tests {
    use super::*;

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
