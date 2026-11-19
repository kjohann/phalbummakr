# 028 – Sort mode

Status: done · Type: feature · Depends on: 023, 026

## What

A mode for looking at Photos large, comparing up to four and sending the chosen ones to a Folder. The work area shows Photos instead of Spreads, and the Photo pane shows only Photos.

## Acceptance criteria

- [x] Clicking a Photo in the grid shows it large in the work area. With a single Photo shown, the left and right arrow keys step through the grid.
- [x] Ctrl-click, or "Add to Comparison" on right-click, adds a Photo to a Comparison of up to four Photos shown side by side (2×2 for four). Ctrl-click again, or "Remove from Comparison", removes it.
- [x] Clicking a Photo in the Comparison chooses or unchooses it. A single shown Photo counts as chosen.
- [x] "Send to Folder…" in the command bar moves the chosen Photos, using [026](026-sorting-core.md). It is disabled when no Photo is chosen.
- [x] Right-clicking a Photo in the grid offers Show, Add to Comparison / Remove from Comparison and Send to Folder ▸. In the Comparison, it offers Choose / Unchoose, Remove from Comparison and Send to Folder ▸.
- [x] Send to Folder ▸ is a nested submenu that mirrors the Folder hierarchy, plus "New Folder…", which creates the Folder and moves the Photos into it.
- [x] Dragging a Photo onto a folder tile or breadcrumb works in Sort mode as described in [026](026-sorting-core.md).
- [x] Moved Photos leave the Comparison. When only one Photo was shown, the next Photo in the grid appears.
- [x] The large view shows the Photo's Usage badge.

## Implementation notes

- **Core** (`src/core/comparison.ts`): a `Comparison` holds the shown Photos and
  the chosen ones. `showPhoto`, `toggleComparison` (at most four),
  `toggleChosen`, `stepPhoto` (arrow keys, no wrap), `afterMove` and
  `withoutPhotos` are pure and unit-tested. `chosenPhotos` treats a single
  shown Photo as chosen. After a move, a single shown Photo is replaced by the
  next Photo left in the grid as it was before the move, or the previous one
  at the end of the grid.
- **New Folder:** `folderNameProblem` in `src/core/sorting.ts` rejects empty,
  dot-leading or dot-trailing names, characters Windows forbids, reserved device
  names (`CON`, `COM1`, `LPT¹`…), protected names and names taken in the parent,
  ignoring case. The Rust command `create_folder` (`src-tauri/src/sorting.rs`)
  checks the same rules again and only creates inside an existing, unprotected
  Folder. Creating and then moving is two steps: if the move fails, the new,
  empty Folder stays.
- **UI:**
  - `PhotoBrowser` owns the Comparison, because it owns the scan and the grid
    order. Through `SortLink` it renders `SortView` into Sort mode's work area
    with a portal, reports how many Photos are chosen and receives the
    command bar's "Send to Folder…".
  - Grid clicks, right-click menus and arrow keys only act while Sort mode is
    the current mode. The Comparison is kept when switching modes, and the
    grid outlines shown Photos only in Sort mode.
  - Arrow keys are ignored in text fields, menus, tabs, the pane resizer and
    while a dialog is open.
  - `ContextMenu` is a reusable menu with nested submenus. Hovering or →
    opens a submenu, and clicking a Folder item sends there. Submenus are kept
    on screen. Escape, a click elsewhere, blur or resize close it.
  - In Send to Folder ▸, the first item is "Library", then the Folders under it
    and "New Folder…" at every level. Protected Folders are left out. A Folder
    already holding every Photo being sent is disabled, but its submenu can
    still be opened.
  - Right-click "Send to Folder ▸" sends the right-clicked Photo. The command
    bar's "Send to Folder…" sends the chosen Photos.
  - `SendToFolderDialog` serves both "New Folder…" (name only) and the command
    bar (Folder tree in depth-first order, plus an optional New Folder name).
  - Drag-to-Folder from 026 and the menus share one `send`, so moved Photos
    leave the Comparison however they were moved.
  - Photos that disappear from a rescan leave the Comparison too.
  - The large view uses the existing upright 1024 px editor preview.
- **Browser check:** a temporary harness, since removed, ran the real
  components in Chromium with mocked Tauri calls. It checked the large view,
  the 2×2 Comparison, choosing, nested submenus near the bottom edge of the
  window, the Send to Folder dialog and a move leaving the Comparison. It
  found and fixed these problems:
  - submenus ran off the bottom of the window;
  - the "▸" arrow was read as part of the item's accessible name;
  - landscape Photos hid the grid highlight.

## Earlier considerations reviewed

- **026, `sendPhotosToFolder`/`onSendPhotos` take a list although a drag sends
  one Photo:** resolved. Sort mode sends several chosen Photos through the same
  path.
- **026, `fileName`/`parentFolder` duplicated:** still deferred, and slightly
  worse. `SortView` and `SendToFolderDialog` also take names from paths. A
  shared path helper is unrelated cleanup.
- **026, native check in `tauri dev`:** still deferred, and Sort mode now needs
  it too (see below).
- **019/024, smoke-test context menus in WebView2:** still deferred. The new
  menus were checked in Chromium only.
- **027:** "New Folder…" from the Photo pane header and empty grid space, and
  renaming Folders, stay in 027. It can reuse `folderNameProblem`,
  `create_folder` and `SendToFolderDialog`.

## Future considerations (low priority)

- **Native check:** in `tauri dev` with a real Library, compare four Photos,
  send the chosen ones to a Folder and to a New Folder, and check the files on
  disk and the open Album's Usage.
- **Preview size:** the large view uses the 1024 px editor preview, which can
  look soft on a large monitor with a single Photo shown. A larger rendition
  would need a new cached size in `photos.rs`.
- **Grid scrolling:** stepping with the arrow keys doesn't scroll the
  virtualised grid to the shown Photo.
- **Keyboard:** grid tiles aren't focusable, so showing and comparing Photos
  needs a mouse. Only the arrow keys and the menus work from the keyboard.
- **New Folder is not atomic:** if the move into a new Folder fails, the empty
  Folder stays.
- **Code review (Standards), judgement calls left:**
  - `SendToFolderDialog`'s `onSend(folder, name | null)` uses `null` to mean
    "no new Folder". A small type would make that explicit.
  - The Photo file name is taken from its path in several places (see the
    026 note above).
- **Flaky test:** "shows a failed Layout Library save in Album mode and
  retries it" (see [011](011-undo-redo.md) and [026](026-sorting-core.md))
  failed in three of four full-suite runs during this issue. It fails fast,
  at about 520 ms against 1100 ms when it passes. It passes on its own, and
  this issue doesn't touch `AlbumWorkspace`. It now fails often enough to be
  worth fixing.