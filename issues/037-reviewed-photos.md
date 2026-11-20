# 037 – Reviewed Photos and remembered position

Status: done · Type: feature · Depends on: 028

## What

Sorting a large Folder can take several evenings, and Photos you've looked at but not sent anywhere stay where they are. The next evening, you need to know where you stopped. Mark Reviewed Photos (see [GLOSSARY.md](../GLOSSARY.md)), and remember where you were in each Folder.

Example: 1000 Photos at the Library root. After one evening, 200 have been looked at, 80 sent to a Folder, and 120 left at the root on purpose.

Comes from real use (inbox, Sort mode, the "checkpoint" idea).

## Acceptance criteria

- [x] A Photo shown in the work area, alone or in a Comparison, becomes a Reviewed Photo.
- [x] Right-clicking a Photo offers "Mark as reviewed" or "Mark as unreviewed". It acts on the Selected Photos when the right-clicked Photo is one of them, and on that Photo alone otherwise.
- [x] Right-clicking a grid tile offers "Mark all up to here as reviewed", which marks it and every Photo before it in the grid.
- [x] In Sort mode, Reviewed Photos have a subtle mark on their grid tile. Other modes don't show it.
- [x] Reviewed marks are stored per Library in `.phalbummakr/` and survive restarts.
- [x] Moving a Photo in the app, or renaming its Folder, keeps its mark. Changes made outside the app may lose it.
- [x] Opening a Folder again, including after a restart, restores its last scroll position and last shown Photo (best effort).
- [x] There's no filter for Reviewed Photos.

## Decisions

Agreed with the user during implementation:

- Opening a Folder in Sort mode brings back its last shown Photo when the work
  area is empty or shows one Photo. A Comparison of two or more Photos is kept,
  so Comparisons can still be built across Folders.
- Folder positions (scroll and last shown Photo) are remembered in Sort mode
  only. Album mode's Photo pane doesn't save anything.
- After a restart, Sort mode still starts at the Library root, whose position
  is restored. It doesn't reopen the last Folder.

## Implementation notes

- **Core** (`src/core/sortProgress.ts`): `SortProgress` holds the Reviewed
  Photos (Library-relative paths) and a `FolderPosition` (scroll offset and
  last shown Photo) per Folder. These functions are pure and unit-tested:
  - `setReviewed`;
  - `photosUpTo`, for "Mark all up to here";
  - `showInProgress`, which marks shown Photos and remembers them per Folder;
  - `rememberScroll`;
  - `progressAfterMove`, `progressAfterRename` and `progressAfterRescan`;
  - `readSortProgress` and `serializeSortProgress`.

  Unreadable or malformed entries are skipped rather than refused, because the
  progress is a convenience.
- **Storage:** the progress is saved in `.phalbummakr/sorting.json`.
  `src-tauri/src/layouts.rs` became `library_data.rs`, which reads and
  atomically replaces any named file in `.phalbummakr/`. Both the Layout
  Library and the new `read_sort_progress`/`write_sort_progress` commands use
  it. As with layouts, `.phalbummakr/` is only created once something changes.
- **Loading and saving** (`src/ui/useSortProgress.ts`):
  - The file is read when Sort mode is first opened, or when a move or rename
    must be recorded (for example a drag in Album mode). Changes made before
    the file has loaded are queued and replayed once it has.
  - Saves are debounced by 300 ms and run one after another. Pending changes
    are written when the Library changes or the pane unmounts.
  - Progress that couldn't be read is never overwritten.
- **UI** (`PhotoBrowser`):
  - Every Photo shown in the work area is marked reviewed.
  - The right-click menus have "Mark as reviewed"/"Mark as unreviewed" for the
    chosen Photos or the right-clicked one, and the grid adds "Mark all up to
    here as reviewed".
  - In Sort mode, a reviewed tile shows a small tick in its top-left corner.
  - The grid reports its scroll offset 250 ms after scrolling stops, and when
    it unmounts on opening another Folder. A newly opened Folder scrolls to its
    saved offset once.
- **Following the Library:**
  - Moves and renames in the app update the marks and positions.
  - Only a whole scan forgets marks on Photos that are gone. A grid patched
    after a move doesn't, so a move whose new records can't be read doesn't
    lose its marks.
  - Switching Library clears the previous scan, so the new Library's position
    is restored against its own Photos.

## Verification

- `sortProgress.test.ts` covers the core rules.
- `library_data.rs` tests cover reading and writing both files.
- `PhotoBrowser.test.tsx` ("Reviewed Photos and remembered position") covers:
  - marking on show, alone and in a Comparison;
  - the Sort-only tick;
  - menu marking and unmarking for chosen and unchosen Photos;
  - "Mark all up to here";
  - marks following a move in Sort mode, and a drag before Sort mode was
    opened;
  - restoring scroll and the shown Photo while keeping a Comparison;
  - restoring after switching Library;
  - no pruning when moved records can't be read.
- Full suites: Vitest (all files), `cargo test`, `tsc` and ESLint pass.
- Not checked in a browser or `tauri dev`: the dev server is shared with other
  worktrees. See below.

## Code review

Two-axis review (Standards and Spec) of the working tree against `733e57d`.
Fixed:

- **Both axes:** a move or rename before Sort mode was first opened, or while
  the file was loading, was dropped, so marks and positions pointed at old
  paths. Changes are now queued and loading is started.
- **Spec:** switching Library could check the restored Photo against the old
  Library's scan, and then never restore it. The scan is now cleared on a
  Library switch.
- **Standards:**
  - the progress ports moved to their own `tauriSortProgressPorts.ts`, like the
    Layout ports;
  - two comments that only restated the code were removed.

## Earlier considerations reviewed

- **032, "Opening a Folder still resets the scroll position":** resolved for
  Sort mode, which now restores each Folder's last position. Album mode still
  starts a Folder at the top, as decided above.
- **028/033, grid scrolling with the arrow keys:** still deferred. Restoring a
  Folder scrolls to where the user was, not to the restored Photo. The two
  usually match, but stepping with the arrow keys still doesn't scroll the grid.
- **026, duplicated `.phalbummakr` name:** still deferred. The Rust file
  helpers now share one `FOLDER` constant in `library_data.rs`. The
  protected-folder rule is still duplicated between TypeScript and Rust.
- **026/028/034, `fileName`/`parentFolder` duplicated:** still deferred. The
  new core module uses the exported `parentFolder`, and no copies were added.
- **026/028/034, native checks in `tauri dev`:** still deferred, and now
  include this issue (see below).
- Nothing in the inbox was resolved by this change.

## Future considerations (low priority)

- **Native check:** in `tauri dev` with a real Library:
  - review Photos and restart, checking the ticks, the root's scroll position
    and the shown Photo;
  - move and rename with marked Photos, then check `.phalbummakr/sorting.json`;
  - check that the tick is subtle enough in regular and Compact tiles.
- **Saving on quit:** a change made in the last 300 ms before the window
  closes may not be saved (best effort).
- **Restored scroll versus a different grid:** offsets are saved per Folder
  only, so toggling "Unused" or resizing the pane restores the same pixel
  offset in a different grid.
- **Code review (Standards), judgement calls left:**
  - `const follow = (path) => renamedPath(path, rename) ?? path` now appears in
    both `progressAfterRename` and `PhotoBrowser.renameFolder`.
  - `PhotoGrid`'s `initialScrollTop` and `onScrollChange` are looked up
    separately for the same Folder. Passing one `FolderPosition` would keep
    them together.
