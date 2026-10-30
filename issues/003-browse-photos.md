# 003 – Browse Photos in the Library

Status: todo · Depends on: 002

## What

Scan the Library for Photos and show them in a fast grid. Every Photo is always available.

## Acceptance criteria

- [ ] Rust scans the Library recursively for JPEG and PNG files, skipping `.phalbummakr/` and `Exports/`.
- [ ] Each Photo has a capture date from EXIF, falling back to the file's modified time, plus its pixel size and EXIF orientation.
- [ ] Thumbnails are generated in Rust and cached in per-machine app data, keyed so they survive a restart and are rebuilt when the file changes.
- [ ] The grid is sorted by capture date and stays smooth with 2000+ Photos (virtualised, thumbnails loaded lazily).
- [ ] EXIF orientation is respected in thumbnails.
- [ ] A manual "rescan" picks up added and removed files.
