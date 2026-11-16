# 004 addendum – Spread layout and Album settings

Status: done · Addendum to: [004 – Create and open an Album](004-create-album.md)

## Feedback after testing 004

Raised when starting issue 005 and implemented alongside it in
[005 – Spread view and page operations](005-spreads-and-pages.md).

## Additional acceptance criteria

- [x] The Spread strip is below the spread editor.
- [x] Page 1 uses the same two-facing-Page layout as other Spreads, with a
  non-editable **Inside cover** opposite it, regardless of starting side.
  Remaining Pages pair in order; an unmatched final side is marked **No Page**.
- [x] The starting side (Page 1 side) is behind an **Album settings** menu,
  alongside Bleed, Safe Zone and export resolution (DPI), instead of being edited
  inline in the workspace.

## Implementation and verification

Implemented in commit `ae120b5`. See the
[005 implementation notes](005-spreads-and-pages.md#implementation-and-verification).
Workspace tests cover the strip below the editor, the Inside cover, and Album
settings that are hidden by default, validate their input and persist after reopening.

## Section 2 – Hide the Albums folder

Status: done

Raised when starting issue 006 and implemented alongside it in
[006 – Photo Slots and placing Photos](006-photo-slots.md).

### Additional acceptance criteria

- [x] The Library-root `Albums/` folder is not visible in the Photo browser.
  Its files are not scanned as Photos, and they cannot be thumbnailed or
  previewed. Folders named `Albums` deeper in the Library stay visible.

### Implementation and verification

- `scan_folder` skips the `Albums` folder only at the Library root.
- Thumbnail and preview lookups reject paths whose first folder is `Albums`.
- Both rules share `is_hidden_folder` in `src-tauri/src/photos.rs`.
- A Rust test checks that `Albums/` and its subfolders are hidden, that they
  can't be thumbnailed or previewed, and that `holiday/Albums` still appears.

## Section 3 - Stable autosave status

Status: done

Superseded by the indicator removal in [016 addendum](016-addendum.md): the
user reported that reserving status width did not resolve the jitter.

### Additional acceptance criteria

- [x] Switching between Saved and Saving... does not change the save-status
  footprint, toolbar height or Spread editor position, including narrow windows.
- [x] The Not saved label fits the same reserved space without wrapping.
- [x] Autosave timing, accessible status announcements and save-error recovery
  remain unchanged.

### Implementation, review and verification

- The status text's intrinsic width caused the wrapping toolbar to gain a row
  during autosave. A browser check with the real AlbumWorkspace and a held write
  reproduced a 30.8 px toolbar/Spread editor jump at 13 workspace widths.
- The save status now reserves a non-shrinking, right-aligned 9ch width and
  cannot wrap. The existing status element and autosave logic are unchanged.
- Repeated the browser check across every workspace width from 250 to 1200 px.
  Saved, in-flight Saving... and Saved after completion had matching status
  dimensions, toolbar heights and Spread editor positions (0.1 px tolerance).
  A rejected save also verified that Not saved fits at all 951 widths and that
  Retry save returns to Saved.
- `npm test -- src\ui\AlbumWorkspace.test.tsx`: all 65 tests pass, including
  debounce, in-flight edits, failed saves and retry. Typecheck, lint and the
  production build pass; the existing bundle-size warning remains.
- Layout verification uses the real browser: the existing Vitest/jsdom suite
  mocks geometry and cannot catch this regression. No mock-geometry or
  CSS-constant assertion was added as a substitute for the browser check.
- Direct code review found no remaining non-blocking implementation findings.

### Earlier considerations reviewed

- No earlier open consideration requires additional changes for this fix.
  The narrow-window Page toolbar wrapping noted in 014 is a separate,
  selection-driven layout issue; redesigning it is deferred rather than
  changing editor controls as part of an autosave-status correction.
- External-edit conflict detection from 004 stays deferred: status sizing does
  not change persistence or multi-editor coordination. The obsolete Library
  concerns resolved by 016 remain resolved.
- Cache pruning/rendition transport, Slot bounds/handles/shared geometry helpers,
  dense-Page profiling, Photo identity casing, missing-font warnings, Layout
  orientation coverage, editor extraction and bundle splitting remain deferred:
  this change affects none of those behaviors or lifecycles.

### Future considerations (low priority)

- Native WebView2 smoke checks from earlier issues remain deferred. Browser
  geometry checks cover this fix, not native menus, font rendering or gestures.