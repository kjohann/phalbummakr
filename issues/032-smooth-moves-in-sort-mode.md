# 032 – Smooth moves in Sort mode

Status: todo · Type: bug · Depends on: 028

## What

After a move, the app reads the whole Library from disk again. Nothing happens for a moment, then the moved Photo disappears, and the Photo pane jumps back to the top. With one Photo shown, the next Photo appears in the work area before the moved one leaves the grid, so the highlight jumps around. Rescan also resets the scroll position.

Moves should give feedback straight away, keep the grid where it is and only finish once the grid has caught up.

Comes from real use (inbox, Sort mode and Rescan).

## Acceptance criteria

- [ ] After a move, the grid updates in place. The Library isn't rebuilt from a full rescan, and the grid isn't recreated.
- [ ] Sending to a Folder, by any route, keeps the Photo pane's scroll position (best effort).
- [ ] Rescan keeps the Photo pane's scroll position (best effort).
- [ ] Moved Photos leave the work area straight away with a short fade.
- [ ] Tiles of moved Photos dim and show that they're busy until the move finishes, then disappear.
- [ ] With one Photo shown, the next Photo appears only once the grid has settled, so the highlight doesn't jump.
- [ ] A failed move puts the tiles back to normal and shows the error.

## Notes

- Today every move calls `setScan`, which runs a full rescan. `PhotoGrid`'s `key` includes the scan's `generation`, so the grid is mounted again and its scroll resets ([PhotoBrowser.tsx](../src/ui/PhotoBrowser.tsx)).
- Check whether the delay also shows up in a release build, or only in dev.
