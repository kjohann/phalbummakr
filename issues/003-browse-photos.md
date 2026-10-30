# 003 – Browse Photos in the Library

Status: done · Depends on: 002

## What

Scan the Library for Photos and show them in a fast grid, preserving its folder
hierarchy for navigation. Every Photo is available where it lives on disk.

## Acceptance criteria

- [x] Rust scans the Library recursively for JPEG and PNG files, skipping `.phalbummakr/` and `Exports/`.
- [x] Each Photo has a capture date from EXIF, falling back to the file's modified time, plus its pixel size and EXIF orientation.
- [x] Thumbnails are generated in Rust and cached in per-machine app data, keyed so they survive a restart and are rebuilt when the file changes.
- [x] The grid is sorted by capture date and stays smooth with 2000+ Photos (virtualised, thumbnails loaded lazily).
- [x] EXIF orientation is respected in thumbnails.
- [x] A manual "rescan" picks up added and removed files.
- [x] Browsing starts at the Library root and shows only immediate folders and Photos, never a flattened list of descendants.
- [x] Folder tiles include empty folders and folders without supported Photos; excluded app folders and symbolic links stay hidden.
- [x] Breadcrumbs navigate to any ancestor or the Library root. Folders appear alphabetically before Photos, which keep their capture-date order.
- [x] The count describes Photos directly in the current folder. Opening a folder resets scrolling, cancels queued offscreen thumbnails, and keeps the grid virtualised.
- [x] Rescan preserves the selected folder; if it disappears, the browser shows the nearest surviving ancestor with a notice. A failed rescan keeps the current folder available.

## Verification

- Rust tests scan 2,500 real files and cover EXIF/modified dates, original pixel
  dimensions, all eight orientations, disk changes, persistent cache reuse,
  size/mtime invalidation, Library-specific keys, cache corruption and scan errors.
  Folder tests also cover nested/empty folders, folders containing only non-Photos,
  relative paths, app-folder exclusions at any depth, and added/removed folders.
- React tests cover a 2,500-Photo grid with fewer than 30 mounted tiles, scrolling
  to the last Photo, four-request concurrency, cancelled offscreen work, rescan,
  warnings and failures, plus nested navigation, duplicate filenames in different
  folders, empty folders, breadcrumbs, scroll reset, cancellation on leaving a
  folder, and recovery when the selected folder or its ancestors disappear.
- Browser verification with a mocked desktop bridge exercised scrolling through
  a nested folder of 2,500 Photos at 1200 x 800 with 12 mounted tiles at both ends.
  Empty-folder navigation and a long breadcrumb were also checked without
  horizontal page overflow. This checks rendering, not native IPC or real-photo
  decoding speed.
- Final review checked the implementation against the repo standards and the
  folder-navigation requirements. The issue index was synchronised to `done`;
  no blocking findings remain.

## Earlier considerations reviewed

Reviewed [002's future considerations](002-open-library.md#future-considerations-low-priority):

- The Photo adapter is separate from `LibraryPorts`, so photo browsing does not
  enlarge the existing mixed port. Splitting the original Library operations
  remains deferred until those operations grow.
- Missing remembered-Library notifications and the duplicated marker text remain
  open in 002: neither is needed for scanning or navigating an already-open
  Library. Folder navigation adds no Library port operations, so the proposed port
  split is still deferred.

## Future considerations (low priority)

- Old thumbnail revisions remain in per-machine app data after edits, removals or
  moving a Library. Consider cache size limits or pruning when cache management
  becomes relevant; deleting the cache manually is safe. Still deferred for folder
  navigation: original paths, thumbnail keys and cache lifetime are unchanged.
