# 005 – Spread view and page operations

Status: done · Depends on: 004

## What

Show the Album as a strip of Spreads and let the user manage Pages. The selected Page opens in the editor canvas.

## Acceptance criteria

- [x] The Spread strip pairs Pages according to the Album's starting side, with Page 1 alone on the chosen side.
- [x] Pages can be added, deleted, duplicated and drag-reordered, and the Spreads re-pair correctly.
- [x] The editor canvas renders the selected Page at the Page Format's aspect ratio, with guides for the trim edge, the Bleed and the Safe Zone.
- [x] Page operations are domain-core functions with unit tests.

## Related addendum

Feedback on 004 was implemented alongside this issue; see
[004 addendum](004-addendum.md) for its acceptance criteria. It covers the strip
below the editor, Page 1's Spread with an Inside cover, and the Album settings menu.

## Implementation and verification

- Pure domain functions pair Spreads and add, duplicate, delete and move Pages
  immutably. Insertions get unused IDs; duplication copies content independently.
  Operations preserve the 1-10,000 Page limit and reject missing Pages or invalid
  move positions. JSON schema version 1 remains unchanged.
- Selection follows a Page's identity during reordering. Add/duplicate selects
  the inserted Page; deletion selects the next Page, or the preceding final Page.
  The strip scrolls the selection into view. Earlier/Later buttons offer a
  keyboard-accessible alternative to dragging.
- The real Konva editor draws both Pages with trim, outer Bleed and inner Safe
  Zone guides. At the minimum 720 x 480 window size the workspace scrolls rather
  than collapsing the canvas; the strip stays below the editor.
- Edits use the existing debounced autosave and visible failure/retry handling.
  Editing is disabled during writes and after save failures; selection remains
  available. Settings validate through the existing domain schema.
- Disabled Tauri native file-drop interception to allow HTML drag reordering on
  Windows; no existing Explorer-drop feature is removed.
- Test-first verification at the agreed public core and workspace/ports seams
  covers pairing, immutable operations, limits, selection, settings, reordering,
  persistence and failed-save edit locking.
- All 34 Vitest tests and 18 Rust tests pass. Typechecking, ESLint and production
  build pass. Existing non-blocking warnings remain: Vite bundle size and Cargo
  incremental-cache access.
- Browser verification with an in-memory desktop bridge covered selection,
  simulated HTML drag events, add/duplicate/delete, settings and reopening.
  Real Konva geometry was checked numerically: 297:210 trim proportions,
  3/5 mm default Bleed/Safe Zone and updated 4/7 mm settings. The strip is below
  the editor; 1200 x 800, 900 x 600 and 720 x 480 layouts have no horizontal page
  overflow. This does not verify native IPC or real mouse dragging in WebView2;
  the integrated browser's drag coordinates did not match its resized viewport.

## Earlier considerations reviewed

- 001 has no outstanding future considerations.
- 002: remembered-Library notifications, shared marker text and splitting the
  original mixed Library port remain deferred. Page editing and Album settings
  add no Library port operations and do not change Library restoration.
- 003: thumbnail pruning remains deferred; Page ordering and print guides do not
  affect thumbnail storage or cache lifetime.
- 004: detecting external edits before autosave remains deferred until concurrent
  editing is supported. These edits use the same atomic persistence boundary and
  do not introduce a second writer.

## Review

- Standards: 0 findings; no documented-standard violations or meaningful smells.
- Spec: 0 findings; no missing, incorrect or unrequested behavior identified.
- Both independent reviews used the staged changes against pre-task HEAD
  `41aaa126ce7475acb2075579f6add4d853e21a21`.

## Future considerations (low priority)

- No remaining non-blocking code-review findings. A native WebView2 mouse-drag
  smoke test is still useful; automated tests and browser DOM drag events cover
  reordering, but the integrated browser could not validate real mouse dragging.
