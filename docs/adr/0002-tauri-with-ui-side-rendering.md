# Tauri 2 shell, with all Page rendering done in the UI

phalbummakr is a Tauri 2 desktop app with a React + Konva UI written in TypeScript, targeting Windows first. The Rust side is a thin service for the file system, EXIF, thumbnails, previews and JPEG encoding. **All Page rendering happens in the UI**: the same Konva renderer draws the editor and, at full resolution, the Page Export. Domain logic lives in a pure TypeScript core with no UI or Tauri dependencies.

We needed direct local file access (see ADR 0001) and fast decoding of 1000+ photos, and possibly a Microsoft Store release later. Using one renderer for both the editor and export means an exported Page can't drift from what was designed, for example through system-font text or Crop maths.

## Considered Options

- **Electron**: rejected, because of much larger installers and the need for Node-native image libraries, with no gain for this use.
- **A plain browser with the File System Access API**: rejected. It works only in Chromium, folder permission has to be granted again each session, and heavy image work would run in the page.
- **Rendering the export in Rust**: rejected, because it means a second renderer that has to stay pixel-identical to the editor.

## Consequences

- Export resolution is bounded by the webview's maximum canvas size, which is well above what print pages need.
- Full-size originals reach the UI only during export. The editor works from cached previews.
