# 002 – Open or create a Library

Status: done · Depends on: 001

## What

On start, the user opens a folder as a **Library**. A folder is a Library if it contains a `.phalbummakr/` folder. Opening a folder that isn't a Library yet offers to make it one. The tool reopens the last Library on the next start.

## Acceptance criteria

- [x] A folder picker opens a folder.
- [x] If `.phalbummakr/` is missing, the user is asked and the folder is created on confirmation.
- [x] The last opened Library is remembered in per-machine app data, not in the Library.
- [x] The Library root path is the only absolute path the tool keeps. Everything else is relative to it ([ADR 0001](../docs/adr/0001-album-files-on-local-disk.md)).

## Future considerations (low priority)

Found in code review. Not required for this issue; future agents may pick these up when touching related code.

- If the remembered Library has been moved or deleted, startup silently falls back to the open screen. Consider telling the user why (`restoreLastLibrary` in `src/core/library.ts`).
- The `.phalbummakr` marker name is duplicated: in the confirm prompt text (`src/ui/tauriLibraryPorts.ts`) and in `LIBRARY_MARKER` (`src-tauri/src/library.rs`). Consider a single source of truth.
- `LibraryPorts` mixes picking/confirming, disk access and settings. Consider splitting it into smaller ports if it keeps growing.
