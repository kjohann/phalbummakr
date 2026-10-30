# 004 – Create and open an Album

Status: done · Depends on: 002

## What

Create a new Album and persist it as `Albums/<name>.album.json` in the Library. The Album saves itself automatically after every change.

## Acceptance criteria

- [x] "New Album" asks for:
  - a name
  - a Page Format selected by name: initially only A4, always landscape (297 x 210 mm); no manual width or height fields
  - Bleed in mm, Safe Zone margin in mm, and export resolution in DPI
  - the starting side (Page 1 on the right by default, or the left)
  - the page count (default 24)
- [x] The Album is created with that many empty, white Pages.
- [x] Existing Albums in `Albums/` are listed and can be opened.
- [x] The Album model and its JSON (de)serialisation live in the domain core, with a schema version field and unit tests for the round trip.
- [x] Autosave writes after every change, debounced, and never leaves a half-written file (write to a temp file, then rename).

## Implementation and verification

- A4 landscape is the sole built-in Page Format; no manual dimension inputs.
  Defaults: 3 mm Bleed, 5 mm Safe Zone, 300 DPI, 24 Pages, starting on the right.
- Domain validation rejects unsafe filenames, invalid print settings and
  unsupported JSON instead of opening partial data that could later overwrite it.
- The workspace opens and creates Albums, browses Pages and edits the starting
  side. Changes autosave after 500 ms. Pending and failed saves block navigation
  and desktop closing; failures remain visible and can be retried.
- Rust uses a unique, flushed temporary file in the same directory and atomic
  persistence, with no-clobber creation. Tests on Windows cover creation,
  replacement, duplicate names, invalid paths, sorted listing, and a real locked
  destination: the original survives and the temporary file is cleaned up.
- Domain and React tests cover defaults, custom settings, JSON round trips,
  malformed/unsupported data, creating/opening, debounce timing, recovery from
  save/list failures and keeping the previous Album after failed opening.
- Browser verification with an in-memory desktop bridge covered creating,
  autosaving, reopening and selecting Page 24. The real Konva canvas rendered a
  white landscape Page with A4 proportions; the form remained scrollable at
  900 x 600 without horizontal overflow. This does not test native IPC.
- Final validation: all 25 Vitest tests and 18 Rust tests pass; TypeScript,
  ESLint, changed-file Rust formatting checks and the frontend production build
  pass. Vite reports a non-blocking bundle-size warning. Cargo reports a
  non-blocking incremental-cache access warning; compilation and tests succeed.

## Earlier considerations reviewed

Reviewed the earlier completed issues:

- 001 has no outstanding future considerations.
- 002: Album disk operations have their own `AlbumPorts`, so `LibraryPorts` does
  not grow. Splitting the original mixed port remains deferred; missing
  remembered-Library notifications and duplicated marker prompt text are also
  unrelated to creating/opening Albums and remain open.
- 003: thumbnail pruning remains deferred. Album persistence does not change
  thumbnail cache keys, lifetime or storage.

## Review

- Standards review: no significant findings.
- Spec review: no significant findings against issue 004 and the A4 landscape
  override. Both reviews used the staged implementation against the previous HEAD.

## Future considerations (low priority)

- Detect external edits before autosave if simultaneous editing becomes a
  supported workflow. Atomic writes protect file completeness, not conflicts
  between another app/window and the current editor.
