# 011 – Undo and redo

Status: todo · Depends on: 006, 018, 019, 023

## What

Undo and redo every Album and Layout change during the current session.

## Acceptance criteria

- [ ] Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) undo and redo Slot, Placement, Crop, text and page operations.
- [ ] A drag or pan counts as one undo step, not one per mouse move.
- [ ] Undo history is kept only for the session. Autosave still writes the current state.
- [ ] Adding, deleting and duplicating Spreads, Duplicate Page onto New Spread and dragging a Page to a new position can each be undone and redone as one step, restoring the Pages' content and order.
- [ ] Deleting a Slot can be undone, restoring its content, position and rotation.
- [ ] Undo and Redo buttons are added to the right-hand group of the command bar ([023](023-command-bar.md)), with the same enabled state as the shortcuts.
- [ ] In Layout mode ([010](010-layouts.md)), each Layout has its own undo history. Moving Photos between Folders is never undone.
- [ ] With undo available, the Spread and Slot deletion questions from [018](018-page-strip.md) and [019](019-slot-toolbar.md) are removed, along with their Preferences checkboxes.
