use serde::{Deserialize, Serialize};
use std::io;
use std::path::{Path, PathBuf};

/// Per-machine app settings. Never stored inside a Library.
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    last_library: Option<PathBuf>,
}

fn read_settings(settings_file: &Path) -> Settings {
    std::fs::read_to_string(settings_file)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn read_last_library(settings_file: &Path) -> Option<PathBuf> {
    read_settings(settings_file).last_library
}

pub fn write_last_library(settings_file: &Path, root: &Path) -> io::Result<()> {
    let mut settings = read_settings(settings_file);
    settings.last_library = Some(root.to_path_buf());
    if let Some(parent) = settings_file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(&settings)?;
    let temp_file = settings_file.with_extension("json.tmp");
    std::fs::write(&temp_file, json)?;
    std::fs::rename(&temp_file, settings_file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_is_remembered_before_a_library_is_opened() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_last_library(&dir.path().join("settings.json")), None);
    }

    #[test]
    fn remembers_the_last_library_across_reads() {
        let dir = tempfile::tempdir().unwrap();
        let settings = dir.path().join("app-data").join("settings.json");
        write_last_library(&settings, Path::new(r"D:\Photos\Family")).unwrap();
        write_last_library(&settings, Path::new(r"D:\Photos\Holidays")).unwrap();
        assert_eq!(
            read_last_library(&settings),
            Some(PathBuf::from(r"D:\Photos\Holidays"))
        );
    }

    #[test]
    fn a_corrupt_settings_file_remembers_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let settings = dir.path().join("settings.json");
        std::fs::write(&settings, "{ not json").unwrap();
        assert_eq!(read_last_library(&settings), None);
    }
}
