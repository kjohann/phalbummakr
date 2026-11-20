# 032 – Smooth moves in Sort mode

Status: done · Type: bug · Depends on: 028

## What

After a move, the app reads the whole Library from disk again. Nothing happens for a moment, then the moved Photo disappears, and the Photo pane jumps back to the top. With one Photo shown, the next Photo appears in the work area before the moved one leaves the grid, so the highlight jumps around. Rescan also resets the scroll position.

Moves should give feedback straight away, keep the grid where it is and only finish once the grid has caught up.

Comes from real use (inbox, Sort mode and Rescan).

## Acceptance criteria

- [x] After a move, the grid updates in place. The Library isn't rebuilt from a full rescan, and the grid isn't recreated.
- [x] Sending to a Folder, by any route, keeps the Photo pane's scroll position (best effort).
- [x] Rescan keeps the Photo pane's scroll position (best effort).
- [x] Moved Photos leave the work area straight away with a short fade.
- [x] Tiles of moved Photos dim and show that they're busy until the move finishes, then disappear.
- [x] With one Photo shown, the next Photo appears only once the grid has settled, so the highlight doesn't jump.
- [x] A failed move puts the tiles back to normal and shows the error.

## Notes

- Today every move calls `setScan`, which runs a full rescan. `PhotoGrid`'s `key` includes the scan's `generation`, so the grid is mounted again and its scroll resets ([PhotoBrowser.tsx](../src/ui/PhotoBrowser.tsx)).
- Check whether the delay also shows up in a release build, or only in dev.

## Implementation notes

- **Why moved Photos are read again:** a Photo's `revision` hashes its
  Library-relative path (`photos.rs`), and `photo_thumbnail` refuses a stale
  revision. So the grid can't just rename moved Photos; it needs their new
  records. The Rust command `read_photos` reads only the given files, as a scan
  would, and is tested to give the same records as a full scan.
- **Core** (`src/core/sorting.ts`): `scanAfterMove` swaps moved Photos for
  their new records and keeps the scan's order: capture date, then path in
  code-point order, which is the byte order the Rust scan uses. Unmoved
  Photos keep their identity, so their tiles and previews aren't reloaded.
- **UI** (`PhotoBrowser`, `SortView`):
  - `send` marks the Photos as moving. Their grid tiles get
    `photo-tile--busy` (dimmed, spinner, `aria-busy`, no click, menu or drag).
    In the work area they get `sort-photo--leaving`, a 150 ms fade to
    opacity 0 (none with reduced motion), but keep their place until the move
    is done.
  - When the move finishes, the patched scan, the status line and the
    Comparison (`afterMove`) are set together, so the next Photo appears in
    the same render as the grid settles.
  - If `read_photos` fails, the moved Photos are dropped from the scan and a
    full rescan picks them up.
  - If a scan was running when the move finished, it may have read the
    Library before the move, so it is replaced by a new scan. Both reviewers
    found this race.
  - New Folders, from the header, empty grid space or "New Folder…" when
    sending, are added to the scan in place instead of rescanning.
  - `PhotoGrid`'s key no longer includes the scan's `generation`, so moves
    and Rescan keep the grid and its scroll position. Opening a Folder still
    resets the scroll position ([003](003-browse-photos.md)). A rescan
    retries only failed thumbnails; loaded ones stay as they are, since
    `generation` reaches `PhotoThumbnail` only for that.
  - The last status line stays until the next move's result replaces it.
    Clearing it when a drag or move started made the grid below it jump, and
    moved the drop targets under the pointer mid-drag.
- **Browser check:** a temporary harness, since removed, ran `PhotoBrowser`
  and `SortView` in Chromium with mocked Tauri calls and a 1.5 s move. It
  showed:
  - the dimmed tile with its spinner;
  - the shown Photo faded out during the move;
  - the next Photo and the settled grid appearing together;
  - the scroll position kept across moves and Rescan.
- **Release build:** not checked here, since there is no native run in this
  environment. A move no longer includes a full rescan, so what remains is
  the move itself and reading the moved files.

## Earlier considerations reviewed

- **028, grid scrolling with the arrow keys:** still deferred. Unrelated to
  moves.
- **026, thumbnail cache pruning:** still deferred. Reading moved Photos again
  gives them new revisions, so their old cache entries are left behind, as
  before.
- **026/028, native checks in `tauri dev`:** still deferred, and now include
  this issue (see below).
- **027:** nothing related.

## Future considerations (low priority)

- **Native check:** in `tauri dev` (and once in a release build) with a real
  Library, send Photos from a scrolled grid by drag, menu and the command bar,
  and press Rescan. Check that the scroll position is kept and that the moved
  Photos' thumbnails load in their new Folder.
- **Scan warnings after a move:** `scanAfterMove` keeps the scan's warnings,
  so a warning about a moved file still names its old path until the next
  Rescan. `read_photos` drops EXIF warnings for the files it reads.
- **Code review (Standards), judgement calls left:**
  - The class-name builder `[..., cond && "x"].filter(Boolean).join(" ")` is
    in both `PhotoThumbnail` and `SortView`.
  - The "right-click, Send to Folder, pick a Folder" steps are repeated in the
    new tests; `sendVia` exists, but only inside one test.
  - `generation` is passed down to `PhotoThumbnail` only to retry failed
    thumbnails on Rescan.
- **Code review (Spec):** keeping the last status line through the next move
  (see above) wasn't asked for. It is kept because it stops the grid jumping.
