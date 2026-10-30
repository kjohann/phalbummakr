# 001 – Scaffold the app

Status: todo

## What

Set up the project skeleton from [ADR 0002](../docs/adr/0002-tauri-with-ui-side-rendering.md): a Tauri 2 app with a React + Konva + TypeScript UI, and a separate pure TypeScript **domain core** with no UI or Tauri imports.

## Acceptance criteria

- [ ] The app starts on Windows in dev mode and shows an empty window with a Konva stage.
- [ ] The domain core lives in its own folder or package, and a lint or TS rule stops it importing React, Konva or `@tauri-apps/*`.
- [ ] `npm test` runs Vitest against the domain core, with one trivial passing test.
- [ ] One Rust command is called from the UI, proving the bridge works.
- [ ] A short README explains how to run, test and build.
