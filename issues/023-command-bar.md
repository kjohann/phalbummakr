# 023 – Command bar and mode switch

Status: done · Type: feature · Depends on: 016, 019, 020

Addendum: [023 addendum - Photo pane controls inside the pane](023-addendum.md)

## What

Replace the Album title bar and most of the native menu with a compact, context-aware command bar above the work area, and add a switch between the Album, Layouts and Sort modes.

## Acceptance criteria

- [x] A single-row command bar replaces the Album title bar ("title · N Pages") and the Page Format line below it. It is no taller than the title bar it replaces.
- [x] The bar has three groups: the mode switch on the left, commands for the current context in the middle, and document commands on the right. Low-priority commands move into a "⋯" overflow menu when the window is too narrow.
- [x] The mode switch offers **Album**, **Layouts** and **Sort**. The app always starts in Album mode, and the mode is not saved in the Album file. Layouts and Sort show placeholders until [010](010-layouts.md) and [028](028-sort-mode.md) are done.
- [x] Switching modes keeps the state of each mode, such as the current Spread and Slot selection in Album mode.
- [x] Every mode needs an open Album. With no Album open, the bar shows only what's needed to open or create one.
- [x] The native **File** menu stays. The Edit, Album and View menus are removed, and their commands (Delete, Album Settings…, Add Spread, Toggle Photos, Compact Photos) move into the bar with the same enabled/disabled rules and shortcuts.
- [x] In Album mode with no Slot selected, the middle group shows Add Photo Slot and Add Text Slot.
- [x] The Album title is shown in the window title.

## Notes

- `CommandBar.tsx` renders the bar from plain command lists (`BarCommand`):
  label, action, disabled, pressed (toggles), shortcut and an optional
  overflow rank. `App` builds the lists for the current context and mode.
- Layout: mode switch | context group | document group. In Album mode the
  middle group shows Add Photo Slot, Add Text Slot and Add Spread, or Delete
  and Add Spread while a Slot is selected ([024](024-slot-tools-in-command-bar.md)
  replaces this with the Slot's tools). The right group has Toggle Photos,
  Compact Photos and Album Settings…; Save (016 addendum) and Undo/Redo (011)
  go there later. With no Album open, the bar shows New Album… and Open Album….
- The bar is 38 px high. The old title row, Page Format line and the
  workspace's top padding took about 85 px, and the Album workspace's top
  padding is now 14 px, so the Spreads get more height.
- Overflow: an invisible copy of the bar lays out every command, and a
  ResizeObserver compares its width to the bar's. Commands move into "⋯" in
  rank order: Compact Photos, Album Settings…, Toggle Photos, Add Spread. The
  mode switch, Add Photo/Text Slot and Delete never overflow. The menu uses
  menuitem/menuitemcheckbox roles, focuses its first item, supports the arrow
  keys and closes on Escape, outside clicks and after running a command.
- Enabled rules (decided with the user): Album commands stay enabled while an
  autosave is only pending, so the bar does not flash after every edit. They
  are disabled while a save is being written or has failed, while a crop or a
  deletion dialog is in progress, while an Album is opening or closing, and
  while Preferences is open. `AlbumWorkspace` reports this through
  `onEditableChange`. Delete also needs a selected Slot. Toggle Photos and
  Compact Photos keep the View menu's rule. New Album… and Open Album… use the
  File menu's rule.
- Shortcuts are unchanged and still handled by the webview: Delete for the
  selected Slot and Ctrl+B for Toggle Photos. The bar shows them through
  `aria-keyshortcuts`, a tooltip and the overflow menu's shortcut column.
- Modes: the mode lives in `App`, keyed by the open document, so the app and
  every newly opened Album start in Album mode; it is never saved. Other modes
  hide the Album workspace instead of unmounting it, so Spread, Page and Slot
  selection survive. The hidden workspace ignores the Delete key. The Photo
  pane stays visible in every mode, since Sort ([025](025-folder-tree.md)) and
  Layouts ([010](010-layouts.md)) reuse it. Album Settings… works in every
  mode: `ModalDialog` now renders into `document.body` through a portal.
- The floating Add Slots palette from 019 is removed (decided with the user).
  The right-click Add Photo Slot/Add Text Slot menu on a Page stays.
- The window title already showed `<Album title> — phalbummakr` (016); a test
  now covers it, as the in-page title is gone.
- Tests: `CommandBar.test.tsx` covers overflow with stubbed widths. `App`
  tests cover the bar per context, routing, enabled rules, modes and the
  File-only native menu. `AlbumWorkspace` tests send commands through a small
  command-bar stand-in, replacing the palette and native-menu harness.
- Verified in a temporary browser harness (removed): 38 px bar, overflow at
  1300/900/760/640/520 px, the "⋯" menu, the Layouts placeholder, Album
  Settings… from Layouts, and the no-Album bar.

## Earlier considerations reviewed

- 019: "The floating palette … can cover the corner of a right-hand Page" is
  resolved; the palette is removed. "Smoke-test … the native Edit and Album
  menus" is obsolete; those menus are gone. The Slot toolbar, crop handle and
  context-menu smoke checks remain deferred to 024, which reworks them.
- 020: "The native View menu could not be opened through UI Automation" is
  obsolete; the View menu is gone and its commands are bar buttons covered by
  tests. "On macOS the Ctrl+B label would show as literal text" is resolved for
  the menu; the bar's tooltip and shortcut column still say Ctrl, and only
  Windows is targeted.
- 019/020: deletion preferences and Photo pane settings travelling through
  `DocumentWorkspace` stay deferred. This issue adds `mode`, `active` and
  `onEditableChange` to the same path (see below).
- 019: `AlbumView.tsx` size stays deferred; this issue only removed the palette
  and added two command cases.
- Native WebView2 smoke checks, cache pruning, rendition transport, Slot
  helpers, Photo identity casing and bundle size are unaffected.

## Future considerations (low priority)

- Smoke-test the bar in the integrated WebView2 app: the overflow at real
  window sizes, the "⋯" menu, focus handling, and Delete/Ctrl+B with the bar.
  The browser harness checked layout but not WebView2.
- The overflow is applied on the next ResizeObserver callback, so a resize can
  show one frame of the previous layout.
- Code review (Standards) judgement calls:
  - Data Clumps: `command`, `active`, `onSlotSelectedChange` and
    `onEditableChange` travel together through `DocumentWorkspace`,
    `AlbumWorkspace` and `AlbumView`. Consider one "Album mode context" object
    when 024 adds Slot tools.
  - Shotgun Surgery: a new bar command touches `AlbumCommandName`, the
    `if/else` chain in `AlbumView` and the command lists in `App`. 024 will add
    many commands; consider a command map there.