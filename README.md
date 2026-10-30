# phalbummakr

## Requirements

- Node.js and npm
- Rust and Cargo
- Microsoft C++ Build Tools and the WebView2 Runtime on Windows

## Run

Install dependencies with `npm install`, then start the desktop app with `npm run tauri dev`. On start the app reopens the last Library, or asks you to open a folder as a Library. A folder is a Library if it contains a `.phalbummakr/` folder, and the app offers to create one if it is missing. The last opened Library is remembered in `settings.json` in the per-machine app data folder (`%LOCALAPPDATA%\com.phalbummakr.app` on Windows), never inside the Library. The status in the top bar comes from the Rust `greet` command and shows whether the desktop bridge answers. To run the UI in a browser instead, use `npm run dev`. Opening a Library needs the desktop app.

## Test and build

- `npm test` runs the Vitest suite for the pure TypeScript domain core.
- `npm run typecheck` checks the TypeScript project, and `npm run lint` enforces the domain core's import boundary.
- `cargo test` in `src-tauri/` runs the Rust unit tests.
- `npm run build` builds the frontend; `npm run tauri build` builds the desktop app.