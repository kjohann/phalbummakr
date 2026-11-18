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

## Section 2 - Mode bar on the left pane

Status: done

### Feedback

Removing the edge handle made it impossible to pin the pane again after
unpinning it: the small "›" edge button and Ctrl+B were too easy to miss. The
pane should behave more like the left side of VS Code. The mode switch moves
into the pane, and collapsing the pane leaves a vertical, icon-only bar with
tooltips. Clicking the selected icon collapses and expands the pane.

### Additional acceptance criteria

- [x] The mode switch (Album, Layouts, Sort) moves from the command bar to the
  top of the left pane, where it replaces the pin. The command bar no longer
  shows it.
- [x] Collapsing the pane leaves a narrow vertical bar along the window edge
  with one icon per mode, each with a tooltip. The bar never disappears, so
  the pane can always be opened again.
- [x] Clicking the selected mode collapses or expands the pane. Clicking
  another mode switches to it and expands the pane, as in VS Code.
- [x] Ctrl+B still collapses and expands the pane, with the same exceptions as
  before. The selected mode's tooltip shows the shortcut.
- [x] Mode rules are unchanged: every Album opens in Album mode, the mode is
  not saved, and switching keeps each mode's state. The switch is disabled
  while Preferences is open.
- [x] Collapsed state, width and Compact are still remembered per computer in
  `settings.json`.

### Notes

- This replaces Section 1's pin, its edge "Show Photo pane" button and the
  pane's `title` heading. Section 1's Notes describe that earlier state. The
  Compact toggle in the Photo browser header and the settings are unchanged.
- `Mode` and `MODES` moved from `CommandBar.tsx` to `modes.ts`. `CommandBar`
  no longer takes a `mode` prop. `App` passes `{ current, onChange, disabled }`
  as `PaneModes` through `DocumentWorkspace` to `PhotoPane`. The disabled rule
  (Preferences open) is unchanged.
- `PhotoPane` renders the mode switch (group "Mode") at the top of the
  expanded pane, with icons and labels. Collapsed, it renders a rail (`nav`
  "Modes") with the same switch, icons only. Each button has its mode as its
  `aria-label` and its `title`. The selected mode also has `aria-expanded`,
  `aria-keyshortcuts="Control+B"` and the tooltip "Album · Hide/Show the Photo
  pane (Ctrl+B)". The pane's content stays mounted while it is collapsed, as
  before.
- Clicking another mode in the rail switches modes and expands the pane, as in
  VS Code. Clicking another mode while the pane is expanded only switches
  modes.
- Focus: the expanded switch and the rail are separate elements. The clicked
  mode takes focus in whichever one replaces the other, so keyboard users can
  press it again. A code review found this.
- Narrow panes: below 280 px a container query hides the mode labels, leaving
  icons with tooltips. The Photo browser header wraps, and its buttons are
  tighter, so Compact and Rescan fit at the 200 px minimum width. Section 1
  had let them overflow there.
- Tests: `App.test.tsx` covers:
  - the mode switch in the pane, and its absence from the bar
  - collapsing to the rail and expanding from the selected or another mode
  - tooltips, Ctrl+B, focus, the disabled state while Preferences is open,
    and persistence
- Verified in a temporary browser harness (removed):
  - the expanded switch, the rail, switching from the rail, the 200 px
    layout, and Ctrl+B dispatched to the page
  - The integrated browser's host takes a physical Ctrl+B for itself, so that
    path still needs a check in `tauri dev`.

### Earlier considerations reviewed

- Section 1: "the pin's `aria-pressed` is always `true` while visible" is
  obsolete. The pin is gone.
- Section 1: "check the pane header, pin and Compact toggle by eye" is
  partly done: the browser harness covered the new layout. WebView2 is still
  unchecked.
- Section 1 and 020: the "Photo pane" naming stays deferred. The pane now also
  owns the mode switch, so the name fits less well. Rename it when 025 or 010
  give the pane other content.
- 020: the pane settings travelling through `DocumentWorkspace` stay deferred.
  `modes` now travels the same way.
- 023: the WebView2 smoke test of the bar stays deferred. The bar no longer
  has the mode switch.

### Future considerations (low priority)

- Smoke-test in `tauri dev`: the rail, tooltips, a physical Ctrl+B and focus
  after collapsing.
- Code review judgement calls:
  - Shotgun Surgery: a mode's label lives in `MODES` (`modes.ts`) and its icon
    in `MODE_ICONS` (`PhotoPane.tsx`). `Record<Mode, …>` catches a missing
    icon, but a new mode touches both files.
  - Tramp data: `DocumentWorkspace` passes `PaneModes` on to `PhotoPane` and
    only reads `current` itself.
  - The pane no longer has a heading naming its content ("Photos"). Section 1
    added one; the mode switch now heads the pane instead. This was a
    deliberate choice.

