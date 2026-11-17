# 020 – Resizable Photo pane

Status: done · Depends on: 016

## What

Let the Photo pane take less room, or none, so the Spreads get more space.

## Acceptance criteria

- [x] Dragging the pane's inner edge changes its width, within a sensible minimum and maximum.
- [x] A button on the pane's edge collapses it fully. When collapsed, a button stays visible at the window edge to open it again.
- [x] A native View menu has Toggle Photos (Ctrl+B), which collapses and opens the pane, and Compact Photos.
- [x] **Compact Photos** shows smaller thumbnails without file names. Usage badges stay visible.
- [x] Width, collapsed state and Compact are remembered per computer in `settings.json`, not in the Album.

## Notes

- The width is clamped to 200–640 px, and to at most 60% of the window. A drag
  or arrow key starts from the width on screen, so a narrow window has no dead
  zone. The separator is focusable and the arrow keys resize it in 16 px steps.
  A drag saves the width once, when it ends. The stored width is kept as chosen;
  only its display is limited by the window.
- Ctrl+B is handled by the webview, not by a native accelerator. On Windows a
  native accelerator would take Ctrl+B from Text Slots, where it toggles Bold
  (009). A Text Slot that handles Ctrl+B keeps it, and text fields and open
  modal dialogs are left alone. The menu shows "Ctrl+B" as a label through a
  tab in the item text, which only Windows renders as a shortcut column.
- The View items are enabled only while an Album is open and Preferences is
  closed. They stay enabled during autosave, since the pane does not affect
  saving. Compact Photos is a native check item, kept in sync without
  reinstalling the menu (see 016 addendum, section 2).
- A collapsed pane stays mounted, so its folder and scan are kept.
- Compact tiles are 60 px high, with folder names inside the folder tile. File
  names stay available in each tile's tooltip.
- Settings are stored as a `photoPane` object in `settings.json`. Older files
  without it get the defaults: 340 px, open, not compact.

## Earlier considerations reviewed

- 019's "deletion preferences travel as four props / generic preference
  command" stays deferred. The pane settings travel as one object through one
  `set_photo_pane` command, but the deletion preferences are unchanged.
- Native WebView2 smoke checks (005–019) partly done for this issue: collapse,
  reopen, Ctrl+B, drag-resize, persistence across reload and Compact were
  checked in `tauri dev`. Other deferred points (cache pruning, rendition
  transport, Slot helpers, Photo identity casing, bundle size, AlbumView size)
  are not affected by this issue.

## Future considerations (low priority)

- The native View menu could not be opened through UI Automation during the
  smoke test. Its items are covered by the App tests with a mocked menu; click
  through them once by hand in WebView2.
- On macOS the "Ctrl+B" label would show as literal text. Only Windows is
  targeted today.
- Code review (Standards) judgement calls:
  - The pane defaults (340 px, open, not compact) are defined in both
    `settings.rs` and `PhotoPane.tsx`, and only TypeScript clamps the width.
  - `PhotoBrowser` checks `compact` in several places (labels, figcaption,
    folder name). Consider one per-mode map if Compact grows.
  - `photoPane` and `onPhotoPaneChange` pass through `DocumentWorkspace` like
    the deletion preferences do (see 019).
- The aria-valuenow of the separator follows the window width only on the next
  render; the CSS `max-width: 60vw` keeps the display right while the window is
  resized.
