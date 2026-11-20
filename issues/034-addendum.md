# 034 addendum – Ctrl-click in the grid selects

Status: done · Type: tweak · Addendum to [034](034-drag-selected-photos.md)

## What

Ctrl-clicking Photos in the grid only added them to the Comparison. They only
became Selected Photos once clicked in the Comparison, so dragging one of them
from the grid still moved just that Photo. Like a file manager, Ctrl-click in
the grid should select: a Photo added to the Comparison from the grid starts out
Selected. Dragging, right-click "Send to Folder ▸" and the command bar's "Send
to Folder…" all act on the Selected Photos, so they follow along.

## Acceptance criteria

- [x] A Photo added to the Comparison from the grid (Ctrl-click or "Add to
  Comparison") starts out Selected.
- [x] When a Photo shown on its own becomes a Comparison, it stays Selected,
  since a Photo shown on its own counts as Selected.
- [x] Clicking a Photo in the Comparison still unselects and selects it.
- [x] After Ctrl-clicking several Photos in the grid, dragging one of them to a
  Folder moves all of them.

## Implementation notes

- `toggleComparison` adds a Photo to the chosen ones as well as the shown
  ones. It builds on `chosenPhotos`, so a Photo shown on its own, which counts
  as chosen, stays chosen when a second Photo is added. "Add to Comparison"
  goes through the same function.
- No change was needed in `PhotoBrowser`. Drag, right-click "Send to Folder ▸"
  and the command bar's "Send to Folder…" already act on the chosen Photos, so
  Photos Ctrl-clicked in the grid now move together however they're sent.
- [GLOSSARY.md](../GLOSSARY.md): **Comparison** now says that Photos added from
  the grid start out selected.
- Tests: `comparison.test.ts` covers the new rule. The Sort mode tests in
  `PhotoBrowser.test.tsx` now unchoose Photos instead of choosing them. A drag
  test Ctrl-clicks two Photos in the grid and drags one, with no clicks in the
  Comparison.

## Earlier considerations reviewed

- The open points in [034](034-drag-selected-photos.md) and
  [028](028-sort-mode.md) don't concern which Photos start out selected; they
  stay deferred.
- Nothing in the inbox was resolved by this change.

## Future considerations (low priority)

- **Code review (Standards), judgement call left:** this changes the default
  that [028](028-sort-mode.md) set, under which compared Photos started
  unchosen. It went in an addendum to 034 because it's immediate feedback on
  034's drag, and the user chose the rule.
- [035](035-unlimited-comparison-and-zoom.md) renames "chosen" to "selected".
  The `compareKeepingChosen` test helper should be renamed then.