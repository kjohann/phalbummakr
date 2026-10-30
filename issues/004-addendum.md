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
