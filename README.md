# phalbummakr

## Requirements

- Node.js and npm
- Rust and Cargo
- Microsoft C++ Build Tools and the WebView2 Runtime on Windows

## Run

Install dependencies with `npm install`, then start the desktop app with `npm run tauri dev`. The app opens an empty page on a Konva stage and calls the Rust `greet` command from the UI. To run the UI in a browser instead, use `npm run dev`.

## Test and build

- `npm test` runs the Vitest suite for the pure TypeScript domain core.
- `npm run typecheck` checks the TypeScript project, and `npm run lint` enforces the domain core's import boundary.
- `npm run build` builds the frontend; `npm run tauri build` builds the desktop app.