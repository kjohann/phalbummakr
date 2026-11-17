# 023 addendum - Photo pane controls inside the pane

Status: todo · Addendum to: [023 - Command bar and mode switch](023-command-bar.md)

## Feedback

Toggle Photos could simply be a pin on the left pane, which also makes it a
general control for whatever the pane shows. Compact Photos can likewise be a
toggle button inside that pane. Both then leave the command bar.

## Additional acceptance criteria

- [ ] The left pane has a pin button in its header. While pinned, the pane
  stays open beside the work area, as today. Unpinning collapses it to the
  window edge, with the button that opens it again.
- [ ] The pin belongs to the left pane itself, not to the Photo browser, so the
  same control works for whatever the pane shows in other modes, such as the
  Folder tree ([025](025-folder-tree.md)) or the Layout Library
  ([010](010-layouts.md)).
- [ ] Ctrl+B still pins and unpins the pane, with the same exceptions as
  today: Text Slots, text fields and open dialogs keep Ctrl+B. The pin's
  tooltip shows the shortcut.
- [ ] Compact is a toggle button inside the Photo pane, showing its pressed
  state.
- [ ] Toggle Photos and Compact Photos are removed from the command bar and
  its "⋯" menu.
- [ ] Pinned state, width and Compact are still remembered per computer in
  `settings.json`, as in [020](020-photo-pane.md).
