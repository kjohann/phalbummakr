use std::io::{self, Write};
use std::path::{Path, PathBuf};

const FOLDER: &str = ".phalbummakr";
pub const LAYOUTS: &str = "layouts.json";
/// Reviewed Photos and where the user was in each Folder while Sorting.
pub const SORTING: &str = "sorting.json";
pub const CONTENT_INDEX: &str = "content-index.json";

fn data_file(root: &Path, file: &str) -> io::Result<PathBuf> {
    if !root.is_absolute() || !root.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Expected the absolute path of an existing Library folder",
        ));
    }
    Ok(root.join(FOLDER).join(file))
}

/// Reads one of the Library's files in `.phalbummakr/`, or `None` when it was not saved yet.
pub fn read(root: &Path, file: &str) -> io::Result<Option<String>> {
    match std::fs::read_to_string(data_file(root, file)?) {
        Ok(json) => Ok(Some(json)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

/// Replaces one of the Library's files in `.phalbummakr/`, creating the folder when it is missing.
pub fn write(root: &Path, file: &str, json: &str) -> io::Result<()> {
    let path = data_file(root, file)?;
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
    fn a_library_without_the_file_reads_as_none_and_stays_untouched() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read(dir.path(), LAYOUTS).unwrap(), None);
        assert_eq!(read(dir.path(), SORTING).unwrap(), None);
        assert!(!dir.path().join(".phalbummakr").exists());
    }

    #[test]
    fn saves_each_file_in_the_phalbummakr_folder_and_replaces_it() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), LAYOUTS, "{\"layouts\":[]}").unwrap();
        write(dir.path(), SORTING, "{\"reviewed\":[]}").unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.path().join(".phalbummakr/layouts.json")).unwrap(),
            "{\"layouts\":[]}"
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join(".phalbummakr/sorting.json")).unwrap(),
            "{\"reviewed\":[]}"
        );
        write(dir.path(), SORTING, "updated").unwrap();
        assert_eq!(read(dir.path(), SORTING).unwrap().as_deref(), Some("updated"));
        assert_eq!(
            read(dir.path(), LAYOUTS).unwrap().as_deref(),
            Some("{\"layouts\":[]}")
        );
        assert_eq!(
            std::fs::read_dir(dir.path().join(".phalbummakr"))
                .unwrap()
                .count(),
            2
        );
    }

    #[test]
    fn rejects_relative_or_missing_libraries() {
        let dir = tempfile::tempdir().unwrap();
        assert!(write(Path::new("relative"), LAYOUTS, "{}").is_err());
        assert!(read(Path::new("relative"), SORTING).is_err());
        assert!(write(&dir.path().join("missing"), SORTING, "{}").is_err());
        assert!(!dir.path().join("missing").exists());
    }
}
