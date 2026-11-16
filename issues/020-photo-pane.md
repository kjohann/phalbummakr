# 020 – Resizable Photo pane

Status: todo · Depends on: 016

## What

Let the Photo pane take less room, or none, so the Spreads get more space.

## Acceptance criteria

- [ ] Dragging the pane's inner edge changes its width, within a sensible minimum and maximum.
- [ ] A button on the pane's edge collapses it fully. When collapsed, a button stays visible at the window edge to open it again.
- [ ] A native View menu has Toggle Photos (Ctrl+B), which collapses and opens the pane, and Compact Photos.
- [ ] **Compact Photos** shows smaller thumbnails without file names. Usage badges stay visible.
- [ ] Width, collapsed state and Compact are remembered per computer in `settings.json`, not in the Album.
