# phalbummakr

## Requirements

- Node.js and npm
- Rust and Cargo
- Microsoft C++ Build Tools and the WebView2 Runtime on Windows

## Run

Install dependencies with `npm install`, then start the desktop app with `npm run tauri dev`. On start the app reopens the last Library, or asks you to open a folder as a Library. A folder is a Library if it contains a `.phalbummakr/` folder, and the app offers to create one if it is missing. The last opened Library is remembered in `settings.json` in the per-machine app data folder (`%LOCALAPPDATA%\com.phalbummakr.app` on Windows), never inside the Library. The status in the top bar comes from the Rust `greet` command and shows whether the desktop bridge answers. To run the UI in a browser instead, use `npm run dev`. Opening a Library needs the desktop app.

## Browse Photos

Opening a Library scans its folders for JPEG and PNG Photos, excluding
`.phalbummakr/`, `Exports/` and symbolic links. The photo browser sits beside the
Album workspace and starts at the Library root. Open folder tiles to browse
subfolders, including empty folders; use the breadcrumbs to return to any ancestor
or the Library root. Each view shows only its immediate folders (alphabetically
first) and Photos, with Photos sorted by capture date (oldest first, then relative
path for ties). The Photo count is for the current folder, not its descendants.
Dates come from EXIF's original/digitized date, falling back to the file's modified
time. EXIF wall-clock dates are treated as UTC so sorting and display do not change
with the machine's timezone. Pixel sizes describe the original file; thumbnails
respect all eight EXIF orientations, including mirrored ones.

The grid is virtualised and requests only nearby thumbnails, with at most four
requests running at once. Rust generates thumbnails up to 256 pixels on the longest
edge and caches them under `thumbnails/` in per-machine app data. Cache keys include
the Library root, relative Photo path, file size, modification time and thumbnail
format version. Originals stay untouched; cached thumbnails can be deleted and
rebuilt. Use **Rescan** after adding, removing or editing files. Scan warnings and
thumbnail errors are shown in the photo browser; a failed rescan keeps the previous
folder and grid available. A successful rescan keeps the current folder if it still
exists; otherwise, it returns to the nearest available ancestor and shows a notice.
Opening a folder resets the grid to the top. Folders and Photos are referenced
where they live on disk; browsing never moves or copies originals.

## Albums

Use **New Album** to choose a name, Page Format and print settings. Initially the
only Page Format is **A4 landscape (297 x 210 mm)**; width and height are not
entered manually. Defaults are 24 empty white Pages, Page 1 on the right, 3 mm
Bleed, 5 mm Safe Zone and 300 DPI. Page counts from 1 to 10,000 are supported.
Names must be valid Windows filenames (up to 100 characters).

Albums live in `Albums/<name>.album.json` under the Library, with a versioned JSON
model owned by the TypeScript domain core. Use the Album list to open an existing
Album, **Refresh Albums** to pick up disk changes, and the Page selector to browse
its Pages. Unsupported schema versions or content are rejected rather than
silently discarded. Creating an Album never overwrites an existing file.

Changing **Page 1 side** autosaves after 500 ms without another change. Album and
Library switching are blocked until saving finishes; save failures keep the
changes in memory and offer **Retry save**. Closing the desktop window is also
blocked during an Album operation or while changes remain unsaved. Each write
uses a unique temporary file in `Albums/`, flushes it, then atomically replaces
the destination. This keeps the previous file intact if replacement fails.
Pages cannot yet be rearranged or filled; those are subsequent issues.

## Test and build

- `npm test` runs Vitest for the pure TypeScript domain core and React UI (with a mocked desktop bridge).
- `npm run typecheck` checks the TypeScript project, and `npm run lint` enforces the domain core's import boundary.
- `cargo test` in `src-tauri/` runs the Rust unit tests.
- `npm run build` builds the frontend; `npm run tauri build` builds the desktop app.