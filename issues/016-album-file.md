# 016 – Open an Album file

Status: done · Depends on: 004 · Addendum: [016-addendum](016-addendum.md)

## What

An Album is a single `.phalbum` file that you open like a document, and the folder it lives in is its Library. This replaces opening a Library folder and choosing from its `Albums/` folder (002, 004). See [ADR 0001](../docs/adr/0001-album-files-on-local-disk.md).

## Acceptance criteria

### Album file

- [x] An Album is stored as `<file name>.phalbum`, with JSON inside. Photo paths are relative to the folder holding the file.
- [x] The Album has a free-text title stored in the file. It may contain any characters, including `:` and `/`, and is independent of the file name.
- [x] Renaming the file in Explorer does not change the title.
- [x] The app no longer reads `Albums/*.album.json`, no longer creates an `Albums/` folder and no longer creates or requires a `.phalbummakr/` marker.
- [x] Photos under the Album's folder are browsable, as before. `.phalbummakr/` and `Exports/` stay hidden from the Photo browser. `Albums/` is no longer treated specially.
- [x] `.phalbummakr/` is only looked for in the Album's own folder, never in parent folders. Nothing in this issue writes to it.

### Window and File menu

- [x] The in-app top bar is removed. The window title shows `<Album title> — phalbummakr`.
- [x] A native File menu has New Album…, Open Album…, Open Recent ▸, Close Album and Exit.
- [x] **New Album…** opens a Save dialog filtered to `.phalbum`, suggesting a file name based on a default title. Then the Album Settings dialog opens for the title and Page Format.
- [x] **Open Album…** opens a file dialog filtered to `.phalbum`.
- [x] **Open Recent** lists recently opened Albums, newest first. Albums whose file no longer exists are removed from the list when chosen, with a message.
- [x] **Close Album** returns to the start screen.

### Startup and per-computer settings

- [x] On launch, the last opened Album is reopened. If there is none, or its file is gone, the start screen is shown.
- [x] The start screen offers New Album, Open Album and the recent Albums.
- [x] The last Album and the recent Albums list are stored in the per-computer `settings.json` in app data, replacing the remembered last Library.

## Converting existing Albums by hand

The app does not migrate old Albums. For each `Albums/X.album.json` in a Library folder:

1. Move it up to the Library folder, next to the Photos' folders.
2. Rename it to `X.phalbum`.
3. In the JSON, rename `name` to `title` and change `schemaVersion` from `1` to `2`.

Then delete the `Albums/` folder and the empty `.phalbummakr` marker. Photo paths need no change. After [017](017-book-structure.md) the Album also needs its `startingSide` removed and an even Page count; see that issue.

## Implementation and review

- Album files use schema version 2. File writes remain atomic and creation never
  overwrites an existing file.
- Review found that cancelling creation could restore an old snapshot, switching
  during an edit could discard it, and replacing menus leaked native resources.
  The editor stays mounted during creation, is suspended during transitions, and
  replaced menu handles are released.
- The missing-remembered-Library notice from 002 is resolved for Albums: missing
  files are removed from recent settings and reported. The marker-name duplication
  and Library port concerns from 002 are obsolete because that workflow was removed.

## Future considerations (low priority)

- The old workspace list/create branch and its mock-only tests remain unreachable
  from the app; retire that test scaffolding when the editor tests are migrated
  fully to the document workflow.
- External edit conflict detection from 004 remains deferred: atomic replacement
  protects file integrity but this issue does not add multi-editor coordination.
- The cache pruning and rendition optimizations from 003/006 remain deferred;
  document opening does not change cache lifetimes or the rendition transport.
- The WebView2 gesture checks, dense-Page profiling, missing-font warnings,
  toolbar redesign, Layout orientation checks, Photo identity casing and bundle
  size notes from 005–015 remain deferred: those concern editor, rendering or
  future Layout/Export behavior rather than Album file opening.
- Native menu and file-dialog behavior should also be smoke-tested in WebView2;
  automated tests exercise the document and desktop-port boundaries.
