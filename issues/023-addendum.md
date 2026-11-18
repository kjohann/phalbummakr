# 023 addendum - Photo pane controls inside the pane

Status: done · Addendum to: [023 - Command bar and mode switch](023-command-bar.md)

## Feedback

Toggle Photos could simply be a pin on the left pane, which also makes it a
general control for whatever the pane shows. Compact Photos can likewise be a
toggle button inside that pane. Both then leave the command bar.

## Additional acceptance criteria

- [x] The left pane has a pin button in its header. While pinned, the pane
  stays open beside the work area, as today. Unpinning collapses it to the
  window edge, with the button that opens it again.
- [x] The pin belongs to the left pane itself, not to the Photo browser, so the
  same control works for whatever the pane shows in other modes, such as the
  Folder tree ([025](025-folder-tree.md)) or the Layout Library
  ([010](010-layouts.md)).
- [x] Ctrl+B still pins and unpins the pane, with the same exceptions as
  today: Text Slots, text fields and open dialogs keep Ctrl+B. The pin's
  tooltip shows the shortcut.
- [x] Compact is a toggle button inside the Photo pane, showing its pressed
  state.
- [x] Toggle Photos and Compact Photos are removed from the command bar and
  its "⋯" menu.
- [x] Pinned state, width and Compact are still remembered per computer in
  `settings.json`, as in [020](020-photo-pane.md).

## Notes

- `PhotoPane` is the left pane whatever it shows. It now has a header with a
  `title` heading (the Photo browser passes "Photos") and a pin button:
  "Pin Photo pane", `aria-pressed`, `aria-keyshortcuts="Control+B"`, tooltip
  "Unpin Photo pane (Ctrl+B)". The pin replaces the small "Hide Photos" tab on
  the pane's right edge. Unpinned, the pane collapses and the edge button
  "Show Photo pane (Ctrl+B)" opens it again. Its children sit in
  `.photo-pane-content` below the header.
- The Photo browser's own "Photos" heading moved into the pane header. Its
  header now shows the Photo count, a **Compact** toggle (`aria-pressed`) and
  Rescan. `PhotoBrowser` reports changes through `onCompactChange`, and `App`
  saves them with the other pane settings, unchanged in `settings.json`.
- Ctrl+B is still handled by `App` with the same guards (handled events, text
  fields, `[contenteditable]`, open modal dialogs). The `compactPhotos` action
  and both bar commands are gone. Album Settings… is now the first command to
  overflow, then Add Spread. The overflow ranks in
  [023](023-command-bar.md#notes) describe the bar before this addendum.
- Tests: `App.test.tsx` covers the pin, the edge button, Ctrl+B, Compact
  persistence and the bar without these commands. `PhotoBrowser.test.tsx` covers
  the Compact toggle's pressed state and callback.

## Earlier considerations reviewed

- 023: "Smoke-test the bar in WebView2 … Delete/Ctrl+B with the bar" is partly
  obsolete. Ctrl+B is no longer on the bar. The rest stays deferred, and the
  pin needs the same WebView2 check (see below).
- 023: the Data Clumps and Shotgun Surgery notes on Album commands are
  unaffected. This addendum removed bar commands and added none.
- 020: "pane defaults defined in both `settings.rs` and `PhotoPane.tsx`",
  "`PhotoBrowser` checks `compact` in several places" and "`photoPane`
  through `DocumentWorkspace`" stay deferred. The settings shape is unchanged.
  `onCompactChange` reuses `onPhotoPaneChange`, so no new prop travels through
  `DocumentWorkspace`.
- 020: "the native View menu could not be opened through UI Automation" was
  already obsolete (023).

## Future considerations (low priority)

- Check the pane header, pin and Compact toggle by eye in `tauri dev`. The
  layout was not checked in a browser or WebView2 this time. Only jsdom tests
  and the CSS changes cover it.
- Code review (Standards) judgement calls:
  - `PhotoPane`, `PhotoPaneSettings` and the `photo-pane-*` classes keep the
    "Photo pane" name. That matches 025 ("Folder tree in the Photo pane"), but
    reconsider it if the Layout Library (010) reuses the pane.
  - The pin's `aria-pressed` is always `true` while the pin is visible, because
    the pane is hidden when unpinned. It still reads as a pin, as the addendum
    asks. In practice it is a one-way "unpin" button, and the edge button pins
    the pane again.
