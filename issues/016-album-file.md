# 016 – Open an Album file

Status: todo · Depends on: 004

## What

An Album is a single `.phalbum` file that you open like a document, and the folder it lives in is its Library. This replaces opening a Library folder and choosing from its `Albums/` folder (002, 004). See [ADR 0001](../docs/adr/0001-album-files-on-local-disk.md).

## Acceptance criteria

### Album file

- [ ] An Album is stored as `<file name>.phalbum`, with JSON inside. Photo paths are relative to the folder holding the file.
- [ ] The Album has a free-text title stored in the file. It may contain any characters, including `:` and `/`, and is independent of the file name.
- [ ] Renaming the file in Explorer does not change the title.
- [ ] The app no longer reads `Albums/*.album.json`, no longer creates an `Albums/` folder and no longer creates or requires a `.phalbummakr/` marker.
- [ ] Photos under the Album's folder are browsable, as before. `.phalbummakr/` and `Exports/` stay hidden from the Photo browser. `Albums/` is no longer treated specially.
- [ ] `.phalbummakr/` is only looked for in the Album's own folder, never in parent folders. Nothing in this issue writes to it.

### Window and File menu

- [ ] The in-app top bar is removed. The window title shows `<Album title> — phalbummakr`.
- [ ] A native File menu has New Album…, Open Album…, Open Recent ▸, Close Album and Exit.
- [ ] **New Album…** opens a Save dialog filtered to `.phalbum`, suggesting a file name based on a default title. Then the Album Settings dialog opens for the title and Page Format.
- [ ] **Open Album…** opens a file dialog filtered to `.phalbum`.
- [ ] **Open Recent** lists recently opened Albums, newest first. Albums whose file no longer exists are removed from the list when chosen, with a message.
- [ ] **Close Album** returns to the start screen.

### Startup and per-computer settings

- [ ] On launch, the last opened Album is reopened. If there is none, or its file is gone, the start screen is shown.
- [ ] The start screen offers New Album, Open Album and the recent Albums.
- [ ] The last Album and the recent Albums list are stored in the per-computer `settings.json` in app data, replacing the remembered last Library.

## Converting existing Albums by hand

The app does not migrate old Albums. For each `Albums/X.album.json` in a Library folder:

1. Move it up to the Library folder, next to the Photos' folders.
2. Rename it to `X.phalbum`.
3. Apply any format change made in this issue, such as renaming `name` to `title` or bumping `schemaVersion`. Whoever implements this issue keeps these steps exact.

Then delete the `Albums/` folder and the empty `.phalbummakr` marker. Photo paths need no change. After [017](017-book-structure.md) the Album also needs its `startingSide` removed and an even Page count; see that issue.
