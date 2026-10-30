use std::io;
use std::path::Path;

const LIBRARY_MARKER: &str = ".phalbummakr";

pub fn is_library(folder: &Path) -> bool {
    folder.join(LIBRARY_MARKER).is_dir()
}

pub fn create_library(folder: &Path) -> io::Result<()> {
    std::fs::create_dir_all(folder.join(LIBRARY_MARKER))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_folder_is_not_a_library() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!is_library(dir.path()));
    }

    #[test]
    fn creating_a_library_makes_the_folder_a_library() {
        let dir = tempfile::tempdir().unwrap();
        create_library(dir.path()).unwrap();
        assert!(is_library(dir.path()));
        assert!(dir.path().join(LIBRARY_MARKER).is_dir());
    }

    #[test]
    fn a_file_named_like_the_marker_does_not_make_a_library() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(LIBRARY_MARKER), "").unwrap();
        assert!(!is_library(dir.path()));
    }

    #[test]
    fn creating_a_library_twice_is_harmless() {
        let dir = tempfile::tempdir().unwrap();
        create_library(dir.path()).unwrap();
        create_library(dir.path()).unwrap();
        assert!(is_library(dir.path()));
    }
}
