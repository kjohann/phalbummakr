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
Album workspace, sorted by capture date (oldest first, then relative path for ties).
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
grid available.

## Test and build

- `npm test` runs Vitest for the pure TypeScript domain core and React UI (with a mocked desktop bridge).
- `npm run typecheck` checks the TypeScript project, and `npm run lint` enforces the domain core's import boundary.
- `cargo test` in `src-tauri/` runs the Rust unit tests.
- `npm run build` builds the frontend; `npm run tauri build` builds the desktop app.