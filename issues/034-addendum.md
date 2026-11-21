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

Status: done · Type: tweak · Depends on: [037](037-reviewed-photos.md)

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

- [x] A Photo added to the Comparison from the grid (Ctrl-click or "Add to
  Comparison") starts out unselected. Photos already selected stay selected.
- [x] A Photo shown on its own still counts as selected, but it doesn't stay
  selected once a second Photo is added.
- [x] Dragging a Photo in the Comparison from the grid to a Folder moves every
  Photo in the Comparison. Dragging any other grid Photo moves only that Photo.
- [x] Dragging a Selected Photo from the Comparison moves every Selected Photo.
  Dragging an unselected Photo from the Comparison moves only that Photo.
- [x] Right-click "Send to Folder ▸", including "New Folder…", follows the same
  rule as dragging in each pane.
- [x] Right-click "Mark as reviewed" / "Mark as unreviewed" from 037 follow the
  same rule as Send to Folder in each pane.
- [x] The grid only marks which Photos are in the Comparison, not which of them
  are selected.
- [x] The command bar no longer has "Send to Folder…" in Sort mode.
- [x] Album mode still moves only the dragged Photo.

### Implementation notes

- `toggleComparison` adds a Photo unselected. Selected Photos stay selected,
  but a Photo shown on its own only counts as selected while it is alone. It
  isn't kept selected once a second Photo is added.
- `photosActedOn(comparison, photo, pane)` in `core/comparison.ts` holds the
  rule for each pane. From the grid, a Photo in the Comparison takes the whole
  Comparison with it. From the Comparison, a Selected Photo takes every
  Selected Photo. Any other Photo goes on its own. `PhotoBrowser` uses it for
  drags (`startDrag("grid" | "comparison")`) and for the right-click "Send to
  Folder ▸" (including "New Folder…") and "Mark as reviewed/unreviewed". In
  Album mode, a drag still moves just the dragged Photo.
- The grid already marked only the Photos in the Comparison
  (`photo-tile--shown`), so it needed no change. A test checks that selected
  and unselected Photos look the same there.
- The command bar's "Send to Folder…" is gone. `SortCommandName` is only
  `"clear-comparison"`, and `onComparisonChange` only reports how many Photos
  are shown, since the selected count only served that button.
- `SendToFolderDialog` lost its Folder picker, which only that button used.
  It now only names a New Folder inside a given parent for "New Folder…", with
  `onSend(parent, name)`. The unused `.folder-choices` styles are removed.
- Tests: `comparison.test.ts` covers the new rules and `photosActedOn`.
  `PhotoBrowser.test.tsx` covers grid and Comparison drags, right-click Send to
  Folder and reviewed marking for each pane. The test for the command bar's
  dialog is removed. `App.test.tsx` checks that Sort mode's command bar has no
  "Send to Folder…".

### Earlier considerations reviewed

- **028, `SendToFolderDialog`'s `onSend(folder, name | null)` uses `null` for
  "no new Folder":** resolved. The dialog only creates a new Folder now, so
  `onSend(parent, name)` always gets a name.
- **028, native check in `tauri dev`:** still deferred. Its "send the chosen
  ones to a Folder" step now means right-click or drag, since the command bar
  button is gone.
- **026/028, `fileName`/`parentFolder` duplicated:** still deferred. The
  dialog now takes one name from a path instead of two.
- **034, native drag check in WebView2:** still deferred. It should now also
  check a grid drag of a Comparison Photo.
- The open points in [037](037-reviewed-photos.md) don't concern which Photos
  an action takes; they stay deferred.
- Nothing else in the inbox was resolved by this change. The "Dragging
  multiple photos" note had already been sorted into this section.

### Code review

- Spec: no findings.
- Standards, fixed straight away:
  - `photosToSend` became `photosActedOn`, since it also decides what "Mark
    as reviewed" marks.
  - The right-click menu's `"view"` became `"comparison"`, so the menu and
    the drag share the `PhotoPane` type.
  - The test helper `compareKeepingSelected` became `compareSelecting`, as it
    now selects the given Photos instead of keeping them selected.

### Future considerations (low priority)

- **Code review (Standards), judgement calls left:**
  - `SendToFolderDialog` is now only a "New Folder" name prompt. Its name and
    `.send-to-folder` class describe the removed Folder picker, and it largely
    repeats `FolderNameDialog`. Folding the two together would remove both
    problems.
  - The dialog inlines the "Folder name, or the Library" label that
    `folderName` in `PhotoBrowser` also builds (see the 026/028
    `fileName`/`parentFolder` point).
  - `SortCommandName` now has one member, and `onComparisonChange` reports
    `{ shown }` only. Both are kept in case more Sort commands come, but
    could be simplified.
- **Native check:** in `tauri dev` (WebView2), drag a Comparison Photo from the
  grid and a Selected Photo from the Comparison, and check what moves.
