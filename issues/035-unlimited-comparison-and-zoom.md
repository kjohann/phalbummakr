# 035 – Unlimited Comparison, Clear Comparison and work-area zoom

Status: todo · Type: feature · Depends on: 028

## What

A Comparison is limited to four Photos. Remove the limit, add a way to clear the Comparison, and let the user zoom the work area so details stay visible with many Photos shown. "Chosen" Photos are renamed to Selected Photos (see [GLOSSARY.md](../GLOSSARY.md)).

Comes from real use (inbox, Sort mode).

## Acceptance criteria

- [ ] Any number of Photos can be added to a Comparison. The work area lays them out in a grid that fits automatically (2×2, 3×2, 3×3 and so on), and tiles shrink down to a minimum size. Past that, the work area scrolls.
- [ ] "Choose"/"Unchoose" become "Select"/"Unselect" in menus and labels, and "chosen" becomes "selected" in code and tests.
- [ ] "Clear Comparison" in the command bar empties the Comparison, along with the Selected Photos. Escape does the same when no menu or dialog is open. It's disabled when the Comparison is empty.
- [ ] In Sort mode, Ctrl+Plus, Ctrl+Minus and Ctrl+0, command bar buttons (− 100% +), and Ctrl+wheel and pinch zoom the work area only. The Photo pane and command bar keep their size. The work area scrolls to show any part of the zoomed Comparison.
- [ ] The zoom level is kept while in Sort mode. Clearing the Comparison resets it to 100%.
- [ ] Album mode and Layout mode keep using Ctrl+Plus and Ctrl+Minus for a Photo's Crop. The app itself never zooms.

## Notes

- `App.tsx` blocks page zoom keys app-wide. Sort mode has to handle them itself.
- Zoomed in, the 1024 px preview may look soft. See "Preview size" in [028](028-sort-mode.md).
