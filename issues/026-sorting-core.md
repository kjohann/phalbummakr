# 026 – Sorting core: send Photos to a Folder

Status: done · Type: feature · Depends on: 023

## What

Move Photo files to another Folder in the Library and keep every Album's Placements pointing at them. See [ADR 0003](../docs/adr/0003-sorting-moves-photos-on-disk.md). Photos are moved by dragging them onto Folders in the Photo grid, which replaces the Folder tree from the closed [025](025-folder-tree.md).

## Acceptance criteria

- [x] In Album mode and Sort mode, dragging a Photo from the grid onto a folder tile or a breadcrumb segment, including "Library", moves that Photo to the Folder. Only the dragged Photo moves. Dropping it on a Page still places it.
- [x] While a Photo is dragged, every valid target has a dashed outline and the target under the pointer is highlighted. The current Folder and the Photo's own Folder are not targets. Outside a drag, folder tiles and breadcrumbs look as before.
- [x] Sending Photos to a Folder moves their files on disk. Nothing is copied.
- [x] If a file with the same name already exists in the target Folder, the moved Photo gets a suffix, such as `IMG_0012 (2).jpg`, without asking.
- [x] Placements of a moved Photo are updated in every Album file directly in the Library root, including the open Album. If any Album can't be updated, the move is cancelled and the files are left where they were.
- [x] The Photo grid and Usage counts reflect the new location without reopening the Album.
- [x] Moves are not part of undo, and single moves are not confirmed.
- [x] Protected folders (`.phalbummakr`, `Exports`, dot-folders) can never be a target.
- [x] Planning the move, including name suffixes and Placement path changes, is a domain-core function with unit tests.

## Implementation notes

- **Core** (`src/core/sorting.ts`):
  - `planPhotoMove` plans the moves. It adds name suffixes, ignoring case
    because Windows does, and refuses protected or invalid targets. Photos
    already in the target stay put.
  - `relinkPlacements` points Placements at the new paths.
  - `sendPhotosToFolder` runs a move through `SortingPorts`. It reads every
    Album in the Library root and relinks it, taking the open Album from
    memory because it may have unsaved edits. An Album that can't be read
    cancels the move before any file is touched.
- **Rust** (`src-tauri/src/sorting.rs`): `move_photos` is all or nothing.
  - It checks every move first: the source is a Photo in the Library, the
    target is a real, unprotected Folder, and the target file doesn't exist.
  - It refuses an Album whose file changed since it was read.
  - It stages the Album writes, moves the files with a rename (never a copy),
    then replaces the Albums.
  - If anything fails, it moves the files back and restores the Albums.
  - The commands `folder_names` and `root_albums` feed the core.
- **UI:**
  - `PhotoBrowser` makes folder tiles and breadcrumbs drop targets, only
    while a Photo from its own grid is dragged.
  - Grid drags allow `copyMove`: copy places the Photo on a Page, move sends
    it to a Folder.
  - The drag state is cleared on drop, `dragend`, or the first mouse move
    after the drag. The last case covers a tile that unmounted mid-drag.
  - `AlbumWorkspace` exposes a `PhotoMoveRunner`. It pauses edits and
    autosave, waits for a save in flight, and then adopts the relinked Album
    as already saved. It also relinks the undo history's earlier and later
    steps, without adding a step.
  - It is registered while Sort mode hides Album mode, so moves work in both
    modes.
- **Protected folders:** the Photo scan hides only `.phalbummakr` and
  `Exports`, not every dot-folder, despite the note in
  [025](025-folder-tree.md). Dot-folders still show as tiles, but they are
  never drop targets, in both TypeScript and Rust. The scan was left unchanged.
- **Feedback:** after a move, a status line names the Folder and any new name,
  e.g. `Moved "a.jpg" to kids as "a (2).jpg".`. There is no confirmation step.
  Failures show as an alert.
- **Browser check:** a temporary harness, since removed, ran real Chromium
  mouse drags through Playwright. They covered:
  - the outlines during a drag;
  - the highlight under the pointer;
  - the current Folder not being a target;
  - a drop that moves the Photo;
  - a drop on a Page that still places it and clears the outlines.

## Earlier considerations reviewed

- **External edits** ([004](004-create-album.md), [016](016-album-file.md)):
  partly addressed for moves. `move_photos` refuses to overwrite an Album that
  changed since it was read. Autosave still doesn't detect external edits.
- **Photo path casing** ([008](008-usage.md), [008 addendum](008-addendum.md)):
  still deferred. Relinking matches Placement paths exactly, so a Placement
  whose casing differs from the file on disk is not relinked and becomes a
  Missing Photo. This belongs with the filesystem-aware Usage in the 008
  addendum.
- **Thumbnail cache pruning** ([003](003-browse-photos.md)): still deferred.
  A moved Photo gets new cache entries and leaves the old ones behind.
- **Duplicated `.phalbummakr` name** ([002](002-open-library.md)): still
  deferred. The protected-folder rule now exists in both TypeScript
  (`isProtectedFolder`) and Rust (`is_protected`/`is_hidden_folder`).
- **Native WebView2 drag checks** (005, 006, 015, 018, 029): Photo-to-Folder
  drags were checked with real Chromium mouse drags, but not in WebView2 or
  against a real Library.

## Future considerations (low priority)

- **Native check:** in `tauri dev`, drag a placed Photo to a Folder with two
  Albums in the Library root. Check the files on disk, both Albums, and the
  open Album's Usage.
- **Other Albums are rewritten through `deserializeAlbum`/`serializeAlbum`.**
  Unknown keys can't survive, because loading rejects them. Legacy defaults,
  such as a missing `fit`, are filled in, as opening the Album would do.
  Patching only the `photoPath` values would keep those files byte-for-byte.
- **No-clobber check:** `move_photos` checks that the target file doesn't
  exist right before each rename, because `fs::rename` replaces files on
  Windows. Another program could still create the file in between.
- **Code review (Standards), judgement calls left:**
  - The Album staging in `move_photos` repeats the temp-file steps of
    `albums::write_file`.
  - `fileName`/`parentFolder` exist in both `core/sorting.ts` and
    `PhotoBrowser.tsx`.
  - `{ name, json }` (Rust `RootAlbum`) has no named TypeScript type.
  - The protected-folder rules are written twice (TypeScript and Rust); the
    TypeScript one also rejects empty segments and backslashes.
  - `sendPhotosToFolder`/`onSendPhotos` take a list although a drag sends one
    Photo; [028](028-sort-mode.md) sends several.
  - `PhotoMoveLink` restates `MutableRefObject`.
- **Code review (Spec):** the success status line is not asked for. It is kept
  because it is the only sign that a Photo was renamed with a suffix.
- **Flaky test:** one of three full-suite runs failed on "shows a failed Layout
  Library save…", the flaky test recorded in [011](011-undo-redo.md). It passes
  on its own and in the other runs.
