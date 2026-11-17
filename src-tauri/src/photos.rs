use chrono::{DateTime, NaiveDateTime};
use exif::{In, Tag};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File, Metadata};
use std::io::{BufReader, Cursor, Write};
use std::path::{Component, Path};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Photo {
    pub path: String,
    pub capture_date: i64,
    pub width: u32,
    pub height: u32,
    pub orientation: u32,
    pub revision: String,
}

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub photos: Vec<Photo>,
    pub folders: Vec<String>,
    pub warnings: Vec<String>,
}

pub fn scan_library(root: &Path) -> Result<ScanResult, String> {
    let root = root.canonicalize().map_err(|error| error.to_string())?;
    let mut result = ScanResult {
        photos: Vec::new(),
        folders: Vec::new(),
        warnings: Vec::new(),
    };
    scan_folder(&root, &root, &mut result)?;
    result.photos.sort_by(|a, b| {
        a.capture_date
            .cmp(&b.capture_date)
            .then(a.path.cmp(&b.path))
    });
    result.folders.sort();
    Ok(result)
}

fn scan_folder(root: &Path, folder: &Path, result: &mut ScanResult) -> Result<(), String> {
    let entries = fs::read_dir(folder).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                result.warnings.push(error.to_string());
                continue;
            }
        };
        let path = entry.path();
        let kind = match entry.file_type() {
            Ok(kind) => kind,
            Err(error) => {
                result.warnings.push(format!("{}: {error}", path.display()));
                continue;
            }
        };
        // Do not follow links: Photos must stay within the Library, without directory cycles.
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            if is_hidden_folder(&entry.file_name()) {
                continue;
            }
            match relative_path(root, &path) {
                Ok(relative) => result.folders.push(relative),
                Err(error) => {
                    result.warnings.push(format!("{}: {error}", path.display()));
                    continue;
                }
            }
            if let Err(error) = scan_folder(root, &path, result) {
                result.warnings.push(format!("{}: {error}", path.display()));
            }
        } else if kind.is_file() && is_photo(&path) {
            match read_photo(root, &path, &mut result.warnings) {
                Ok(photo) => result.photos.push(photo),
                Err(error) => result.warnings.push(format!("{}: {error}", path.display())),
            }
        }
    }
    Ok(())
}

fn is_photo(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            ["jpg", "jpeg", "png"]
                .iter()
                .any(|supported| extension.eq_ignore_ascii_case(supported))
        })
}

fn revision(root: &Path, path: &str, metadata: &Metadata) -> Result<String, String> {
    let modified = metadata.modified().map_err(|error| error.to_string())?;
    let mut hash = Sha256::new();
    // Bump the version when thumbnail size, encoding or orientation handling changes.
    hash.update(b"thumbnail-v1-256-png\0");
    hash.update(root.as_os_str().as_encoded_bytes());
    hash.update(b"\0");
    hash.update(path.as_bytes());
    hash.update(metadata.len().to_le_bytes());
    hash.update(format!("{modified:?}").as_bytes());
    Ok(format!("{:x}", hash.finalize()))
}

fn relative_path(root: &Path, path: &Path) -> Result<String, String> {
    path.strip_prefix(root)
        .map_err(|error| error.to_string())?
        .to_str()
        .map(|relative| relative.replace('\\', "/"))
        .ok_or_else(|| "Library path is not valid Unicode".into())
}

fn read_photo(root: &Path, path: &Path, warnings: &mut Vec<String>) -> Result<Photo, String> {
    let relative = relative_path(root, path)?;
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let (width, height) = image::image_dimensions(path).map_err(|error| error.to_string())?;
    let modified: DateTime<chrono::Utc> = metadata
        .modified()
        .map_err(|error| error.to_string())?
        .into();
    let mut photo = Photo {
        revision: revision(root, &relative, &metadata)?,
        path: relative,
        capture_date: modified.timestamp_millis(),
        width,
        height,
        orientation: 1,
    };
    let file = File::open(path).map_err(|error| error.to_string())?;
    match exif::Reader::new().read_from_container(&mut BufReader::new(file)) {
        Ok(exif) => {
            if let Some(orientation) = exif
                .get_field(Tag::Orientation, In::PRIMARY)
                .and_then(|field| field.value.get_uint(0))
                .filter(|value| (1..=8).contains(value))
            {
                photo.orientation = orientation;
            }
            if let Some(field) = exif
                .get_field(Tag::DateTimeOriginal, In::PRIMARY)
                .or_else(|| exif.get_field(Tag::DateTimeDigitized, In::PRIMARY))
            {
                if let exif::Value::Ascii(values) = &field.value {
                    if let Some(value) = values.first() {
                        match std::str::from_utf8(value).ok().and_then(|text| {
                            NaiveDateTime::parse_from_str(text, "%Y:%m:%d %H:%M:%S").ok()
                        }) {
                            Some(date) => photo.capture_date = date.and_utc().timestamp_millis(),
                            None => warnings.push(format!(
                                "{}: invalid EXIF capture date; using modified time",
                                photo.path
                            )),
                        }
                    }
                }
            }
        }
        Err(exif::Error::NotFound(_)) => {}
        Err(error) => warnings.push(format!(
            "{}: could not read EXIF ({error}); using available metadata",
            photo.path
        )),
    }
    Ok(photo)
}

/// Resolves a Photo path relative to the Library root, rejecting paths that
/// escape the Library or point into folders the scan hides.
fn resolve_photo(
    root: &Path,
    relative: &str,
) -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    let root = root.canonicalize().map_err(|error| error.to_string())?;
    let relative_path = Path::new(relative);
    let hidden = relative_path.components().any(|part| match part {
        Component::Normal(name) => is_hidden_folder(name),
        _ => true,
    });
    if hidden || !is_photo(relative_path) {
        return Err("Invalid Photo path.".into());
    }
    let path = root
        .join(relative_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !path.starts_with(&root) {
        return Err("The Photo is outside the Library.".into());
    }
    Ok((root, path))
}

/// Folders the scan hides: app data and Exports anywhere.
fn is_hidden_folder(name: &std::ffi::OsStr) -> bool {
    name.eq_ignore_ascii_case(".phalbummakr") || name.eq_ignore_ascii_case("Exports")
}

/// Returns a cached rendition of a Photo, generating and caching it when missing or corrupt.
/// `render` receives the decoded image and its EXIF orientation, so it can downscale
/// before orienting.
fn cached_rendition(
    root: &Path,
    path: &Path,
    relative: &str,
    cache_file: &Path,
    render: impl FnOnce(image::DynamicImage, u32) -> Result<Vec<u8>, String>,
) -> Result<Vec<u8>, String> {
    let key = revision(
        root,
        relative,
        &fs::metadata(path).map_err(|error| error.to_string())?,
    )?;
    match fs::read(cache_file) {
        Ok(bytes) => {
            if image::load_from_memory(&bytes).is_ok() {
                return Ok(bytes);
            }
            eprintln!(
                "Rebuilding invalid image cache entry: {}",
                cache_file.display()
            );
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Could not read image cache: {error}")),
    }
    let mut warnings = Vec::new();
    let photo = read_photo(root, path, &mut warnings)?;
    for warning in warnings {
        eprintln!("{warning}");
    }
    let decoded = image::ImageReader::open(path)
        .map_err(|error| error.to_string())?
        .decode()
        .map_err(|error| error.to_string())?;
    let bytes = render(decoded, photo.orientation)?;
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if revision(root, relative, &metadata)? != key {
        return Err("The Photo changed while it was being read. Rescan the Library.".into());
    }
    let cache = cache_file.parent().expect("cache file has a folder");
    fs::create_dir_all(cache).map_err(|error| error.to_string())?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(cache).map_err(|error| error.to_string())?;
    temporary
        .write_all(&bytes)
        .map_err(|error| error.to_string())?;
    temporary
        .persist(cache_file)
        .map_err(|error| error.to_string())?;
    Ok(bytes)
}

fn orient(image: image::DynamicImage, orientation: u32) -> image::DynamicImage {
    match orientation {
        2 => image.fliph(),
        3 => image.rotate180(),
        4 => image.flipv(),
        5 => image.rotate90().fliph(),
        6 => image.rotate90(),
        7 => image.rotate90().flipv(),
        8 => image.rotate270(),
        _ => image,
    }
}

pub fn thumbnail(
    root: &Path,
    cache: &Path,
    relative: &str,
    expected_revision: &str,
) -> Result<Vec<u8>, String> {
    let (root, path) = resolve_photo(root, relative)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    let key = revision(&root, relative, &metadata)?;
    if key != expected_revision {
        return Err("The Photo changed. Rescan the Library to refresh it.".into());
    }
    cached_rendition(
        &root,
        &path,
        relative,
        &cache.join(format!("{key}.png")),
        |image, orientation| {
            let small = orient(
                image.thumbnail(256.min(image.width()), 256.min(image.height())),
                orientation,
            );
            let mut bytes = Cursor::new(Vec::new());
            small
                .write_to(&mut bytes, image::ImageFormat::Png)
                .map_err(|error| error.to_string())?;
            Ok(bytes.into_inner())
        },
    )
}

pub fn page_thumbnail(root: &Path, cache: &Path, relative: &str) -> Result<Vec<u8>, String> {
    let (canonical_root, path) = resolve_photo(root, relative)?;
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let key = revision(&canonical_root, relative, &metadata)?;
    thumbnail(&canonical_root, cache, relative, &key)
}

const PREVIEW_LONG_EDGE: u32 = 1024;

/// An upright JPEG of a Photo for the editor, at most 1024 px on the long edge.
/// Keyed by the Photo's current file revision, so changed files get a new preview.
pub fn preview(root: &Path, cache: &Path, relative: &str) -> Result<Vec<u8>, String> {
    let (root, path) = resolve_photo(root, relative)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    let mut hash = Sha256::new();
    // Bump the version when preview size, encoding or orientation handling changes.
    hash.update(b"preview-v4-1024-jpeg\0");
    hash.update(revision(&root, relative, &metadata)?.as_bytes());
    let key = format!("{:x}", hash.finalize());
    cached_rendition(
        &root,
        &path,
        relative,
        &cache.join(format!("{key}.jpg")),
        |image, orientation| {
            let image = orient(
                if image.width().max(image.height()) > PREVIEW_LONG_EDGE {
                    image.resize(
                        PREVIEW_LONG_EDGE,
                        PREVIEW_LONG_EDGE,
                        image::imageops::FilterType::CatmullRom,
                    )
                } else {
                    image
                },
                orientation,
            );
            // Pages are white, so transparent pixels are shown on white.
            let rgb = if image.color().has_alpha() {
                let mut background = image::RgbaImage::from_pixel(
                    image.width(),
                    image.height(),
                    image::Rgba([255, 255, 255, 255]),
                );
                image::imageops::overlay(&mut background, &image.to_rgba8(), 0, 0);
                image::DynamicImage::ImageRgba8(background).to_rgb8()
            } else {
                image.to_rgb8()
            };
            let mut bytes = Vec::new();
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, 85)
                .encode(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|error| error.to_string())?;
            Ok(bytes)
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_photo(path: &std::path::Path) {
        image::RgbImage::new(40, 20).save(path).unwrap();
    }

    fn write_exif_photo(path: &Path, orientation: u16) {
        let pixels = image::RgbImage::from_fn(40, 20, |x, y| {
            image::Rgb([
                if x < 20 { 240 } else { 10 },
                if y < 10 { 240 } else { 10 },
                10,
            ])
        });
        pixels.save(path).unwrap();
        let mut tiff = b"II\x2a\0\x08\0\0\0".to_vec();
        tiff.extend_from_slice(&2_u16.to_le_bytes());
        tiff.extend_from_slice(&[0x12, 0x01, 3, 0, 1, 0, 0, 0]);
        tiff.extend_from_slice(&orientation.to_le_bytes());
        tiff.extend_from_slice(&[0, 0]);
        tiff.extend_from_slice(&[0x69, 0x87, 4, 0, 1, 0, 0, 0, 38, 0, 0, 0]);
        tiff.extend_from_slice(&[0, 0, 0, 0]);
        tiff.extend_from_slice(&[1, 0, 0x03, 0x90, 2, 0, 20, 0, 0, 0, 56, 0, 0, 0]);
        tiff.extend_from_slice(&[0, 0, 0, 0]);
        tiff.extend_from_slice(b"2020:01:02 03:04:05\0");
        let mut segment = vec![0xff, 0xe1];
        segment.extend_from_slice(&((tiff.len() + 8) as u16).to_be_bytes());
        segment.extend_from_slice(b"Exif\0\0");
        segment.extend(tiff);
        let mut jpeg = fs::read(path).unwrap();
        jpeg.splice(2..2, segment);
        fs::write(path, jpeg).unwrap();
    }

    #[test]
    fn reads_exif_capture_date_and_orientation_and_orders_oldest_first() {
        let dir = tempfile::tempdir().unwrap();
        write_photo(&dir.path().join("no-exif.png"));
        write_exif_photo(&dir.path().join("rotated.jpg"), 6);
        let result = scan_library(dir.path()).unwrap();
        assert!(result.warnings.is_empty(), "{:?}", result.warnings);
        assert_eq!(result.photos[0].path, "rotated.jpg");
        assert_eq!(result.photos[0].capture_date, 1_577_934_245_000);
        assert_eq!(result.photos[0].orientation, 6);
        assert_eq!((result.photos[0].width, result.photos[0].height), (40, 20));
        let modified: DateTime<chrono::Utc> = fs::metadata(dir.path().join("no-exif.png"))
            .unwrap()
            .modified()
            .unwrap()
            .into();
        assert_eq!(result.photos[1].capture_date, modified.timestamp_millis());
    }

    #[test]
    fn caches_oriented_thumbnails_across_calls_and_invalidates_changed_files() {
        let dir = tempfile::tempdir().unwrap();
        let cache = tempfile::tempdir().unwrap();
        write_exif_photo(&dir.path().join("rotated.jpg"), 6);
        let photo = scan_library(dir.path()).unwrap().photos.remove(0);
        let first = thumbnail(dir.path(), cache.path(), &photo.path, &photo.revision).unwrap();
        let decoded = image::load_from_memory(&first).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (20, 40));
        assert_eq!(
            thumbnail(dir.path(), cache.path(), &photo.path, &photo.revision).unwrap(),
            first
        );
        assert_eq!(fs::read_dir(cache.path()).unwrap().count(), 1);
        let cached = cache.path().join(format!("{}.png", photo.revision));
        let cache_modified = fs::metadata(&cached).unwrap().modified().unwrap();
        thumbnail(dir.path(), cache.path(), &photo.path, &photo.revision).unwrap();
        assert_eq!(
            fs::metadata(cached).unwrap().modified().unwrap(),
            cache_modified
        );

        image::RgbImage::new(800, 400)
            .save(dir.path().join("rotated.jpg"))
            .unwrap();
        assert!(thumbnail(dir.path(), cache.path(), &photo.path, &photo.revision).is_err());
        let updated = scan_library(dir.path()).unwrap().photos.remove(0);
        assert_ne!(photo.revision, updated.revision);
        let bytes = thumbnail(dir.path(), cache.path(), &updated.path, &updated.revision).unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (256, 128));
    }

    #[test]
    fn page_thumbnail_uses_current_photo_revision() {
        let dir = tempfile::tempdir().unwrap();
        let cache = tempfile::tempdir().unwrap();
        write_exif_photo(&dir.path().join("photo.jpg"), 6);
        let bytes = page_thumbnail(dir.path(), cache.path(), "photo.jpg").unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (20, 40));
    }

    #[test]
    fn thumbnails_apply_all_eight_exif_orientations_including_mirrors() {
        let dir = tempfile::tempdir().unwrap();
        let cache = tempfile::tempdir().unwrap();
        for orientation in 1..=8 {
            write_exif_photo(&dir.path().join(format!("{orientation}.jpg")), orientation);
        }
        let result = scan_library(dir.path()).unwrap();
        let top_left = [
            (true, true),
            (false, true),
            (false, false),
            (true, false),
            (true, true),
            (true, false),
            (false, false),
            (false, true),
        ];
        for photo in result.photos {
            let bytes = thumbnail(dir.path(), cache.path(), &photo.path, &photo.revision).unwrap();
            let decoded = image::load_from_memory(&bytes).unwrap().to_rgb8();
            let pixel = decoded.get_pixel(3, 3);
            assert_eq!(
                (pixel[0] > 128, pixel[1] > 128),
                top_left[photo.orientation as usize - 1],
                "orientation {}",
                photo.orientation
            );
            let expected_size = if photo.orientation >= 5 {
                (20, 40)
            } else {
                (40, 20)
            };
            assert_eq!(decoded.dimensions(), expected_size);
        }
    }

    #[test]
    fn reports_unreadable_photos_without_hiding_valid_photos() {
        let dir = tempfile::tempdir().unwrap();
        write_photo(&dir.path().join("valid.png"));
        fs::write(dir.path().join("broken.jpg"), "not a JPEG").unwrap();
        let result = scan_library(dir.path()).unwrap();
        assert_eq!(result.photos.len(), 1);
        assert_eq!(result.warnings.len(), 1);
        assert!(result.warnings[0].contains("broken.jpg"));
        assert!(scan_library(&dir.path().join("missing")).is_err());
    }

    #[test]
    fn cache_tracks_modification_time_and_library_identity_and_repairs_corruption() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let cache = tempfile::tempdir().unwrap();
        for dir in [&first, &second] {
            write_photo(&dir.path().join("same.png"));
        }
        let original = scan_library(first.path()).unwrap().photos.remove(0);
        let path = first.path().join("same.png");
        let file = File::options().write(true).open(&path).unwrap();
        let modified = file.metadata().unwrap().modified().unwrap();
        file.set_modified(modified + std::time::Duration::from_secs(2))
            .unwrap();
        let updated = scan_library(first.path()).unwrap().photos.remove(0);
        assert_ne!(original.revision, updated.revision);
        assert_ne!(
            updated.revision,
            scan_library(second.path()).unwrap().photos[0].revision
        );
        let bytes =
            thumbnail(first.path(), cache.path(), &updated.path, &updated.revision).unwrap();
        fs::write(
            cache.path().join(format!("{}.png", updated.revision)),
            "partial write",
        )
        .unwrap();
        assert_eq!(
            thumbnail(first.path(), cache.path(), &updated.path, &updated.revision).unwrap(),
            bytes
        );
        for invalid in [
            "../same.png",
            "Exports/hidden.png",
            ".phalbummakr/hidden.png",
        ] {
            assert!(thumbnail(first.path(), cache.path(), invalid, &updated.revision).is_err());
        }
    }

    #[test]
    fn scans_albums_folders_without_a_library_marker() {
        let dir = tempfile::tempdir().unwrap();
        let cache = tempfile::tempdir().unwrap();
        for folder in ["Albums/inside", "holiday/Albums"] {
            fs::create_dir_all(dir.path().join(folder)).unwrap();
        }
        write_photo(&dir.path().join("Albums/hidden.png"));
        write_photo(&dir.path().join("Albums/inside/hidden.png"));
        write_photo(&dir.path().join("holiday/Albums/kept.png"));

        let result = serde_json::to_value(scan_library(dir.path()).unwrap()).unwrap();
        assert_eq!(
            result["folders"],
            serde_json::json!(["Albums", "Albums/inside", "holiday", "holiday/Albums"])
        );
        assert_eq!(result["photos"].as_array().unwrap().len(), 3);
        assert!(preview(dir.path(), cache.path(), "Albums/hidden.png").is_ok());
    }

    #[test]
    fn previews_are_upright_at_most_1024_pixels_cached_and_rebuilt_when_the_photo_changes() {
        let dir = tempfile::tempdir().unwrap();
        let cache = tempfile::tempdir().unwrap();
        image::RgbImage::new(3000, 1500)
            .save(dir.path().join("wide.jpg"))
            .unwrap();
        let jpeg = fs::read(dir.path().join("wide.jpg")).unwrap();
        write_exif_photo(&dir.path().join("rotated.jpg"), 6);
        let exif_segment_end = {
            let rotated = fs::read(dir.path().join("rotated.jpg")).unwrap();
            let length = u16::from_be_bytes([rotated[4], rotated[5]]) as usize;
            rotated[..4 + length].to_vec()
        };
        let mut rotated_large = exif_segment_end;
        rotated_large.extend_from_slice(&jpeg[2..]);
        fs::write(dir.path().join("rotated-large.jpg"), rotated_large).unwrap();

        let wide = image::load_from_memory(&preview(dir.path(), cache.path(), "wide.jpg").unwrap())
            .unwrap();
        assert_eq!((wide.width(), wide.height()), (1024, 512));
        let rotated = image::load_from_memory(
            &preview(dir.path(), cache.path(), "rotated-large.jpg").unwrap(),
        )
        .unwrap();
        assert_eq!((rotated.width(), rotated.height()), (512, 1024));
        let small =
            image::load_from_memory(&preview(dir.path(), cache.path(), "rotated.jpg").unwrap())
                .unwrap();
        assert_eq!((small.width(), small.height()), (20, 40));

        let first = preview(dir.path(), cache.path(), "wide.jpg").unwrap();
        assert_eq!(fs::read_dir(cache.path()).unwrap().count(), 3);
        assert_eq!(
            preview(dir.path(), cache.path(), "wide.jpg").unwrap(),
            first
        );
        image::RgbImage::new(100, 400)
            .save(dir.path().join("wide.jpg"))
            .unwrap();
        let changed =
            image::load_from_memory(&preview(dir.path(), cache.path(), "wide.jpg").unwrap())
                .unwrap();
        assert_eq!((changed.width(), changed.height()), (100, 400));
        for invalid in [
            "../wide.jpg",
            ".phalbummakr/x.png",
            "Exports/x.png",
            "missing.jpg",
            "notes.txt",
        ] {
            assert!(
                preview(dir.path(), cache.path(), invalid).is_err(),
                "{invalid}"
            );
        }
    }

    #[test]
    fn scans_a_library_with_2500_photos() {
        let dir = tempfile::tempdir().unwrap();
        write_photo(&dir.path().join("sample.png"));
        let bytes = fs::read(dir.path().join("sample.png")).unwrap();
        fs::remove_file(dir.path().join("sample.png")).unwrap();
        for index in 0..2500 {
            fs::write(dir.path().join(format!("{index:04}.png")), &bytes).unwrap();
        }
        let result = scan_library(dir.path()).unwrap();
        assert_eq!(result.photos.len(), 2500);
        assert!(result.warnings.is_empty());
        assert!(result.photos.windows(2).all(|pair| {
            pair[0].capture_date < pair[1].capture_date
                || (pair[0].capture_date == pair[1].capture_date && pair[0].path < pair[1].path)
        }));
    }

    #[test]
    fn preserves_nested_and_empty_folders_and_rescans_folder_changes() {
        let dir = tempfile::tempdir().unwrap();
        for folder in [
            "holiday/beach",
            "empty",
            "notes",
            "Exports/hidden",
            "holiday/exports/hidden",
            ".phalbummakr/hidden",
            "holiday/.PHALBUMMAKR/hidden",
        ] {
            fs::create_dir_all(dir.path().join(folder)).unwrap();
        }
        write_photo(&dir.path().join("holiday/beach/same.png"));
        write_photo(&dir.path().join("same.png"));
        fs::write(dir.path().join("notes/readme.txt"), "not a Photo").unwrap();

        let result = serde_json::to_value(scan_library(dir.path()).unwrap()).unwrap();
        assert_eq!(
            result["folders"],
            serde_json::json!(["empty", "holiday", "holiday/beach", "notes"])
        );
        assert_eq!(result["photos"].as_array().unwrap().len(), 2);

        fs::remove_dir(dir.path().join("empty")).unwrap();
        fs::create_dir(dir.path().join("new")).unwrap();
        let rescanned = serde_json::to_value(scan_library(dir.path()).unwrap()).unwrap();
        assert_eq!(
            rescanned["folders"],
            serde_json::json!(["holiday", "holiday/beach", "new", "notes"])
        );
    }

    #[test]
    fn scans_nested_photos_skips_app_folders_and_rescans_disk() {
        let dir = tempfile::tempdir().unwrap();
        for folder in ["holiday", "Exports", ".phalbummakr", "holiday/Exports"] {
            std::fs::create_dir_all(dir.path().join(folder)).unwrap();
        }
        write_photo(&dir.path().join("first.JPG"));
        write_photo(&dir.path().join("holiday/second.png"));
        write_photo(&dir.path().join("Exports/hidden.jpg"));
        write_photo(&dir.path().join(".phalbummakr/hidden.png"));
        write_photo(&dir.path().join("holiday/Exports/hidden.jpg"));
        std::fs::write(dir.path().join("notes.txt"), "not a Photo").unwrap();

        let result = scan_library(dir.path()).unwrap();
        assert!(result.warnings.is_empty(), "{:?}", result.warnings);
        assert_eq!(result.photos.len(), 2);
        assert!(result.photos.iter().all(|photo| photo.width == 40
            && photo.height == 20
            && photo.orientation == 1
            && photo.capture_date > 0));
        assert!(result
            .photos
            .iter()
            .any(|photo| photo.path == "holiday/second.png"));
        assert!(result.photos.iter().any(|photo| photo.path == "first.JPG"));

        std::fs::remove_file(dir.path().join("first.JPG")).unwrap();
        write_photo(&dir.path().join("new.jpeg"));
        let rescanned = scan_library(dir.path()).unwrap();
        assert_eq!(rescanned.photos.len(), 2);
        assert!(rescanned
            .photos
            .iter()
            .any(|photo| photo.path == "new.jpeg"));
        assert!(!rescanned
            .photos
            .iter()
            .any(|photo| photo.path == "first.JPG"));
    }

    #[test]
    fn previews_composite_transparent_pixels_onto_white() {
        let dir = tempfile::tempdir().unwrap();
        let cache = tempfile::tempdir().unwrap();
        let image = image::RgbaImage::from_fn(40, 20, |x, _| {
            if x < 20 {
                image::Rgba([0, 0, 0, 0])
            } else {
                image::Rgba([255, 0, 0, 128])
            }
        });
        image.save(dir.path().join("transparent.png")).unwrap();

        let preview =
            image::load_from_memory(&preview(dir.path(), cache.path(), "transparent.png").unwrap())
                .unwrap()
                .to_rgb8();
        let transparent = preview.get_pixel(5, 5);
        let translucent = preview.get_pixel(30, 5);
        assert!(transparent.0.into_iter().all(|channel| channel > 245));
        assert!(translucent[0] > 245);
        assert!((110..=145).contains(&translucent[1]));
        assert!((110..=145).contains(&translucent[2]));
    }
}
