# 003 – Browse Photos in the Library

Status: done · Depends on: 002

## What

Scan the Library for Photos and show them in a fast grid. Every Photo is always available.

## Acceptance criteria

- [x] Rust scans the Library recursively for JPEG and PNG files, skipping `.phalbummakr/` and `Exports/`.
- [x] Each Photo has a capture date from EXIF, falling back to the file's modified time, plus its pixel size and EXIF orientation.
- [x] Thumbnails are generated in Rust and cached in per-machine app data, keyed so they survive a restart and are rebuilt when the file changes.
- [x] The grid is sorted by capture date and stays smooth with 2000+ Photos (virtualised, thumbnails loaded lazily).
- [x] EXIF orientation is respected in thumbnails.
- [x] A manual "rescan" picks up added and removed files.

## Verification

- Rust tests scan 2,500 real files and cover EXIF/modified dates, original pixel
  dimensions, all eight orientations, disk changes, persistent cache reuse,
  size/mtime invalidation, Library-specific keys, cache corruption and scan errors.
- React tests cover a 2,500-Photo grid with fewer than 30 mounted tiles, scrolling
  to the last Photo, four-request concurrency, cancelled offscreen work, rescan,
  warnings and failures.
- Browser verification with a mocked desktop bridge exercised scrolling through
  2,500 Photos at 1200 x 800 with 14 mounted tiles. This checks rendering, not
  native IPC or real-photo decoding speed.

## Earlier considerations reviewed

Reviewed [002's future considerations](002-open-library.md#future-considerations-low-priority):

- The Photo adapter is separate from `LibraryPorts`, so photo browsing does not
  enlarge the existing mixed port. Splitting the original Library operations
  remains deferred until those operations grow.
- Missing remembered-Library notifications and the duplicated marker text remain
  open in 002: neither is needed for scanning an already-open Library.

## Future considerations (low priority)

- Old thumbnail revisions remain in per-machine app data after edits, removals or
  moving a Library. Consider cache size limits or pruning when cache management
  becomes relevant; deleting the cache manually is safe.
