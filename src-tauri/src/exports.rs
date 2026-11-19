use image::codecs::jpeg::{JpegEncoder, PixelDensity};
use serde::Deserialize;
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Component, Path, PathBuf};

/// The part of an upright Photo a Photo Slot shows, as fractions of the Photo.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Crop {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// What an exported Page needs from one Photo: its Crop, resampled to the Slot's pixel box,
/// or with `fit`, the whole Photo scaled to fit inside that box.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct PhotoRequest {
    pub crop: Crop,
    pub width: u32,
    pub height: u32,
    pub fit: bool,
}

const MAX_SIDE: u32 = 30_000;

/// The upright original of a Photo, cropped and resampled with Lanczos3 for an exported Page.
/// Returns the width and height as little-endian `u32`s followed by RGBA pixels.
pub fn export_photo(root: &Path, relative: &str, request: PhotoRequest) -> Result<Vec<u8>, String> {
    if request.width == 0 || request.height == 0 || request.width > MAX_SIDE || request.height > MAX_SIDE {
        return Err("Invalid export size.".into());
    }
    let upright = crate::photos::upright_original(root, relative)?;
    let (photo_width, photo_height) = (upright.width(), upright.height());
    let edge = |start: f64, size: u32| (start.clamp(0.0, 1.0) * f64::from(size)).round() as u32;
    let Crop { x, y, width, height } = request.crop;
    let left = edge(x, photo_width).min(photo_width - 1);
    let top = edge(y, photo_height).min(photo_height - 1);
    let right = edge(x + width, photo_width).max(left + 1);
    let bottom = edge(y + height, photo_height).max(top + 1);
    let cropped = upright.crop_imm(left, top, right - left, bottom - top);
    let (width, height) = if request.fit {
        let aspect = f64::from(cropped.width()) / f64::from(cropped.height());
        let box_aspect = f64::from(request.width) / f64::from(request.height);
        if aspect > box_aspect {
            (request.width, ((f64::from(request.width) / aspect).round() as u32).max(1))
        } else {
            (((f64::from(request.height) * aspect).round() as u32).max(1), request.height)
        }
    } else {
        (request.width, request.height)
    };
    let resized = cropped
        .resize_exact(width, height, image::imageops::FilterType::Lanczos3)
        .to_rgba8();
    let mut bytes = Vec::with_capacity(8 + resized.as_raw().len());
    bytes.extend_from_slice(&width.to_le_bytes());
    bytes.extend_from_slice(&height.to_le_bytes());
    bytes.extend_from_slice(resized.as_raw());
    Ok(bytes)
}

/// The Photos among `relative` paths that no longer exist in the Library.
pub fn missing_photos(root: &Path, relative: &[String]) -> Vec<String> {
    relative
        .iter()
        .filter(|path| !crate::photos::resolve_photo(root, path).is_ok_and(|(_, file)| file.is_file()))
        .cloned()
        .collect()
}

/// `Exports/<name>` under the Library root, where `name` is a single folder name.
fn export_folder(root: &Path, name: &str) -> Result<PathBuf, String> {
    let mut parts = Path::new(name).components();
    match (parts.next(), parts.next()) {
        (Some(Component::Normal(part)), None) if part == name && !name.contains(['/', '\\', ':']) => {
            Ok(root.join("Exports").join(name))
        }
        _ => Err("Invalid export folder name.".into()),
    }
}

/// `Exports/<name>` under the Library root, once an export has created it.
pub fn existing_export_folder(root: &Path, name: &str) -> Result<PathBuf, String> {
    let folder = export_folder(root, name)?;
    if !folder.is_dir() {
        return Err("The Export folder does not exist. Export the Pages again.".into());
    }
    Ok(folder)
}

/// Page files are numbered with at least three digits: `001.jpg`, `002.jpg` and so on.
fn is_page_file(name: &str) -> bool {
    name.strip_suffix(".jpg")
        .is_some_and(|number| number.len() >= 3 && number.bytes().all(|byte| byte.is_ascii_digit()))
}

/// Creates `Exports/<name>` and removes Page files from earlier exports, so fewer Pages leave no stale files.
pub fn prepare_folder(root: &Path, name: &str) -> Result<(), String> {
    let folder = export_folder(root, name)?;
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(&folder).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let is_file = entry.file_type().map_err(|error| error.to_string())?.is_file();
        if is_file && entry.file_name().to_str().is_some_and(is_page_file) {
            fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

/// Writes an exported Page as a quality 95 sRGB JPEG without chroma subsampling.
pub fn write_page(
    root: &Path,
    name: &str,
    file_name: &str,
    rgba: &[u8],
    width: u32,
    height: u32,
    dpi: u16,
) -> Result<(), String> {
    if !is_page_file(file_name) {
        return Err("Invalid Page file name.".into());
    }
    let folder = export_folder(root, name)?;
    let pixels = image::RgbaImage::from_raw(width, height, rgba.to_vec())
        .ok_or("The Page's pixels do not match its size.")?;
    let rgb = image::DynamicImage::ImageRgba8(pixels).to_rgb8();
    let mut temporary = tempfile::NamedTempFile::new_in(&folder).map_err(|error| error.to_string())?;
    {
        let mut writer = BufWriter::new(temporary.as_file_mut());
        // image's encoder samples every component 1 x 1, which is 4:4:4.
        let mut encoder = JpegEncoder::new_with_quality(&mut writer, 95);
        encoder.set_pixel_density(PixelDensity::dpi(dpi));
        encoder
            .encode(rgb.as_raw(), width, height, image::ExtendedColorType::Rgb8)
            .map_err(|error| error.to_string())?;
        writer.flush().map_err(|error| error.to_string())?;
    }
    temporary
        .persist(folder.join(file_name))
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::photos::tests::write_exif_photo;
    use std::fs;

    fn header(bytes: &[u8]) -> (u32, u32) {
        (
            u32::from_le_bytes(bytes[0..4].try_into().unwrap()),
            u32::from_le_bytes(bytes[4..8].try_into().unwrap()),
        )
    }

    fn pixel(bytes: &[u8], width: u32, x: u32, y: u32) -> [u8; 4] {
        let start = 8 + 4 * (y * width + x) as usize;
        bytes[start..start + 4].try_into().unwrap()
    }

    #[test]
    fn crops_the_upright_original_and_resamples_it_to_the_slot_box() {
        let dir = tempfile::tempdir().unwrap();
        // 40 x 20 pixels, turned upright to 20 x 40 by EXIF orientation 6: red at the top, green on the right.
        write_exif_photo(&dir.path().join("turned.jpg"), 6);
        let top_half = Crop { x: 0.0, y: 0.0, width: 1.0, height: 0.5 };
        let bytes = export_photo(
            dir.path(),
            "turned.jpg",
            PhotoRequest { crop: top_half, width: 10, height: 20, fit: false },
        )
        .unwrap();
        assert_eq!(header(&bytes), (10, 20));
        assert_eq!(bytes.len(), 8 + 10 * 20 * 4);
        for y in [1, 18] {
            let [red, green, _, alpha] = pixel(&bytes, 10, 1, y);
            assert!(red > 128 && green < 128 && alpha == 255, "row {y}: {red} {green}");
        }
    }

    #[test]
    fn scales_a_fitted_photo_to_fit_inside_the_slot_box() {
        let dir = tempfile::tempdir().unwrap();
        write_exif_photo(&dir.path().join("turned.jpg"), 6);
        let whole = Crop { x: 0.0, y: 0.0, width: 1.0, height: 1.0 };
        let bytes = export_photo(
            dir.path(),
            "turned.jpg",
            PhotoRequest { crop: whole, width: 30, height: 30, fit: true },
        )
        .unwrap();
        assert_eq!(header(&bytes), (15, 30));
    }

    #[test]
    fn writes_pages_as_quality_95_jpegs_without_chroma_subsampling() {
        let dir = tempfile::tempdir().unwrap();
        let rgba: Vec<u8> = (0..16 * 8).flat_map(|index| [index as u8, 100, 200, 255]).collect();
        prepare_folder(dir.path(), "Christmas").unwrap();
        write_page(dir.path(), "Christmas", "001.jpg", &rgba, 16, 8, 300).unwrap();

        let bytes = fs::read(dir.path().join("Exports").join("Christmas").join("001.jpg")).unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (16, 8));
        let segment = |marker: u8| {
            let at = bytes.windows(2).position(|pair| pair == [0xff, marker]).unwrap();
            &bytes[at + 4..]
        };
        // JFIF density in dots per inch.
        let jfif = segment(0xe0);
        assert_eq!((jfif[7], u16::from_be_bytes([jfif[8], jfif[9]])), (1, 300));
        // Quality 95 scales the standard luminance table's first entry, 16, to 2.
        assert_eq!(segment(0xdb)[1], 2);
        // Baseline frame with three components, each sampled 1 x 1: 4:4:4.
        let frame = segment(0xc0);
        assert_eq!(frame[5], 3);
        assert_eq!([frame[7], frame[10], frame[13]], [0x11, 0x11, 0x11]);
    }

    #[test]
    fn preparing_an_export_removes_earlier_page_files_only() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("Exports").join("Christmas");
        fs::create_dir_all(&folder).unwrap();
        for name in ["021.jpg", "1234.jpg", "notes.txt", "cover.jpg", "01.jpg"] {
            fs::write(folder.join(name), b"old").unwrap();
        }
        prepare_folder(dir.path(), "Christmas").unwrap();
        let mut left: Vec<String> = fs::read_dir(&folder)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect();
        left.sort();
        assert_eq!(left, ["01.jpg", "cover.jpg", "notes.txt"]);
    }

    #[test]
    fn only_an_existing_export_folder_of_the_album_can_be_opened() {
        let dir = tempfile::tempdir().unwrap();
        assert!(existing_export_folder(dir.path(), "Christmas").is_err());
        prepare_folder(dir.path(), "Christmas").unwrap();
        assert_eq!(
            existing_export_folder(dir.path(), "Christmas").unwrap(),
            dir.path().join("Exports").join("Christmas")
        );
        assert!(existing_export_folder(dir.path(), "..").is_err());
    }

    #[test]
    fn reports_photos_that_are_missing_from_the_library() {
        let dir = tempfile::tempdir().unwrap();
        write_exif_photo(&dir.path().join("here.jpg"), 1);
        let paths = ["here.jpg", "gone.jpg", "kids/gone.jpg"].map(String::from);
        assert_eq!(missing_photos(dir.path(), &paths), ["gone.jpg", "kids/gone.jpg"]);
    }

    #[test]
    fn rejects_folder_and_file_names_that_escape_the_export_folder() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["", "..", "a/b", "a\\b", "C:"] {
            assert!(prepare_folder(dir.path(), name).is_err(), "{name:?}");
        }
        prepare_folder(dir.path(), "Christmas").unwrap();
        let rgba = [255; 4];
        for file in ["page.jpg", "../001.jpg", "001.png"] {
            assert!(write_page(dir.path(), "Christmas", file, &rgba, 1, 1, 300).is_err(), "{file:?}");
        }
    }
}
