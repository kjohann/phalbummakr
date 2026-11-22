# 044 - Folder Photo counts

Status: done · Type: feature · Depends on: 033, 042

## What

Show a Folder Photo count badge on Folder tiles in both Sort and Album mode.
The count covers the Folder and every subfolder, even though opening a Folder
shows only its directly contained Photos.

Follows [033 - Folder area](033-folder-area.md).

## Acceptance criteria

- [x] Every Folder tile shows its count in both Sort and Album mode, in regular
  and compact views. Empty Folders show `0`. Breadcrumbs do not get badges.
- [x] Counts include Photos directly in the Folder and in all descendants.
  Folder boundaries are respected: `holiday` does not include `holiday-extra`.
- [x] Each recognised Photo file counts separately, including Identical Photos.
  Counts are not Usage and do not change with unused or reviewed filters.
- [x] The badge tooltip says "Photos in this Folder and its subfolders". Its
  meaning and count are accessible without relying on visual position.
- [x] Counts use the latest scan results. In-app moves and copies update all
  affected Folder counts immediately after the scan state is updated; Rescan
  updates counts after outside changes.
- [x] Files the scanner does not recognise as Photos are not counted. Existing
  scan warnings remain visible. This feature does not add a filesystem watcher.
- [x] Badges preserve Folder opening, drop targets, menus and the Folder area's
  existing sizing and scrolling behaviour.
- [x] Focused tests cover nested counts, empty Folders, Identical Photos,
  filter independence and updates after moves, copies and Rescan. Verify both
  display sizes and both modes.

## Design notes

- Use the shared Folder browser so the two modes cannot disagree about counts.
- A Folder with 10 direct Photos and 30 in descendants shows `40`; opening it
  still shows only its 10 direct Photos.
- No new scanning or disk traversal is needed solely to render a badge.

## Implementation and verification

The shared Photo browser derives counts for each ancestor from the current scan
records, independently of Usage and Reviewed state. Each Folder button describes
its count accessibly; the badge has the requested tooltip. Moves, copies and
Rescan reuse their existing scan-state updates.

The Photo browser suite passes with tests for both modes and tile sizes, nested
and similarly named Folders, empty Folders, Identical Photos, filters, scan
warnings, moves, copies and Rescan. Typecheck and targeted lint also pass.
The existing opening, menu, drag and Folder-area sizing tests continue to pass.

## Earlier considerations and inbox

- The duplicated `parentFolder` noted in [026](026-sorting-core.md) is resolved
  in the Photo browser by using the existing core helper. The separate filename
  duplication remains deferred.
- The Compact branching in [020](020-photo-pane.md) and shared Folder/grid
  props in [033](033-folder-area.md) remain deferred: the count belongs only
  to Folder tiles, and neither warrants a broader restructuring.
- [032](032-smooth-moves-in-sort-mode.md)'s scan-warning path may remain stale
  until Rescan; this issue preserves warnings rather than changing scanning.
- Earlier native gesture checks and unrelated cache, rendering, editor,
  filesystem and persistence considerations remain deferred.
- No inbox notes were resolved.

## Future considerations (low priority)

No remaining non-blocking review points were found.

