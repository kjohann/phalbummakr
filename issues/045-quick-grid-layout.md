# 045 - Quick grid layout tool

Status: todo · Type: feature · Depends on: 010, 011, 029

## What

Generate a Grid Layout by choosing its columns and rows. Use it directly on a
Page in Album mode or create an editable Layout in Layout mode.

Follows [010 - Layout mode](010-layouts.md) and
[029 - Applying Layouts](029-apply-layouts.md). Replaces the need for the
equal-Slot starter Layouts removed by [046](046-mosaic-starter-layouts.md).

## Acceptance criteria

- [ ] A real Page's right-click menu in Album mode offers
  "Apply grid layout...". It targets only that Page, not the Spread or an
  Inside Cover.
- [ ] The command bar in Layout mode offers "Make grid layout...". It creates
  and selects a new Layout, leaving the previously selected Layout untouched.
- [ ] Both entry points open the same dimension picker: a Word-style 6 by 6
  table with hover/click selection, numeric column and row inputs, and a live
  label such as "2 columns x 3 rows". Numeric inputs support keyboard use and
  larger grids. Choosing dimensions alone does not apply or create anything.
- [ ] An explicit Apply or Create button commits the choice. Cancelling leaves
  the Page and Layout Library unchanged.
- [ ] Each dimension accepts whole numbers from 1 to 12, including 1 by 1 and
  single rows or columns. Invalid inputs receive an explicit explanation and
  cannot be committed.
- [ ] Equal-sized, unrotated Photo Slots fill the available area on the open
  Album's Page Format. Inset is the greater of 15 mm and the Safe Zone; gaps
  are 6 mm. Columns and rows determine Slot proportions; no fixed landscape
  or portrait ratio is enforced.
- [ ] A grid that leaves no positive Slot width or height is rejected with an
  explanation, rather than silently changing its dimensions or spacing.
- [ ] The generator creates only Slot geometry: it does not choose Photos,
  pack by Photo proportions, add Text Slots or expose margin/gap controls.
- [ ] Applying a grid follows existing Apply Layout behaviour: replace Slots,
  transfer existing Placements in Slot order and refit them, report leftover
  Photos and text, and support undo/redo. Because a grid has no Text Slots,
  existing text is removed with a notice rather than retained as an overlay.
- [ ] Direct Page application does not automatically save a Layout in the
  Layout Library. The existing Save as Layout command remains available.
- [ ] A grid created in Layout mode is editable and autosaved as an ordinary
  Layout, using existing readiness, save-error and retry behaviour.
- [ ] Focused tests cover dimensions and geometry, invalid/no-area grids, both
  entry points, cancellation, new-Layout creation, content transfer notices,
  undo/redo and absence of an automatic Library addition on Page application.
- [ ] Check the picker and both entry points visually, including keyboard use
  and Spreads containing an Inside Cover.

## Design notes

- One grid generator serves both modes and follows existing Layout application
  and storage conventions.
- The visual picker is dimension selection, not automatic Photo arrangement.
- Existing grid helpers are prior art; reuse or extract their geometry where
  it fits rather than implementing two generators.

