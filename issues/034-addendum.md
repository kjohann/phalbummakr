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
  The `compareKeepingChosen` test helper should be renamed then. *Resolved
  when 035 was merged:* it is now `compareKeepingSelected`, and the
  Comparison keeps this rule with no limit on how many Photos it shows.
## Section 2 - Separate the Comparison from the Selected Photos

Status: todo · Type: tweak · Depends on: [037](037-reviewed-photos.md)

### What

Comes from real use (inbox, "Dragging multiple photos"). Since the first
section, Photos Ctrl-clicked in the grid also become Selected Photos, so a drag
from either pane moves all of them. The grid and the Comparison should act on
different sets:

- In the grid, a Photo in the Comparison takes the whole Comparison with it.
- In the Comparison, the Selected Photos are a subset picked there, and only
  they go together.

Photos start out unselected in the Comparison, which reverses the first
section's rule. The command bar's "Send to Folder…" button is dropped, since
dragging and right-click are the main interactions. See **Comparison** and
**Selected Photos** in [GLOSSARY.md](../GLOSSARY.md).

Done after [037](037-reviewed-photos.md), which is being implemented in
parallel and also changes `PhotoBrowser`. 037 itself is left unchanged.

### Additional acceptance criteria

- [ ] A Photo added to the Comparison from the grid (Ctrl-click or "Add to
  Comparison") starts out unselected. Photos already selected stay selected.
- [ ] A Photo shown on its own still counts as selected, but it doesn't stay
  selected once a second Photo is added.
- [ ] Dragging a Photo in the Comparison from the grid to a Folder moves every
  Photo in the Comparison. Dragging any other grid Photo moves only that Photo.
- [ ] Dragging a Selected Photo from the Comparison moves every Selected Photo.
  Dragging an unselected Photo from the Comparison moves only that Photo.
- [ ] Right-click "Send to Folder ▸", including "New Folder…", follows the same
  rule as dragging in each pane.
- [ ] Right-click "Mark as reviewed" / "Mark as unreviewed" from 037 follow the
  same rule as Send to Folder in each pane.
- [ ] The grid only marks which Photos are in the Comparison, not which of them
  are selected.
- [ ] The command bar no longer has "Send to Folder…" in Sort mode.
- [ ] Album mode still moves only the dragged Photo.
