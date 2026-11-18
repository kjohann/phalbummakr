use std::io::{self, Write};
use std::path::{Path, PathBuf};

const FOLDER: &str = ".phalbummakr";
const FILE: &str = "layouts.json";

fn library_file(root: &Path) -> io::Result<PathBuf> {
    if !root.is_absolute() || !root.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Expected the absolute path of an existing Library folder",
        ));
    }
    Ok(root.join(FOLDER).join(FILE))
}

/// Reads the Library's Layout Library, or `None` when none was saved yet.
pub fn read_library(root: &Path) -> io::Result<Option<String>> {
    match std::fs::read_to_string(library_file(root)?) {
        Ok(json) => Ok(Some(json)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

/// Saves the Layout Library, creating `.phalbummakr/` when it is missing.
pub fn write_library(root: &Path, json: &str) -> io::Result<()> {
    let path = library_file(root)?;
    let folder = root.join(FOLDER);
    std::fs::create_dir_all(&folder)?;
    let mut temp = tempfile::NamedTempFile::new_in(&folder)?;
    temp.write_all(json.as_bytes())?;
    temp.as_file().sync_all()?;
    temp.persist(path).map_err(|error| error.error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_library_without_a_layout_library_reads_as_none_and_stays_untouched() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_library(dir.path()).unwrap(), None);
        assert!(!dir.path().join(".phalbummakr").exists());
    }

    #[test]
    fn saves_the_layout_library_in_the_phalbummakr_folder_and_replaces_it() {
        let dir = tempfile::tempdir().unwrap();
        write_library(dir.path(), "{\"layouts\":[]}").unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.path().join(".phalbummakr/layouts.json")).unwrap(),
            "{\"layouts\":[]}"
        );
        write_library(dir.path(), "updated").unwrap();
        assert_eq!(
            read_library(dir.path()).unwrap().as_deref(),
            Some("updated")
        );
        assert_eq!(
            std::fs::read_dir(dir.path().join(".phalbummakr"))
                .unwrap()
                .count(),
            1
        );
    }

    #[test]
    fn rejects_relative_or_missing_libraries() {
        let dir = tempfile::tempdir().unwrap();
        assert!(write_library(Path::new("relative"), "{}").is_err());
        assert!(read_library(Path::new("relative")).is_err());
        assert!(write_library(&dir.path().join("missing"), "{}").is_err());
        assert!(!dir.path().join("missing").exists());
    }
}
