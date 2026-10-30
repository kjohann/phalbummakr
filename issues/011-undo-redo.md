# 011 – Undo and redo

Status: todo · Depends on: 006

## What

Undo and redo every Album change during the current session.

## Acceptance criteria

- [ ] Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) undo and redo Slot, Placement, Crop, text and page operations.
- [ ] A drag or pan counts as one undo step, not one per mouse move.
- [ ] Undo history is kept only for the session. Autosave still writes the current state.
