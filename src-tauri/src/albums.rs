use std::io::{self, Write};
use std::path::{Path, PathBuf};

fn album_directory(root: &Path) -> io::Result<PathBuf> {
    if !crate::library::is_library(root) {
        return Err(io::Error::other("Not a Library"));
    }
    let directory = root.join("Albums");
    match std::fs::symlink_metadata(&directory) {
        Ok(metadata) if metadata.is_symlink() || !metadata.is_dir() => {
            return Err(io::Error::other("Albums must be a regular directory"));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    Ok(directory)
}

fn album_path(root: &Path, name: &str) -> io::Result<PathBuf> {
    let stem = name.split('.').next().unwrap_or("").to_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|prefix| {
            stem.strip_prefix(prefix).is_some_and(|suffix| {
                matches!(
                    suffix,
                    "1" | "2"
                        | "3"
                        | "4"
                        | "5"
                        | "6"
                        | "7"
                        | "8"
                        | "9"
                        | "\u{b9}"
                        | "\u{b2}"
                        | "\u{b3}"
                )
            })
        });
    if name.is_empty()
        || name.encode_utf16().count() > 100
        || name.trim() != name
        || name.ends_with('.')
        || name
            .chars()
            .any(|ch| ch < ' ' || "<>:\"/\\|?*".contains(ch))
        || reserved
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Invalid Album name",
        ));
    }
    let path = album_directory(root)?.join(format!("{name}.album.json"));
    match std::fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_symlink() || !metadata.is_file() => {
            return Err(io::Error::other("Album must be a regular file"));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    Ok(path)
}

pub fn list(root: &Path) -> io::Result<Vec<String>> {
    let directory = album_directory(root)?;
    let entries = match std::fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let filename = entry.file_name().into_string().map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "Album filename is not valid Unicode",
            )
        })?;
        if let Some(name) = filename.strip_suffix(".album.json") {
            names.push(name.to_owned());
        }
    }
    names.sort();
    Ok(names)
}

pub fn read(root: &Path, name: &str) -> io::Result<String> {
    std::fs::read_to_string(album_path(root, name)?)
}

pub fn write(root: &Path, name: &str, json: &str, create: bool) -> io::Result<()> {
    let path = album_path(root, name)?;
    let directory = path.parent().expect("Album path has a parent");
    std::fs::create_dir_all(directory)?;
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
    fn creates_lists_opens_and_atomically_replaces_an_album_without_clobbering_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        crate::library::create_library(dir.path()).unwrap();
        assert!(list(dir.path()).unwrap().is_empty());
        write(dir.path(), "Summer", "{\"version\":1}", true).unwrap();
        assert_eq!(list(dir.path()).unwrap(), vec!["Summer"]);
        assert_eq!(read(dir.path(), "Summer").unwrap(), "{\"version\":1}");
        assert!(write(dir.path(), "Summer", "duplicate", true).is_err());
        assert_eq!(read(dir.path(), "Summer").unwrap(), "{\"version\":1}");
        write(dir.path(), "Summer", "{\"version\":2}", false).unwrap();
        assert_eq!(read(dir.path(), "Summer").unwrap(), "{\"version\":2}");
        assert_eq!(
            std::fs::read_dir(dir.path().join("Albums"))
                .unwrap()
                .count(),
            1
        );
    }

    #[test]
    fn rejects_unsafe_paths_and_non_libraries_and_ignores_unrelated_files() {
        let dir = tempfile::tempdir().unwrap();
        assert!(list(dir.path()).is_err());
        crate::library::create_library(dir.path()).unwrap();
        for name in ["", "../outside", r"a\b", "CON", "nul.txt", "a.", "a:b"] {
            assert!(write(dir.path(), name, "{}", true).is_err(), "{name}");
            assert!(read(dir.path(), name).is_err(), "{name}");
        }
        write(dir.path(), "Zulu", "{}", true).unwrap();
        write(dir.path(), "Alpha", "{}", true).unwrap();
        std::fs::write(dir.path().join("Albums").join("ignored.txt"), "").unwrap();
        std::fs::create_dir(dir.path().join("Albums").join("folder.album.json")).unwrap();
        assert_eq!(list(dir.path()).unwrap(), vec!["Alpha", "Zulu"]);
    }

    #[cfg(windows)]
    #[test]
    fn a_failed_replacement_preserves_the_original_and_removes_the_temporary_file() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        crate::library::create_library(dir.path()).unwrap();
        write(dir.path(), "Locked", "original", true).unwrap();
        let lock = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(dir.path().join("Albums").join("Locked.album.json"))
            .unwrap();
        assert!(write(dir.path(), "Locked", "replacement", false).is_err());
        drop(lock);
        assert_eq!(read(dir.path(), "Locked").unwrap(), "original");
        assert_eq!(
            std::fs::read_dir(dir.path().join("Albums"))
                .unwrap()
                .count(),
            1
        );
        write(dir.path(), "Locked", "replacement", false).unwrap();
        assert_eq!(read(dir.path(), "Locked").unwrap(), "replacement");
    }
}
