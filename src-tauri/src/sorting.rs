//! Sorting: moving Photo files between Folders in the Library, keeping the
//! Albums in the Library root pointing at them (ADR 0003).

use crate::photos::{is_hidden_folder, is_photo};
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Deserialize)]
pub struct PhotoMove {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Deserialize)]
pub struct AlbumRewrite {
    pub name: String,
    pub original: String,
    pub updated: String,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct RootAlbum {
    pub name: String,
    pub json: String,
}

/// Folders Photos are never sent to: those the scan hides, and dot-folders.
fn is_protected(name: &OsStr) -> bool {
    is_hidden_folder(name) || name.to_string_lossy().starts_with('.')
}

fn canonical_root(root: &Path) -> Result<PathBuf, String> {
    root.canonicalize().map_err(|error| error.to_string())
}

/// Joins a Library-relative path name by name, so it also works under a verbatim (`\\?\`) root.
fn join_plain(root: &Path, relative: &str) -> Option<PathBuf> {
    let mut path = root.to_path_buf();
    for component in Path::new(relative).components() {
        match component {
            Component::Normal(name) => path.push(name),
            _ => return None,
        }
    }
    Some(path)
}

/// Resolves a Library-relative path whose folders are all plain, unprotected names.
fn library_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let protected = Path::new(relative).components().any(|part| match part {
        Component::Normal(name) => is_protected(name),
        _ => true,
    });
    join_plain(root, relative)
        .filter(|_| !protected)
        .ok_or_else(|| format!("\"{relative}\" is not a Folder Photos can be sent to."))
}

/// A real directory inside the Library, not reached through a link.
fn existing_folder(root: &Path, folder: &str) -> Result<PathBuf, String> {
    let path = library_path(root, folder)?;
    let metadata = fs::symlink_metadata(&path).map_err(|error| format!("{folder}: {error}"))?;
    let canonical = path.canonicalize().map_err(|error| error.to_string())?;
    if metadata.is_symlink() || !metadata.is_dir() || !canonical.starts_with(root) {
        return Err(format!("\"{folder}\" is not a Folder in the Library."));
    }
    Ok(path)
}

pub fn folder_names(root: &Path, folder: &str) -> Result<Vec<String>, String> {
    let root = canonical_root(root)?;
    let folder = existing_folder(&root, folder)?;
    fs::read_dir(folder)
        .and_then(|entries| {
            entries
                .map(|entry| entry.map(|entry| entry.file_name().to_string_lossy().into_owned()))
                .collect()
        })
        .map_err(|error| error.to_string())
}

fn is_album_name(name: &str) -> bool {
    let path = Path::new(name);
    matches!(
        path.components().collect::<Vec<_>>()[..],
        [Component::Normal(_)]
    ) && path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("phalbum"))
}

pub fn root_albums(root: &Path) -> Result<Vec<RootAlbum>, String> {
    let root = canonical_root(root)?;
    let mut albums = Vec::new();
    for entry in fs::read_dir(&root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if !is_album_name(&name) || !entry.file_type().is_ok_and(|kind| kind.is_file()) {
            continue;
        }
        let json = fs::read_to_string(entry.path())
            .map_err(|error| format!("Could not read the Album \"{name}\": {error}"))?;
        albums.push(RootAlbum { name, json });
    }
    albums.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(albums)
}

fn not_found(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(false),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(error.to_string()),
    }
}

/// Checks every move before any file is touched.
fn checked_moves(root: &Path, moves: &[PhotoMove]) -> Result<Vec<(PathBuf, PathBuf)>, String> {
    let mut checked: Vec<(PathBuf, PathBuf)> = Vec::new();
    for PhotoMove { from, to } in moves {
        let source =
            join_plain(root, from).ok_or_else(|| format!("\"{from}\" is not a Photo path."))?;
        let metadata = fs::symlink_metadata(&source).map_err(|error| format!("{from}: {error}"))?;
        let inside = source
            .canonicalize()
            .is_ok_and(|canonical| canonical.starts_with(root));
        let hidden = Path::new(from).components().any(|part| match part {
            Component::Normal(name) => is_hidden_folder(name),
            _ => true,
        });
        if hidden || !inside || metadata.is_symlink() || !metadata.is_file() || !is_photo(&source) {
            return Err(format!("\"{from}\" is not a Photo in the Library."));
        }
        let target = Path::new(to);
        let (Some(folder), Some(name)) = (target.parent(), target.file_name()) else {
            return Err(format!("\"{to}\" is not a Photo path."));
        };
        let folder = folder
            .to_str()
            .ok_or("Photo paths must be valid Unicode.")?;
        let destination = existing_folder(root, &folder.replace('\\', "/"))?.join(name);
        if !is_photo(&destination) {
            return Err(format!("\"{to}\" is not a Photo path."));
        }
        if !not_found(&destination)? {
            return Err(format!("\"{to}\" already exists."));
        }
        let clashes = |path: &PathBuf| {
            path.to_string_lossy()
                .eq_ignore_ascii_case(&destination.to_string_lossy())
        };
        if checked
            .iter()
            .any(|(earlier, later)| earlier == &source || clashes(later))
        {
            return Err(format!(
                "\"{from}\" is moved twice or onto another moved Photo."
            ));
        }
        checked.push((source, destination));
    }
    Ok(checked)
}

fn undo_moves(moved: &[(PathBuf, PathBuf)]) -> String {
    let mut failures = String::new();
    for (source, destination) in moved.iter().rev() {
        if let Err(error) = fs::rename(destination, source) {
            failures.push_str(&format!(
                " Could not move \"{}\" back: {error}.",
                destination.display()
            ));
        }
    }
    failures
}

/// Moves Photo files and rewrites Albums in the Library root as one step: when
/// anything fails, the files and Albums that were already changed are put back.
pub fn move_photos(
    root: &Path,
    moves: &[PhotoMove],
    albums: &[AlbumRewrite],
) -> Result<(), String> {
    let root = canonical_root(root)?;
    let moves = checked_moves(&root, moves)?;
    let mut staged = Vec::new();
    for album in albums {
        if !is_album_name(&album.name) {
            return Err(format!(
                "\"{}\" is not an Album in the Library root.",
                album.name
            ));
        }
        let path = root.join(&album.name);
        let current = fs::read_to_string(&path)
            .map_err(|error| format!("Could not read the Album \"{}\": {error}", album.name))?;
        if current != album.original {
            return Err(format!(
                "The Album \"{}\" changed while moving Photos. Try again.",
                album.name
            ));
        }
        let stage = || -> io::Result<tempfile::NamedTempFile> {
            let mut temp = tempfile::NamedTempFile::new_in(&root)?;
            temp.write_all(album.updated.as_bytes())?;
            temp.as_file().sync_all()?;
            Ok(temp)
        };
        let temp = stage()
            .map_err(|error| format!("Could not update the Album \"{}\": {error}", album.name))?;
        staged.push((album, path, temp));
    }

    let mut moved = Vec::new();
    for (source, destination) in moves {
        // Checked again right before moving, as renaming replaces an existing file on Windows.
        let result = match not_found(&destination) {
            Ok(true) => fs::rename(&source, &destination).map_err(|error| error.to_string()),
            Ok(false) => Err(format!("\"{}\" already exists", destination.display())),
            Err(error) => Err(error),
        };
        if let Err(error) = result {
            return Err(format!(
                "Could not move \"{}\": {error}.{}",
                source.display(),
                undo_moves(&moved)
            ));
        }
        moved.push((source, destination));
    }

    let mut written: Vec<(&AlbumRewrite, PathBuf)> = Vec::new();
    for (album, path, temp) in staged {
        if let Err(error) = temp.persist(&path) {
            let mut failures = String::new();
            for (album, path) in written.iter().rev() {
                if let Err(error) = crate::albums::write_file(path, &album.original, false) {
                    failures.push_str(&format!(
                        " Could not restore the Album \"{}\": {error}.",
                        album.name
                    ));
                }
            }
            failures.push_str(&undo_moves(&moved));
            let outcome = if failures.is_empty() {
                " No Photos were moved.".to_owned()
            } else {
                failures
            };
            return Err(format!(
                "Could not update the Album \"{}\": {}.{outcome}",
                album.name, error.error
            ));
        }
        written.push((album, path));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn library() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("kids")).unwrap();
        fs::write(dir.path().join("a.jpg"), "photo a").unwrap();
        fs::write(
            dir.path().join("Christmas.phalbum"),
            "{\"photo\":\"a.jpg\"}",
        )
        .unwrap();
        fs::write(
            dir.path().join("Summer.phalbum"),
            "{\"photo\":\"a.jpg\",\"summer\":1}",
        )
        .unwrap();
        dir
    }

    fn photo_move(from: &str, to: &str) -> PhotoMove {
        PhotoMove {
            from: from.into(),
            to: to.into(),
        }
    }

    fn rewrite(dir: &Path, name: &str, updated: &str) -> AlbumRewrite {
        AlbumRewrite {
            name: name.into(),
            original: fs::read_to_string(dir.join(name)).unwrap(),
            updated: updated.into(),
        }
    }

    fn entries(dir: &Path) -> Vec<String> {
        let mut names: Vec<_> = fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn lists_names_in_a_folder_and_the_albums_in_the_library_root() {
        let dir = library();
        fs::write(dir.path().join("kids/b.JPG"), "b").unwrap();
        fs::create_dir(dir.path().join("kids/older")).unwrap();
        fs::write(dir.path().join("kids/Nested.phalbum"), "{}").unwrap();
        let mut names = folder_names(dir.path(), "kids").unwrap();
        names.sort();
        assert_eq!(names, ["Nested.phalbum", "b.JPG", "older"]);
        assert_eq!(
            root_albums(dir.path())
                .unwrap()
                .iter()
                .map(|album| &album.name)
                .collect::<Vec<_>>(),
            ["Christmas.phalbum", "Summer.phalbum"]
        );
        assert!(folder_names(dir.path(), "../").is_err());
    }

    #[test]
    fn moves_the_photo_file_and_rewrites_the_albums_without_copying() {
        let dir = library();
        let albums = [rewrite(
            dir.path(),
            "Christmas.phalbum",
            "{\"photo\":\"kids/a.jpg\"}",
        )];
        move_photos(dir.path(), &[photo_move("a.jpg", "kids/a.jpg")], &albums).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("kids/a.jpg")).unwrap(),
            "photo a"
        );
        assert_eq!(
            entries(dir.path()),
            ["Christmas.phalbum", "Summer.phalbum", "kids"]
        );
        assert_eq!(
            fs::read_to_string(dir.path().join("Christmas.phalbum")).unwrap(),
            "{\"photo\":\"kids/a.jpg\"}"
        );
    }

    #[test]
    fn never_replaces_an_existing_file() {
        let dir = library();
        fs::write(dir.path().join("kids/A.jpg"), "other").unwrap();
        assert!(move_photos(dir.path(), &[photo_move("a.jpg", "kids/A.jpg")], &[]).is_err());
        assert_eq!(
            fs::read_to_string(dir.path().join("a.jpg")).unwrap(),
            "photo a"
        );
        assert_eq!(
            fs::read_to_string(dir.path().join("kids/A.jpg")).unwrap(),
            "other"
        );
    }

    #[test]
    fn cancels_when_an_album_changed_since_it_was_read() {
        let dir = library();
        let albums = [rewrite(dir.path(), "Christmas.phalbum", "updated")];
        fs::write(dir.path().join("Christmas.phalbum"), "saved meanwhile").unwrap();
        assert!(move_photos(dir.path(), &[photo_move("a.jpg", "kids/a.jpg")], &albums).is_err());
        assert!(dir.path().join("a.jpg").exists());
        assert!(!dir.path().join("kids/a.jpg").exists());
        assert_eq!(
            fs::read_to_string(dir.path().join("Christmas.phalbum")).unwrap(),
            "saved meanwhile"
        );
    }

    #[test]
    fn never_moves_photos_into_protected_folders_or_out_of_the_library() {
        let dir = library();
        for folder in [".phalbummakr", "Exports", "kids/exports", ".git"] {
            fs::create_dir_all(dir.path().join(folder)).unwrap();
            assert!(folder_names(dir.path(), folder).is_err(), "{folder}");
            let to = format!("{folder}/a.jpg");
            assert!(
                move_photos(dir.path(), &[photo_move("a.jpg", &to)], &[]).is_err(),
                "{to}"
            );
        }
        for to in ["../a.jpg", "kids/../../a.jpg", "kids/a.txt"] {
            assert!(
                move_photos(dir.path(), &[photo_move("a.jpg", to)], &[]).is_err(),
                "{to}"
            );
        }
        assert!(move_photos(
            dir.path(),
            &[photo_move("Christmas.phalbum", "kids/x.jpg")],
            &[]
        )
        .is_err());
        assert_eq!(
            fs::read_to_string(dir.path().join("a.jpg")).unwrap(),
            "photo a"
        );
    }

    #[cfg(windows)]
    #[test]
    fn puts_photos_and_albums_back_when_an_album_cannot_be_written() {
        let dir = library();
        let albums = [
            rewrite(
                dir.path(),
                "Christmas.phalbum",
                "{\"photo\":\"kids/a.jpg\"}",
            ),
            rewrite(
                dir.path(),
                "Summer.phalbum",
                "{\"photo\":\"kids/a.jpg\",\"summer\":1}",
            ),
        ];
        // Windows can read a read-only file but not replace it.
        let summer = dir.path().join("Summer.phalbum");
        let mut permissions = fs::metadata(&summer).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&summer, permissions.clone()).unwrap();
        let result = move_photos(dir.path(), &[photo_move("a.jpg", "kids/a.jpg")], &albums);
        #[allow(clippy::permissions_set_readonly_false)]
        permissions.set_readonly(false);
        fs::set_permissions(&summer, permissions).unwrap();
        assert!(result.unwrap_err().contains("No Photos were moved"));
        assert_eq!(
            fs::read_to_string(dir.path().join("a.jpg")).unwrap(),
            "photo a"
        );
        assert!(!dir.path().join("kids/a.jpg").exists());
        assert_eq!(
            fs::read_to_string(dir.path().join("Christmas.phalbum")).unwrap(),
            "{\"photo\":\"a.jpg\"}"
        );
        assert_eq!(
            entries(dir.path()),
            ["Christmas.phalbum", "Summer.phalbum", "a.jpg", "kids"]
        );
    }
}
