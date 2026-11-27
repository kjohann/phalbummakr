use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File, Metadata};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, Weak};
use std::time::{Instant, UNIX_EPOCH};

use crate::{library_data, photos};

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum PhotoIdentity {
    Ready { path: String, hash: String },
    Missing { path: String, hash: Option<String> },
    Error { path: String, message: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentIndexBatch {
    pub identities: Vec<PhotoIdentity>,
    pub hashed_files: u64,
    pub hashed_bytes: u64,
    pub cache_hits: u64,
    pub elapsed_ms: u64,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FileStamp {
    length: u64,
    modified_ns: i128,
    // Legacy entries still retain Missing identities, but cannot produce cache hits.
    #[serde(default)]
    change_token: Option<FileChangeToken>,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "system", rename_all = "camelCase", deny_unknown_fields)]
enum FileChangeToken {
    Windows {
        change_time: i64,
        volume: u32,
        file_id: u64,
    },
    // FAT32/exFAT report no ChangeTime; length and mtime are the only change signal.
    WindowsWithoutChangeTime {
        volume: u32,
        file_id: u64,
    },
    Unix {
        ctime: i64,
        ctime_ns: i64,
        device: u64,
        inode: u64,
    },
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CacheEntry {
    hash: String,
    stamp: FileStamp,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ContentCache {
    version: u32,
    entries: BTreeMap<String, CacheEntry>,
}

// Only content-index requests for the same Library wait for each other.
// Browsing, scanning and previews never acquire this lock.
fn library_lock(root: &Path) -> Result<Arc<Mutex<()>>, String> {
    static LOCKS: OnceLock<Mutex<BTreeMap<PathBuf, Weak<Mutex<()>>>>> = OnceLock::new();
    let mut locks = LOCKS
        .get_or_init(|| Mutex::new(BTreeMap::new()))
        .lock()
        .map_err(|_| "Content-index lock is unavailable; retry.".to_string())?;
    locks.retain(|_, lock| lock.strong_count() > 0);
    if let Some(lock) = locks.get(root).and_then(Weak::upgrade) {
        return Ok(lock);
    }
    let lock = Arc::new(Mutex::new(()));
    locks.insert(root.to_path_buf(), Arc::downgrade(&lock));
    Ok(lock)
}

fn stamp(metadata: &Metadata, change_token: FileChangeToken) -> Result<FileStamp, String> {
    if !metadata.is_file() {
        return Err("Expected a Photo file.".into());
    }
    let modified = metadata.modified().map_err(|error| error.to_string())?;
    let modified_ns = match modified.duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_nanos() as i128,
        Err(error) => -(error.duration().as_nanos() as i128),
    };
    Ok(FileStamp {
        length: metadata.len(),
        modified_ns,
        change_token: Some(change_token),
    })
}

#[cfg(windows)]
fn file_stamp(file: &File) -> Result<FileStamp, String> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        FileBasicInfo, GetFileInformationByHandle, GetFileInformationByHandleEx,
        BY_HANDLE_FILE_INFORMATION, FILE_BASIC_INFO,
    };

    let mut basic = FILE_BASIC_INFO::default();
    let mut identity = BY_HANDLE_FILE_INFORMATION::default();
    // The File owns a live handle, and both buffers match their requested Win32 types.
    unsafe {
        if GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FileBasicInfo,
            (&mut basic as *mut FILE_BASIC_INFO).cast(),
            std::mem::size_of::<FILE_BASIC_INFO>() as u32,
        ) == 0
        {
            return Err(format!(
                "Could not determine Photo change identity: {}",
                std::io::Error::last_os_error()
            ));
        }
        if GetFileInformationByHandle(file.as_raw_handle(), &mut identity) == 0 {
            return Err(format!(
                "Could not determine Photo file identity: {}",
                std::io::Error::last_os_error()
            ));
        }
    }
    stamp(
        &file.metadata().map_err(|error| error.to_string())?,
        windows_change_token(
            basic.ChangeTime,
            identity.dwVolumeSerialNumber,
            ((identity.nFileIndexHigh as u64) << 32) | identity.nFileIndexLow as u64,
        ),
    )
}

#[cfg(all(test, windows))]
thread_local! {
    static SIMULATE_NO_CHANGE_TIME: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

#[cfg(windows)]
fn windows_change_token(change_time: i64, volume: u32, file_id: u64) -> FileChangeToken {
    #[cfg(test)]
    let change_time = if SIMULATE_NO_CHANGE_TIME.get() {
        0
    } else {
        change_time
    };
    if change_time == 0 {
        FileChangeToken::WindowsWithoutChangeTime { volume, file_id }
    } else {
        FileChangeToken::Windows {
            change_time,
            volume,
            file_id,
        }
    }
}

#[cfg(windows)]
fn path_stamp(path: &Path) -> Result<FileStamp, String> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::FILE_READ_ATTRIBUTES;
    // Cache validation needs attributes only, never access to the Photo bytes.
    let file = fs::OpenOptions::new()
        .access_mode(FILE_READ_ATTRIBUTES)
        .open(path)
        .map_err(|error| format!("Could not determine Photo change identity: {error}"))?;
    file_stamp(&file)
}

#[cfg(unix)]
fn unix_stamp(metadata: &Metadata) -> Result<FileStamp, String> {
    use std::os::unix::fs::MetadataExt;
    stamp(
        metadata,
        FileChangeToken::Unix {
            ctime: metadata.ctime(),
            ctime_ns: metadata.ctime_nsec(),
            device: metadata.dev(),
            inode: metadata.ino(),
        },
    )
}

#[cfg(unix)]
fn file_stamp(file: &File) -> Result<FileStamp, String> {
    unix_stamp(&file.metadata().map_err(|error| error.to_string())?)
}

#[cfg(unix)]
fn path_stamp(path: &Path) -> Result<FileStamp, String> {
    unix_stamp(&fs::metadata(path).map_err(|error| error.to_string())?)
}

#[cfg(not(any(windows, unix)))]
fn file_stamp(_file: &File) -> Result<FileStamp, String> {
    Err("Photo change identity is unsupported on this filesystem platform.".into())
}

#[cfg(not(any(windows, unix)))]
fn path_stamp(_path: &Path) -> Result<FileStamp, String> {
    Err("Photo change identity is unsupported on this filesystem platform.".into())
}

fn hash_file(path: &Path) -> Result<(String, FileStamp, u64), String> {
    let before = path_stamp(path)?;
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    if file_stamp(&file)? != before {
        return Err("Photo changed before hashing; retry.".into());
    }
    let mut hash = Sha256::new();
    let mut buffer = [0; 64 * 1024];
    let mut bytes = 0;
    loop {
        let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        bytes += count as u64;
        hash.update(&buffer[..count]);
    }
    if bytes != before.length || file_stamp(&file)? != before || path_stamp(path)? != before {
        return Err("Photo changed while hashing; retry.".into());
    }
    Ok((format!("{:x}", hash.finalize()), before, bytes))
}

fn resolve_path(root: &Path, relative: &str) -> Result<Option<PathBuf>, String> {
    let relative_path = Path::new(relative);
    if !photos::is_photo(relative_path)
        || relative_path.components().any(|part| match part {
            Component::Normal(name) => photos::is_hidden_folder(name),
            _ => true,
        })
    {
        return Err("Invalid Photo path.".into());
    }
    // Validate existing ancestors before calling an absent descendant "missing".
    // Broken links and inaccessible or escaping ancestors are identity errors.
    let mut candidate = root.to_path_buf();
    for component in relative_path.components() {
        candidate.push(component);
        match fs::symlink_metadata(&candidate) {
            Ok(_) => {
                let resolved = candidate
                    .canonicalize()
                    .map_err(|error| error.to_string())?;
                let inside = resolved
                    .strip_prefix(root)
                    .map_err(|_| "The Photo is outside the Library.".to_string())?;
                if inside.components().any(|part| match part {
                    Component::Normal(name) => photos::is_hidden_folder(name),
                    _ => false,
                }) {
                    return Err("Invalid Photo path.".into());
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.to_string()),
        }
    }
    photos::resolve_photo(root, relative).map(|(_, path)| Some(path))
}

pub fn index_paths(root: &Path, paths: &[String]) -> Result<ContentIndexBatch, String> {
    let started = Instant::now();
    if !root.is_absolute() {
        return Err("Expected the absolute path of an existing Library folder.".into());
    }
    let root = root.canonicalize().map_err(|error| error.to_string())?;
    if !root.is_dir() {
        return Err("Expected an existing Library folder.".into());
    }
    let lock = library_lock(&root)?;
    let _guard = lock
        .lock()
        .map_err(|_| "Content-index lock is unavailable; retry.".to_string())?;
    let mut cache = match library_data::read(&root, library_data::CONTENT_INDEX)
        .map_err(|error| format!("Could not read Photo content index: {error}"))?
    {
        Some(json) => serde_json::from_str::<ContentCache>(&json)
            .map_err(|error| format!("Could not parse Photo content index: {error}"))?,
        None => ContentCache {
            version: 1,
            entries: BTreeMap::new(),
        },
    };
    if cache.version != 1 {
        return Err("Unsupported Photo content index version.".into());
    }
    if cache.entries.values().any(|entry| {
        entry.hash.len() != 64
            || !entry
                .hash
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    }) {
        return Err("Invalid SHA-256 identity in Photo content index.".into());
    }
    let mut dirty = false;
    let mut batch = ContentIndexBatch {
        identities: Vec::with_capacity(paths.len()),
        hashed_files: 0,
        hashed_bytes: 0,
        cache_hits: 0,
        elapsed_ms: 0,
    };
    for relative in paths {
        let result = resolve_path(&root, relative).and_then(|path| {
            let Some(path) = path else {
                return Ok(PhotoIdentity::Missing {
                    path: relative.clone(),
                    hash: cache.entries.get(relative).map(|entry| entry.hash.clone()),
                });
            };
            let current = path_stamp(&path)?;
            if let Some(entry) = cache
                .entries
                .get(relative)
                .filter(|entry| entry.stamp == current)
            {
                batch.cache_hits += 1;
                return Ok(PhotoIdentity::Ready {
                    path: relative.clone(),
                    hash: entry.hash.clone(),
                });
            }
            let (hash, stamp, bytes) = hash_file(&path)?;
            batch.hashed_files += 1;
            batch.hashed_bytes += bytes;
            cache.entries.insert(
                relative.clone(),
                CacheEntry {
                    hash: hash.clone(),
                    stamp,
                },
            );
            dirty = true;
            Ok(PhotoIdentity::Ready {
                path: relative.clone(),
                hash,
            })
        });
        batch.identities.push(match result {
            Ok(identity) => identity,
            Err(message) => PhotoIdentity::Error {
                path: relative.clone(),
                message,
            },
        });
    }
    if dirty {
        let json = serde_json::to_string(&cache)
            .map_err(|error| format!("Could not encode Photo content index: {error}"))?;
        library_data::write(&root, library_data::CONTENT_INDEX, &json)
            .map_err(|error| format!("Could not save Photo content index: {error}"))?;
    }
    batch.elapsed_ms = started.elapsed().as_millis() as u64;
    Ok(batch)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ABC_SHA256: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    fn library() -> tempfile::TempDir {
        let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("target");
        tempfile::tempdir_in(base).unwrap()
    }

    fn paths(names: &[&str]) -> Vec<String> {
        names.iter().map(|name| (*name).into()).collect()
    }

    fn ready_hash(identity: &PhotoIdentity) -> &str {
        match identity {
            PhotoIdentity::Ready { hash, .. } => hash,
            other => panic!("Expected ready identity, got {other:?}"),
        }
    }

    #[test]
    fn identical_photos_share_complete_sha256_and_distinct_bytes_do_not() {
        let library = library();
        std::fs::write(library.path().join("original.jpg"), b"abc").unwrap();
        std::fs::write(library.path().join("copy.png"), b"abc").unwrap();
        std::fs::write(library.path().join("edited.jpg"), b"abcd").unwrap();

        let batch = index_paths(
            library.path(),
            &paths(&["original.jpg", "copy.png", "edited.jpg"]),
        )
        .unwrap();

        assert_eq!(ready_hash(&batch.identities[0]), ABC_SHA256);
        assert_eq!(ready_hash(&batch.identities[1]), ABC_SHA256);
        assert_ne!(ready_hash(&batch.identities[2]), ABC_SHA256);
        assert_eq!(
            (batch.hashed_files, batch.hashed_bytes, batch.cache_hits),
            (3, 10, 0)
        );
    }

    #[test]
    fn reopened_index_uses_persistent_cache_without_reading_unchanged_photos() {
        let library = library();
        std::fs::write(library.path().join("photo.jpg"), b"abc").unwrap();
        index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();

        let cached = index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();
        assert_eq!(ready_hash(&cached.identities[0]), ABC_SHA256);
        assert_eq!(
            (cached.hashed_files, cached.hashed_bytes, cached.cache_hits),
            (0, 0, 1)
        );
        assert!(library
            .path()
            .join(".phalbummakr")
            .join("content-index.json")
            .is_file());
    }

    #[test]
    fn missing_photo_keeps_established_identity_but_unknown_identity_is_explicit() {
        let library = library();
        std::fs::write(library.path().join("placed.jpg"), b"abc").unwrap();
        index_paths(library.path(), &paths(&["placed.jpg"])).unwrap();
        std::fs::remove_file(library.path().join("placed.jpg")).unwrap();

        let batch = index_paths(library.path(), &paths(&["placed.jpg", "unknown.jpg"])).unwrap();
        assert!(matches!(&batch.identities[0],
            PhotoIdentity::Missing { path, hash: Some(hash) } if path == "placed.jpg" && hash == ABC_SHA256));
        assert!(matches!(&batch.identities[1],
            PhotoIdentity::Missing { path, hash: None } if path == "unknown.jpg"));
        assert_eq!(
            (batch.hashed_files, batch.hashed_bytes, batch.cache_hits),
            (0, 0, 0)
        );
        let again = index_paths(library.path(), &paths(&["placed.jpg"])).unwrap();
        assert!(matches!(&again.identities[0],
            PhotoIdentity::Missing { hash: Some(hash), .. } if hash == ABC_SHA256));
    }

    #[test]
    fn invalid_cached_identity_is_an_explicit_failure_not_an_unknown_missing_photo() {
        let library = library();
        crate::library_data::write(
            library.path(),
            crate::library_data::CONTENT_INDEX,
            r#"{"version":1,"entries":{"missing.jpg":{"hash":"not-sha256","stamp":{"length":3,"modifiedNs":0}}}}"#,
        ).unwrap();
        let error = index_paths(library.path(), &paths(&["missing.jpg"])).unwrap_err();
        assert!(error.contains("content index"), "{error}");
    }

    #[test]
    fn length_and_modified_time_changes_invalidate_cached_photo_content() {
        let library = library();
        let photo = library.path().join("photo.jpg");
        std::fs::write(&photo, b"abc").unwrap();
        let modified = std::fs::metadata(&photo).unwrap().modified().unwrap();
        index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();

        std::fs::write(&photo, b"abcd").unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(&photo)
            .unwrap()
            .set_modified(modified)
            .unwrap();
        let length_changed = index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();
        assert_ne!(ready_hash(&length_changed.identities[0]), ABC_SHA256);
        assert_eq!(
            (
                length_changed.hashed_files,
                length_changed.hashed_bytes,
                length_changed.cache_hits
            ),
            (1, 4, 0)
        );

        std::fs::write(&photo, b"wxyz").unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(&photo)
            .unwrap()
            .set_modified(modified + std::time::Duration::from_secs(10))
            .unwrap();
        let time_changed = index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();
        assert_ne!(
            ready_hash(&time_changed.identities[0]),
            ready_hash(&length_changed.identities[0])
        );
        assert_eq!(
            (
                time_changed.hashed_files,
                time_changed.hashed_bytes,
                time_changed.cache_hits
            ),
            (1, 4, 0)
        );
    }

    #[test]
    fn equal_length_edit_with_restored_mtime_invalidates_content_then_caches_it() {
        let library = library();
        let photo = library.path().join("photo.jpg");
        fs::write(&photo, b"abc").unwrap();
        let modified = fs::metadata(&photo).unwrap().modified().unwrap();
        let first = index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();
        fs::write(&photo, b"xyz").unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(&photo)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(modified))
            .unwrap();
        assert_eq!(fs::metadata(&photo).unwrap().modified().unwrap(), modified);

        let edited = index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();
        assert_ne!(
            ready_hash(&edited.identities[0]),
            ready_hash(&first.identities[0])
        );
        assert_eq!(
            (edited.hashed_files, edited.hashed_bytes, edited.cache_hits),
            (1, 3, 0)
        );
        let cached = index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();
        assert_eq!(
            ready_hash(&cached.identities[0]),
            ready_hash(&edited.identities[0])
        );
        assert_eq!(
            (cached.hashed_files, cached.hashed_bytes, cached.cache_hits),
            (0, 0, 1)
        );
    }

    #[test]
    fn replacement_file_matching_length_and_mtime_is_not_a_cache_hit() {
        let library = library();
        let photo = library.path().join("photo.jpg");
        fs::write(&photo, b"abc").unwrap();
        let modified = fs::metadata(&photo).unwrap().modified().unwrap();
        index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();

        let replacement = library.path().join("replacement.jpg");
        fs::write(&replacement, b"xyz").unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(&replacement)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(modified))
            .unwrap();
        fs::remove_file(&photo).unwrap();
        fs::rename(replacement, &photo).unwrap();
        assert_eq!(fs::metadata(&photo).unwrap().modified().unwrap(), modified);
        let batch = index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();
        assert_ne!(ready_hash(&batch.identities[0]), ABC_SHA256);
        assert_eq!(
            (batch.hashed_files, batch.hashed_bytes, batch.cache_hits),
            (1, 3, 0)
        );
    }

    #[test]
    fn legacy_cache_revalidates_present_photos_without_discarding_missing_identities() {
        let library = library();
        let photo = library.path().join("existing.jpg");
        fs::write(&photo, b"abc").unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(&photo)
            .unwrap()
            .set_times(
                fs::FileTimes::new().set_modified(UNIX_EPOCH + std::time::Duration::from_secs(2)),
            )
            .unwrap();
        let entry =
            format!(r#"{{"hash":"{ABC_SHA256}","stamp":{{"length":3,"modifiedNs":2000000000}}}}"#);
        library_data::write(
            library.path(),
            library_data::CONTENT_INDEX,
            &format!(
                r#"{{"version":1,"entries":{{"existing.jpg":{entry},"missing.jpg":{entry}}}}}"#
            ),
        )
        .unwrap();
        let requested = paths(&["existing.jpg", "missing.jpg"]);
        let migrated = index_paths(library.path(), &requested).unwrap();
        assert_eq!(ready_hash(&migrated.identities[0]), ABC_SHA256);
        assert_eq!(
            (
                migrated.hashed_files,
                migrated.hashed_bytes,
                migrated.cache_hits
            ),
            (1, 3, 0)
        );
        assert!(
            matches!(&migrated.identities[1], PhotoIdentity::Missing { hash: Some(hash), .. } if hash == ABC_SHA256)
        );

        let reopened = index_paths(library.path(), &requested).unwrap();
        assert_eq!(
            (
                reopened.hashed_files,
                reopened.hashed_bytes,
                reopened.cache_hits
            ),
            (0, 0, 1)
        );
        assert!(
            matches!(&reopened.identities[1], PhotoIdentity::Missing { hash: Some(hash), .. } if hash == ABC_SHA256)
        );
    }

    #[test]
    fn forbidden_paths_and_nonfiles_are_errors_without_hiding_valid_results() {
        let library = library();
        std::fs::write(library.path().join("valid.jpg"), b"abc").unwrap();
        std::fs::create_dir(library.path().join("directory.jpg")).unwrap();
        let requested = paths(&[
            "../outside.jpg",
            "Exports/photo.jpg",
            ".phalbummakr/photo.jpg",
            "nested/Exports/photo.jpg",
            "unsupported.gif",
            "directory.jpg",
            "valid.jpg",
        ]);
        let batch = index_paths(library.path(), &requested).unwrap();
        for (identity, expected_path) in batch.identities[..6].iter().zip(&requested) {
            assert!(
                matches!(identity, PhotoIdentity::Error { path, message }
                if path == expected_path && !message.is_empty()),
                "{identity:?}"
            );
        }
        assert_eq!(ready_hash(&batch.identities[6]), ABC_SHA256);
        assert!(index_paths(Path::new("relative"), &requested).is_err());
        assert!(index_paths(&library.path().join("absent"), &requested).is_err());
        assert!(index_paths(&library.path().join("valid.jpg"), &requested).is_err());
    }

    #[test]
    fn cache_read_parse_and_write_failures_are_explicit_and_retryable() {
        let library = library();
        std::fs::write(library.path().join("photo.jpg"), b"abc").unwrap();
        let folder = library.path().join(".phalbummakr");
        let cache = folder.join("content-index.json");
        std::fs::create_dir(&folder).unwrap();
        std::fs::create_dir(&cache).unwrap();
        assert!(index_paths(library.path(), &paths(&["photo.jpg"]))
            .unwrap_err()
            .contains("read"));
        std::fs::remove_dir(&cache).unwrap();
        std::fs::write(&cache, "{invalid").unwrap();
        assert!(index_paths(library.path(), &paths(&["photo.jpg"]))
            .unwrap_err()
            .contains("parse"));
        std::fs::remove_file(&cache).unwrap();
        std::fs::remove_dir(&folder).unwrap();
        std::fs::write(&folder, "blocked").unwrap();
        let error = index_paths(library.path(), &paths(&["photo.jpg"])).unwrap_err();
        assert!(error.contains("read") || error.contains("save"), "{error}");
        std::fs::remove_file(&folder).unwrap();
        assert_eq!(
            ready_hash(
                &index_paths(library.path(), &paths(&["photo.jpg"]))
                    .unwrap()
                    .identities[0]
            ),
            ABC_SHA256
        );
    }

    #[test]
    fn filesystem_case_aliases_resolve_naturally_without_lowercasing_distinct_paths() {
        let library = library();
        std::fs::write(library.path().join("Photo.jpg"), b"abc").unwrap();
        let case_insensitive = library.path().join("photo.jpg").exists();
        index_paths(library.path(), &paths(&["Photo.jpg"])).unwrap();
        if case_insensitive {
            std::fs::rename(
                library.path().join("Photo.jpg"),
                library.path().join("photo.jpg"),
            )
            .unwrap();
        } else {
            std::fs::write(library.path().join("photo.jpg"), b"abcd").unwrap();
        }
        let batch = index_paths(library.path(), &paths(&["Photo.jpg", "photo.jpg"])).unwrap();
        assert_eq!(ready_hash(&batch.identities[0]), ABC_SHA256);
        if case_insensitive {
            assert_eq!(ready_hash(&batch.identities[1]), ABC_SHA256);
        } else {
            assert_ne!(ready_hash(&batch.identities[1]), ABC_SHA256);
        }
        let json = serde_json::to_value(&batch).unwrap();
        assert_eq!(json["identities"][0]["path"], "Photo.jpg");
        assert_eq!(json["identities"][1]["path"], "photo.jpg");
    }

    #[test]
    fn simultaneous_batches_keep_all_identities_and_hash_shared_requests_only_once() {
        let library = library();
        let names: Vec<String> = (0..8).map(|index| format!("{index}.jpg")).collect();
        for name in &names {
            std::fs::write(library.path().join(name), b"abc").unwrap();
        }
        std::fs::write(library.path().join("shared.jpg"), b"abc").unwrap();
        let barrier = Arc::new(std::sync::Barrier::new(names.len()));
        let total_hashed = std::thread::scope(|scope| {
            let handles: Vec<_> = names
                .iter()
                .map(|name| {
                    let barrier = barrier.clone();
                    let root = library.path();
                    scope.spawn(move || {
                        barrier.wait();
                        index_paths(root, &[name.clone(), "shared.jpg".into()])
                            .unwrap()
                            .hashed_files
                    })
                })
                .collect();
            handles
                .into_iter()
                .map(|handle| handle.join().unwrap())
                .sum::<u64>()
        });
        assert_eq!(total_hashed, 9);
        let cached = index_paths(library.path(), &names).unwrap();
        assert_eq!(
            (cached.hashed_files, cached.hashed_bytes, cached.cache_hits),
            (0, 0, 8)
        );
        assert!(cached
            .identities
            .iter()
            .all(|identity| ready_hash(identity) == ABC_SHA256));
    }

    #[test]
    fn album_placement_edits_do_not_enter_or_invalidate_the_library_content_index() {
        let library = library();
        std::fs::write(library.path().join("photo.jpg"), b"abc").unwrap();
        let album = library.path().join("album.json");
        std::fs::write(&album, r#"{"placements":[]}"#).unwrap();
        index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();
        std::fs::write(&album, r#"{"placements":["photo.jpg","photo.jpg"]}"#).unwrap();
        let cached = index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();
        assert_eq!(
            (cached.hashed_files, cached.hashed_bytes, cached.cache_hits),
            (0, 0, 1)
        );
        assert_eq!(ready_hash(&cached.identities[0]), ABC_SHA256);
    }

    #[cfg(windows)]
    #[test]
    fn filesystem_without_change_time_caches_by_length_and_modified_time() {
        SIMULATE_NO_CHANGE_TIME.set(true);
        let library = library();
        let photo = library.path().join("photo.jpg");
        fs::write(&photo, b"abc").unwrap();

        let first = index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();
        assert_eq!(ready_hash(&first.identities[0]), ABC_SHA256);
        let cached = index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();
        assert_eq!(
            (cached.hashed_files, cached.hashed_bytes, cached.cache_hits),
            (0, 0, 1)
        );

        fs::write(&photo, b"abcd").unwrap();
        let edited = index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();
        SIMULATE_NO_CHANGE_TIME.set(false);
        assert_ne!(ready_hash(&edited.identities[0]), ABC_SHA256);
        assert_eq!(
            (edited.hashed_files, edited.hashed_bytes, edited.cache_hits),
            (1, 4, 0)
        );
    }

    #[cfg(windows)]
    #[test]
    fn inaccessible_photo_is_an_error_and_cache_save_failure_rejects_the_batch() {
        use std::os::windows::fs::OpenOptionsExt;

        let library = library();
        let photo = library.path().join("photo.jpg");
        std::fs::write(&photo, b"abc").unwrap();
        let locked_photo = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&photo)
            .unwrap();
        let failed = index_paths(library.path(), &paths(&["photo.jpg", "missing.jpg"])).unwrap();
        drop(locked_photo);
        assert!(
            matches!(&failed.identities[0], PhotoIdentity::Error { message, .. } if !message.is_empty())
        );
        assert!(matches!(
            &failed.identities[1],
            PhotoIdentity::Missing { hash: None, .. }
        ));
        index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();

        let cache = library
            .path()
            .join(".phalbummakr")
            .join("content-index.json");
        // Permit cache reads, but prevent the atomic replacement until the handle closes.
        let locked_cache = fs::OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(cache)
            .unwrap();
        std::fs::write(&photo, b"abcd").unwrap();
        let save_result = index_paths(library.path(), &paths(&["photo.jpg"]));
        drop(locked_cache);
        assert!(save_result.unwrap_err().contains("save"));
        let retried = index_paths(library.path(), &paths(&["photo.jpg"])).unwrap();
        assert_eq!(
            (
                retried.hashed_files,
                retried.hashed_bytes,
                retried.cache_hits
            ),
            (1, 4, 0)
        );
        assert_ne!(ready_hash(&retried.identities[0]), ABC_SHA256);
    }

    #[test]
    #[ignore = "Requires PHALBUMMAKR_BENCH_LIBRARY and permission to update its content-index cache"]
    fn representative_library_benchmark() {
        fn measure(root: &Path, requested: &[String], label: &str) -> ContentIndexBatch {
            let started = Instant::now();
            let mut total = ContentIndexBatch {
                identities: Vec::with_capacity(requested.len()),
                hashed_files: 0,
                hashed_bytes: 0,
                cache_hits: 0,
                elapsed_ms: 0,
            };
            for (index, chunk) in requested.chunks(8).enumerate() {
                let batch = index_paths(root, chunk)
                    .unwrap_or_else(|error| panic!("{label} batch {index} failed: {error}"));
                total.hashed_files += batch.hashed_files;
                total.hashed_bytes += batch.hashed_bytes;
                total.cache_hits += batch.cache_hits;
                total.elapsed_ms += batch.elapsed_ms;
                total.identities.extend(batch.identities);
            }
            let errors = total
                .identities
                .iter()
                .filter(|identity| matches!(identity, PhotoIdentity::Error { .. }))
                .count();
            let missing = total
                .identities
                .iter()
                .filter(|identity| matches!(identity, PhotoIdentity::Missing { .. }))
                .count();
            println!(
                "{label}: photos={} batches={} hashedFiles={} hashedBytes={} cacheHits={} errors={} missing={} backendMsSum={} wallMs={:.3}",
                requested.len(), requested.len().div_ceil(8), total.hashed_files, total.hashed_bytes,
                total.cache_hits, errors, missing, total.elapsed_ms,
                started.elapsed().as_secs_f64() * 1000.0,
            );
            for identity in &total.identities {
                if !matches!(identity, PhotoIdentity::Ready { .. }) {
                    eprintln!("{label}: {identity:?}");
                }
            }
            assert_eq!(errors, 0, "{label} had Photo indexing failures");
            assert_eq!(missing, 0, "{label} had Photos disappear since scanning");
            total
        }

        let root = PathBuf::from(
            std::env::var_os("PHALBUMMAKR_BENCH_LIBRARY")
                .expect("Set PHALBUMMAKR_BENCH_LIBRARY to an explicitly approved Library"),
        );
        let cache = root.join(".phalbummakr").join(library_data::CONTENT_INDEX);
        let cache_existed = match fs::metadata(cache) {
            Ok(_) => true,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
            Err(error) => panic!("Could not inspect existing content-index cache: {error}"),
        };
        let scan_started = Instant::now();
        let scan = photos::scan_library(&root).expect("Representative Library scan failed");
        println!(
            "scan: photos={} warnings={} wallMs={:.3} cacheExisted={} osCacheState=unknown",
            scan.photos.len(),
            scan.warnings.len(),
            scan_started.elapsed().as_secs_f64() * 1000.0,
            cache_existed
        );
        for warning in &scan.warnings {
            eprintln!("scan warning: {warning}");
        }
        let requested: Vec<String> = scan.photos.into_iter().map(|photo| photo.path).collect();
        assert!(
            !requested.is_empty(),
            "Representative Library has no scanned Photos"
        );
        measure(&root, &requested, "first");
        let cached = measure(&root, &requested, "cached");
        assert_eq!(
            cached.hashed_files, 0,
            "Unchanged cached Photos were reread"
        );
        assert_eq!(cached.hashed_bytes, 0, "Unchanged cached bytes were reread");
        assert_eq!(cached.cache_hits, requested.len() as u64);
    }
}
