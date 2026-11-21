//! Sorting: moving or copying Photo files between Folders in the Library, keeping the
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

/// Why `name` can't name a new Folder on Windows or in the Library. The UI checks the same
/// rules first with `folderNameProblem`, which gives the messages users normally see.
fn folder_name_problem(name: &str) -> Option<String> {
    let stem = name.split('.').next().unwrap_or("").to_lowercase();
    let device_number = |rest: &str| {
        let mut chars = rest.chars();
        matches!((chars.next(), chars.next()), (Some(c), None) if c.is_ascii_digit() || "¹²³".contains(c))
    };
    let reserved = matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
        || ["com", "lpt"]
            .iter()
            .any(|prefix| stem.strip_prefix(prefix).is_some_and(device_number));
    if name.is_empty() {
        Some("Enter a name for the Folder.".into())
    } else if name
        .chars()
        .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        Some(format!(
            "\"{name}\" contains characters a Folder name can't have."
        ))
    } else if name.ends_with('.') || reserved || is_protected(OsStr::new(name)) {
        Some(format!("\"{name}\" can't be used as a Folder name."))
    } else {
        None
    }
}

/// Creates the Folder `name` inside `parent` ("" is the Library root), returning its Library-relative path.
pub fn create_folder(root: &Path, parent: &str, name: &str) -> Result<String, String> {
    let name = name.trim();
    if let Some(problem) = folder_name_problem(name) {
        return Err(problem);
    }
    let root = canonical_root(root)?;
    let folder = existing_folder(&root, parent)?;
    let taken = folder_names(&root, parent)?
        .iter()
        .any(|sibling| sibling.to_lowercase() == name.to_lowercase());
    if taken {
        return Err(format!("Something named \"{name}\" is already there."));
    }
    fs::create_dir(folder.join(name)).map_err(|error| format!("{name}: {error}"))?;
    Ok(if parent.is_empty() {
        name.to_owned()
    } else {
        format!("{parent}/{name}")
    })
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

/// Checks every source/destination pair before any file is touched.
fn checked_transfers(root: &Path, moves: &[PhotoMove]) -> Result<Vec<(PathBuf, PathBuf)>, String> {
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
                "\"{from}\" is repeated or two Photos have the same destination."
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

/// Album rewrites written to temporary files next to the Albums, ready to replace them.
type StagedAlbums<'a> = Vec<(&'a AlbumRewrite, PathBuf, tempfile::NamedTempFile)>;

/// Stages Album rewrites, refusing any Album whose file changed since it was read.
fn stage_albums<'a>(
    root: &Path,
    albums: &'a [AlbumRewrite],
    action: &str,
) -> Result<StagedAlbums<'a>, String> {
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
                "The Album \"{}\" changed while {action}. Try again.",
                album.name
            ));
        }
        let stage = || -> io::Result<tempfile::NamedTempFile> {
            let mut temp = tempfile::NamedTempFile::new_in(root)?;
            temp.write_all(album.updated.as_bytes())?;
            temp.as_file().sync_all()?;
            Ok(temp)
        };
        let temp = stage()
            .map_err(|error| format!("Could not update the Album \"{}\": {error}", album.name))?;
        staged.push((album, path, temp));
    }
    Ok(staged)
}

/// Replaces the Albums with their staged rewrites. If one can't be replaced, the Albums already
/// written are restored and `undo` puts the files back; it returns what it could not undo.
fn commit_albums(
    staged: StagedAlbums,
    undo: impl FnOnce() -> String,
    nothing_changed: &str,
) -> Result<(), String> {
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
            failures.push_str(&undo());
            let outcome = if failures.is_empty() {
                format!(" {nothing_changed}")
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

/// Moves Photo files and rewrites Albums in the Library root as one step: when
/// anything fails, the files and Albums that were already changed are put back.
pub fn move_photos(
    root: &Path,
    moves: &[PhotoMove],
    albums: &[AlbumRewrite],
) -> Result<(), String> {
    let root = canonical_root(root)?;
    let moves = checked_transfers(&root, moves)?;
    let staged = stage_albums(&root, albums, "moving Photos")?;

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
    commit_albums(staged, || undo_moves(&moved), "No Photos were moved.")
}

fn undo_copies(copied: &[PathBuf]) -> String {
    let mut failures = String::new();
    for destination in copied.iter().rev() {
        if let Err(error) = fs::remove_file(destination) {
            failures.push_str(&format!(
                " Could not remove the copy \"{}\": {error}.",
                destination.display()
            ));
        }
    }
    failures
}

/// Stages complete files before publishing any copy. Publication never replaces a file.
pub fn copy_photos(root: &Path, copies: &[PhotoMove]) -> Result<(), String> {
    let root = canonical_root(root)?;
    let copies = checked_transfers(&root, copies)?;
    let mut staged = Vec::new();
    for (source, destination) in copies {
        let folder = destination.parent().ok_or("Copy has no destination Folder.")?;
        let source_folder = source.parent().ok_or("Photo has no source Folder.")?
            .canonicalize().map_err(|error| error.to_string())?;
        let target_folder = folder.canonicalize().map_err(|error| error.to_string())?;
        if source_folder == target_folder {
            return Err("Photos cannot be copied to their own Folder.".into());
        }
        let mut temp = tempfile::NamedTempFile::new_in(folder)
            .map_err(|error| format!("Could not prepare \"{}\": {error}", destination.display()))?;
        let mut original = fs::File::open(&source)
            .map_err(|error| format!("Could not read \"{}\": {error}", source.display()))?;
        io::copy(&mut original, temp.as_file_mut())
            .and_then(|_| temp.as_file().sync_all())
            .map_err(|error| format!("Could not copy \"{}\": {error}", source.display()))?;
        staged.push((destination, temp));
    }
    let mut copied = Vec::new();
    for (destination, temp) in staged {
        if let Err(error) = temp.persist_noclobber(&destination) {
            let failures = undo_copies(&copied);
            return Err(format!(
                "Could not publish the copy \"{}\": {}.{}",
                destination.display(),
                error.error,
                if failures.is_empty() { " No Photos were copied.".into() } else { failures }
            ));
        }
        copied.push(destination);
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct FolderRename {
    pub from: String,
    pub to: String,
}

fn split_folder(path: &str) -> (&str, &str) {
    path.rsplit_once('/').unwrap_or(("", path))
}

/// Renames a Folder in place, with everything under it, and rewrites Albums in the Library
/// root as one step: when an Album can't be written, the Folder gets its old name back.
pub fn rename_folder(
    root: &Path,
    rename: &FolderRename,
    albums: &[AlbumRewrite],
) -> Result<(), String> {
    let root = canonical_root(root)?;
    let FolderRename { from, to } = rename;
    let (parent, old_name) = split_folder(from);
    let (new_parent, new_name) = split_folder(to);
    if from.is_empty() {
        return Err("The Library itself can't be renamed.".into());
    }
    if new_parent != parent {
        return Err(format!("\"{to}\" is not a new name for \"{from}\"."));
    }
    if let Some(problem) = folder_name_problem(new_name) {
        return Err(problem);
    }
    let source = existing_folder(&root, from)?;
    let taken = folder_names(&root, parent)?
        .iter()
        .any(|sibling| sibling.to_lowercase() == new_name.to_lowercase() && sibling != old_name);
    if taken || new_name == old_name {
        return Err(format!("Something named \"{new_name}\" is already there."));
    }
    let destination = source.with_file_name(new_name);
    let staged = stage_albums(&root, albums, "renaming the Folder")?;
    fs::rename(&source, &destination)
        .map_err(|error| format!("Could not rename \"{from}\": {error}."))?;
    commit_albums(
        staged,
        || match fs::rename(&destination, &source) {
            Ok(()) => String::new(),
            Err(error) => format!(" Could not rename \"{to}\" back: {error}."),
        },
        "Nothing was renamed.",
    )
}

/// Whether `folder` is a real directory in the Library ("" is the root), protected or not.
pub fn folder_exists(root: &Path, folder: &str) -> bool {
    let Ok(root) = canonical_root(root) else {
        return false;
    };
    let Some(path) = join_plain(&root, folder) else {
        return false;
    };
    fs::symlink_metadata(&path).is_ok_and(|metadata| metadata.is_dir() && !metadata.is_symlink())
        && path
            .canonicalize()
            .is_ok_and(|canonical| canonical.starts_with(&root))
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
    fn copies_the_batch_without_changing_originals_or_albums() {
        let dir = library();
        fs::write(dir.path().join("b.jpg"), [0, 255, 4, 8]).unwrap();
        copy_photos(dir.path(), &[
            photo_move("a.jpg", "kids/a.jpg"), photo_move("b.jpg", "kids/b.jpg"),
        ]).unwrap();
        assert_eq!(fs::read(dir.path().join("kids/a.jpg")).unwrap(), b"photo a");
        assert_eq!(fs::read(dir.path().join("kids/b.jpg")).unwrap(), [0, 255, 4, 8]);
        assert_eq!(fs::read(dir.path().join("a.jpg")).unwrap(), b"photo a");
        assert_eq!(fs::read_to_string(dir.path().join("Christmas.phalbum")).unwrap(), "{\"photo\":\"a.jpg\"}");
        fs::write(dir.path().join("a.jpg"), "changed original").unwrap();
        assert_eq!(fs::read(dir.path().join("kids/a.jpg")).unwrap(), b"photo a");
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
    fn copy_refuses_late_collisions_protected_targets_and_own_folder() {
        let dir = library();
        fs::write(dir.path().join("b.jpg"), "photo b").unwrap();
        let planned = [photo_move("a.jpg", "kids/a.jpg"), photo_move("b.jpg", "kids/b.jpg")];
        fs::write(dir.path().join("kids/b.jpg"), "created after planning").unwrap();
        assert!(copy_photos(dir.path(), &planned).unwrap_err().contains("already exists"));
        assert!(!dir.path().join("kids/a.jpg").exists());
        assert_eq!(fs::read(dir.path().join("kids/b.jpg")).unwrap(), b"created after planning");
        for target in [".phalbummakr", "Exports", "kids/.hidden"] {
            fs::create_dir_all(dir.path().join(target)).unwrap();
            assert!(copy_photos(dir.path(), &[photo_move("a.jpg", &format!("{target}/a.jpg"))]).is_err());
        }
        assert!(copy_photos(dir.path(), &[photo_move("a.jpg", "a (2).jpg")]).is_err());
        assert_eq!(fs::read(dir.path().join("a.jpg")).unwrap(), b"photo a");
        assert_eq!(fs::read(dir.path().join("b.jpg")).unwrap(), b"photo b");
    }

    #[cfg(windows)]
    #[test]
    fn copy_read_failure_leaves_no_published_or_temporary_copies() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = library();
        fs::write(dir.path().join("b.jpg"), "photo b").unwrap();
        let _locked = fs::OpenOptions::new().read(true).share_mode(0)
            .open(dir.path().join("b.jpg")).unwrap();
        let error = copy_photos(dir.path(), &[
            photo_move("a.jpg", "kids/a.jpg"), photo_move("b.jpg", "kids/b.jpg"),
        ]).unwrap_err();
        assert!(error.contains("Could not read"), "{error}");
        assert_eq!(entries(&dir.path().join("kids")), Vec::<String>::new());
        assert_eq!(fs::read(dir.path().join("a.jpg")).unwrap(), b"photo a");
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

    #[test]
    fn creates_a_new_folder_inside_an_existing_one_and_refuses_unsafe_names() {
        let dir = library();
        assert_eq!(
            create_folder(dir.path(), "", "grandparents"),
            Ok("grandparents".into())
        );
        assert_eq!(
            create_folder(dir.path(), "kids", "  summer "),
            Ok("kids/summer".into())
        );
        assert!(dir.path().join("kids").join("summer").is_dir());
        for (parent, name) in [
            ("", "Kids"),
            ("", "a.jpg"),
            ("", ".hidden"),
            ("", "Exports"),
            ("", "a/b"),
            ("", "what?"),
            ("", "CON"),
            ("", "com¹.txt"),
            ("", "trailing."),
            ("", ""),
            ("missing", "new"),
            (".phalbummakr", "new"),
            ("..", "new"),
        ] {
            assert!(
                create_folder(dir.path(), parent, name).is_err(),
                "{parent}/{name}"
            );
        }
        assert!(!dir.path().join("missing").exists());
    }

    fn folder_rename(from: &str, to: &str) -> FolderRename {
        FolderRename {
            from: from.into(),
            to: to.into(),
        }
    }

    #[test]
    fn renames_a_folder_with_everything_in_it_and_rewrites_the_albums() {
        let dir = library();
        fs::create_dir(dir.path().join("kids/small")).unwrap();
        fs::write(dir.path().join("kids/small/b.jpg"), "photo b").unwrap();
        let albums = [rewrite(
            dir.path(),
            "Christmas.phalbum",
            "{\"photo\":\"children/small/b.jpg\"}",
        )];
        rename_folder(dir.path(), &folder_rename("kids", "children"), &albums).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("children/small/b.jpg")).unwrap(),
            "photo b"
        );
        assert!(!dir.path().join("kids").exists());
        assert_eq!(
            fs::read_to_string(dir.path().join("Christmas.phalbum")).unwrap(),
            "{\"photo\":\"children/small/b.jpg\"}"
        );
        rename_folder(
            dir.path(),
            &folder_rename("children/small", "children/Small"),
            &[],
        )
        .unwrap();
        assert_eq!(entries(&dir.path().join("children")), ["Small"]);
    }

    #[test]
    fn refuses_to_rename_the_root_protected_folders_or_onto_a_taken_name() {
        let dir = library();
        for folder in [".phalbummakr", "Exports", ".git", "kids/older"] {
            fs::create_dir_all(dir.path().join(folder)).unwrap();
        }
        for (from, to) in [
            ("", "new"),
            (".phalbummakr", "app"),
            ("Exports", "out"),
            (".git", "git"),
            ("kids", "a.jpg"),
            ("kids", "kids"),
            ("kids", "Exports"),
            ("kids", "what?"),
            ("kids", "kids/older/new"),
            ("kids", "../kids2"),
            ("kids/older", "older"),
            ("missing", "new"),
        ] {
            assert!(
                rename_folder(dir.path(), &folder_rename(from, to), &[]).is_err(),
                "{from} -> {to}"
            );
        }
        assert!(dir.path().join("kids/older").is_dir());
    }

    #[test]
    fn cancels_a_rename_when_an_album_changed_since_it_was_read() {
        let dir = library();
        let albums = [rewrite(dir.path(), "Christmas.phalbum", "updated")];
        fs::write(dir.path().join("Christmas.phalbum"), "saved meanwhile").unwrap();
        assert!(rename_folder(dir.path(), &folder_rename("kids", "children"), &albums).is_err());
        assert!(dir.path().join("kids").is_dir());
        assert!(!dir.path().join("children").exists());
    }

    #[cfg(windows)]
    #[test]
    fn renames_the_folder_back_when_an_album_cannot_be_written() {
        let dir = library();
        let albums = [rewrite(dir.path(), "Summer.phalbum", "updated")];
        let summer = dir.path().join("Summer.phalbum");
        let mut permissions = fs::metadata(&summer).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&summer, permissions.clone()).unwrap();
        let result = rename_folder(dir.path(), &folder_rename("kids", "children"), &albums);
        #[allow(clippy::permissions_set_readonly_false)]
        permissions.set_readonly(false);
        fs::set_permissions(&summer, permissions).unwrap();
        assert!(result.unwrap_err().contains("Nothing was renamed"));
        assert!(dir.path().join("kids").is_dir());
        assert!(!dir.path().join("children").exists());
    }

    #[test]
    fn tells_whether_a_folder_exists_in_the_library() {
        let dir = library();
        fs::create_dir(dir.path().join(".hidden")).unwrap();
        for (folder, exists) in [
            ("", true),
            ("kids", true),
            (".hidden", true),
            ("missing", false),
            ("a.jpg", false),
            ("..", false),
        ] {
            assert_eq!(folder_exists(dir.path(), folder), exists, "{folder}");
        }
    }
}
