use std::io::{self, Write};
use std::path::Path;

fn check_file(path: &Path) -> io::Result<&Path> {
    if !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("phalbum"))
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Expected an absolute .phalbum path",
        ));
    }
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_symlink() || !metadata.is_file() => {
            return Err(io::Error::other("Album must be a regular file"));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    Ok(path)
}

pub fn read_file(path: &Path) -> io::Result<String> {
    std::fs::read_to_string(check_file(path)?)
}

pub fn write_file(path: &Path, json: &str, create: bool) -> io::Result<()> {
    let path = check_file(path)?;
    let directory = path
        .parent()
        .ok_or_else(|| io::Error::other("Album has no parent folder"))?;
    let mut temp = tempfile::NamedTempFile::new_in(directory)?;
    temp.write_all(json.as_bytes())?;
    temp.as_file().sync_all()?;
    if create {
        temp.persist_noclobber(path).map_err(|error| error.error)?;
    } else {
        temp.persist(path).map_err(|error| error.error)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_an_album_directly_in_its_library_without_a_marker() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("renamed.phalbum");
        write_file(&path, "{\"title\":\"Summer: / trips\"}", true).unwrap();
        assert_eq!(read_file(&path).unwrap(), "{\"title\":\"Summer: / trips\"}");
        assert!(write_file(&path, "duplicate", true).is_err());
        assert_eq!(read_file(&path).unwrap(), "{\"title\":\"Summer: / trips\"}");
        write_file(&path, "updated", false).unwrap();
        assert_eq!(read_file(&path).unwrap(), "updated");
        assert!(!dir.path().join("Albums").exists());
        assert!(!dir.path().join(".phalbummakr").exists());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
        assert!(write_file(&dir.path().join("wrong.album.json"), "{}", true).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn failed_replacement_preserves_the_original_and_removes_the_temporary_file() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("locked.phalbum");
        write_file(&path, "original", true).unwrap();
        let lock = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        assert!(write_file(&path, "replacement", false).is_err());
        drop(lock);
        assert_eq!(read_file(&path).unwrap(), "original");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
        write_file(&path, "replacement", false).unwrap();
    }
}
