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