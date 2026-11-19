# 027 – Folder interactions

Status: done · Type: feature · Depends on: 026

## What

Let the user create and rename Folders under the Library root from the Photo grid, and go back and forward through the Folders they have visited. Album mode and Sort mode each keep their own place and history, so going back in one mode never takes you to somewhere you were in the other.

## Acceptance criteria

- [x] "New Folder…" in the Photo pane header, and on right-click of empty grid space, creates a subfolder of the current Folder, or of the root.
- [x] "Rename…" on right-click of a folder tile renames that Folder, including everything under it. It asks for confirmation, then updates Placements in every Album directly in the Library root, as in [026](026-sorting-core.md).
- [x] The root and protected folders (`.phalbummakr`, `Exports`, dot-folders) cannot be renamed.
- [x] Folder names that are invalid on Windows, or that already exist in the same parent, are rejected with a clear message.
- [x] Folders cannot be deleted from the app.
- [x] Album mode and Sort mode each keep their own current Folder and their own back/forward history. Both start at the Library root, and switching modes returns to where you were in that mode.
- [x] Back and Forward work with the mouse back/forward buttons anywhere in the window while the Photo pane is visible, with Alt+← / Alt+→, and with ← / → buttons next to the breadcrumbs that are disabled when there is nowhere to go. The mouse buttons never trigger the webview's own back navigation.
- [x] History works like a web browser: opening a folder tile or a breadcrumb adds a step, opening the current Folder does not, going somewhere new after going back drops the forward steps, and the rescan fallback to a parent Folder replaces the current step.
- [x] History holds Folders only, not shown Photos or the Comparison.
- [x] History is kept in memory, survives mode switches and is cleared when the Library changes.
- [x] Renaming a Folder clears the history of each mode whose history includes that Folder or anything under it. Every mode's current Folder follows the rename.
- [x] When a rescan finds that a Folder in a mode's history no longer exists, that mode's history is cleared and its current Folder falls back to the nearest existing parent, with the existing notice. If Back or Forward reaches a missing Folder, the app rescans and falls back the same way, without an error dialog.

## Implementation notes

- **Core:**
  - `src/core/folderHistory.ts` holds a mode's place as browser-like steps.
    `visitFolder`, `stepFolder` and `canStepFolder` cover opening and going
    back and forward. `historyAfterRescan` and `historyAfterRename` fit the
    history to a rescan or a rename. All are pure and unit-tested.
  - **Rescan rule, as agreed with the user:** "history" in the last criterion
    means the back and forward steps. If only the current Folder is missing, it
    is replaced in place by its nearest existing parent, and the other steps
    stay. If a back or forward step is missing, only the current Folder is
    kept, after its own fallback. Either way the existing notice is shown.
  - `src/core/sorting.ts`:
    - `FolderRename` and `renamedPath` describe a rename.
    - `relinkPlacements` takes either Photo moves or a `FolderRename`
      (`PlacementRelink`).
    - `folderRenameProblem` refuses the root, protected Folders, an unchanged
      name and taken names. A change in case only is allowed.
    - `renameFolder` reads and relinks the root Albums like
      `sendPhotosToFolder`. The two share `albumRewrites`.
- **Rust** (`src-tauri/src/sorting.rs`):
  - `rename_folder` renames in place only, within the same parent. It checks
    the name with the same rules as `create_folder`.
  - It stages the Album rewrites, renames the directory, then replaces the
    Albums. If an Album can't be replaced, it restores the Albums already
    written and renames the Folder back. This staging and commit is shared
    with `move_photos` (`stage_albums`/`commit_albums`).
  - `folder_exists` lets Back/Forward detect a Folder deleted outside the app.
    It also answers for protected Folders, which can still be browsed.
- **UI:**
  - `PhotoBrowser` keeps one history and notice per mode (`mode` prop:
    `album`/`sort`) in memory. They are reset when `root` changes, and the
    document remount already clears them when a new Album opens.
  - ← / → buttons sit left of the breadcrumbs. Alt+←/→ and mouse buttons 3/4
    (on `mouseup`) act while `visible`, unless a dialog is open.
  - `App` blocks the default action of mouse buttons 3/4 on `mousedown`,
    `mouseup` and `auxclick` everywhere, so the webview never navigates.
  - Back/Forward to a Folder that isn't in the last scan, or that
    `folder_exists` reports gone, starts a rescan. The rescan then falls back
    without an error dialog.
  - "New Folder…" sits in the pane header and in the right-click menu of
    empty grid space. "Rename…" is on a folder tile's right-click menu,
    disabled for protected Folders. Both use the new `FolderNameDialog`, which
    for Rename asks for confirmation in a second step.
  - A rename runs through the open Album's move runner. The runner is now
    generic over `PlacementRelink`, so the open Album and its undo steps follow
    the rename, outside undo. `App` shares `withOpenAlbum` between sending and
    renaming.
  - Shown and chosen Photos in the Comparison follow a rename. A status line
    confirms it, e.g. `Renamed "kids" to "children".`.
  - There is no delete action anywhere.
- **Browser check:** a temporary harness, since removed, ran the real
  `PhotoBrowser` in Chromium with a mocked `invoke`. It checked:
  - the button layout next to the breadcrumbs;
  - Back/Forward;
  - Rename's confirmation step.

  The embedded browser swallowed real Alt+arrow key presses before the page.
  Synthetic events showed the handlers act and prevent the default action. The
  WebView2 behaviour still needs a native check (see below).

## Earlier considerations reviewed

- **028, "027 can reuse `folderNameProblem`, `create_folder` and
  `SendToFolderDialog`":**
  - `folderNameProblem` and `create_folder` are reused.
  - `SendToFolderDialog` is not. Its texts and buttons are about moving
    Photos, so the new, smaller `FolderNameDialog` serves New Folder and
    Rename.
- **026, `fileName`/`parentFolder` duplicated:** partly addressed.
  `parentFolder` is now exported from `core/sorting.ts` and used by the new
  core module. The UI copies stay, as before.
- **026, Album staging repeats `albums::write_file`:** still deferred. The
  staging is now at least shared by moves and renames instead of being copied
  a third time.
- **026, other Albums are rewritten through `deserializeAlbum`/`serializeAlbum`:**
  still deferred. Renames rewrite them the same way.
- **026, protected-folder rules written twice:** still deferred. Rename
  depends on both copies too.
- **003, thumbnail cache pruning:** still deferred. A renamed Folder's Photos
  get new cache entries and leave the old ones behind.
- **008 addendum, Photo path casing:** still deferred. A case-only Folder
  rename relinks Placements whose paths match exactly. Placements whose casing
  already differed from the disk stay as they were.
- **020, a collapsed pane stays mounted:** still true. The history survives
  collapsing, and Back/Forward shortcuts are off while the pane is collapsed.
- **Native WebView2 checks** (005, 006, 015, 018, 026, 028, 029): still
  deferred. The mouse buttons and Alt+arrows join the list.

## Future considerations (low priority)

- **Native check:** in `tauri dev` with a real Library:
  - Use the mouse back/forward buttons and Alt+←/→. Check that the webview
    never navigates; WebView2 treats Alt+←/→ as browser accelerator keys.
  - Rename a Folder holding placed Photos, with two Albums in the Library root,
    and check the files on disk and both Albums.
- **Repeated step after a fallback:** if a missing current Folder falls back
  to the Folder of the step before it, the history holds the same Folder twice
  in a row. The first Back then seems to do nothing. This follows "replaces
  the current step" literally. Merging the two steps would feel more like a
  browser.
- **Code review (Standards), judgement calls left:**
  - `PhotoMoveRunner`, `runPhotoMove` and `photoMoves` now also run Folder
    renames. A name like `PlacementRelinkRunner` would fit better.
  - `PlacementRelink` is told apart with `"from" in relink`. A tagged union
    would be more explicit.
  - The mouse button 3/4 check is in both `App` (block only) and
    `PhotoBrowser` (navigate and block), so `PhotoBrowser` also behaves
    correctly on its own.
  - `rename_folder` repeats the rules of `folderRenameProblem` in Rust, like
    `create_folder` does for `folderNameProblem`.
- **Flaky test:** "shows a failed Layout Library save in Album mode and
  retries it" failed in one full-suite run again. It passes on its own, with
  and without this change (see [011](011-undo-redo.md), [026](026-sorting-core.md)
  and [028](028-sort-mode.md)).