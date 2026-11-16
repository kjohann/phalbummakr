# 018 – Page strip

Status: todo · Depends on: 017

## What

Manage Pages and Spreads from the strip at the bottom of the editor, and give the editor the space the old page buttons used.

## Acceptance criteria

### Strip

- [ ] The strip shows one thumbnail per Page. Facing Pages sit close together, with a wider gap between Spreads. Inside Covers are shown as greyed-out placeholders.
- [ ] Clicking a Page thumbnail shows its Spread in the editor and selects the Page.
- [ ] The Add Spread, Duplicate Page, Delete Spread / Clear Page, Earlier and Later buttons are removed.

### Adding and deleting Spreads

- [ ] Hovering between two Spreads, or just before the last Spread, shows a "+" that inserts a new Spread of two empty Pages there. No "+" appears before the first or after the last Spread.
- [ ] Hovering a middle Spread shows a × that deletes the Spread. The first and last Spreads have no ×.
- [ ] A Spread with two empty Pages is deleted straight away. If either Page has content, the app asks "Discard Spread and its content?" with a "Never ask again" checkbox.

### Right-click menu

- [ ] Right-clicking a Page thumbnail shows Insert Spread Before, Insert Spread After, Delete Spread and Duplicate Page onto New Spread. Items that don't apply, such as Insert Spread Before on the first Spread, are disabled.
- [ ] Right-clicking an empty part of the strip shows Add Spread, which inserts before the last Spread.
- [ ] **Duplicate Page onto New Spread** inserts a new Spread right after the original's Spread, with a copy of the Page on the same side and an empty Page on the other side. For a Page in the last Spread, the new Spread goes just before it, with the copy on the left.

### Reordering

- [ ] Dragging a Page thumbnail to another position moves that single Page. Every Page between the old and new position shifts by one, so they may change side.
- [ ] A drop indicator shows where the Page will land. Pages cannot be dropped onto an Inside Cover.

### Preferences

- [ ] File → Preferences… opens a dialog with a "Confirm Spread deletion" checkbox, stored in the per-computer `settings.json`.
- [ ] Checking "Never ask again" clears that checkbox. Checking it again in Preferences brings the question back.
