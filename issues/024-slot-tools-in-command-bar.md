# 024 – Slot tools in the command bar

Status: done · Type: tweak · Depends on: 023

## What

Move the buttons and menus currently attached to a selected Slot into the command bar. This replaces the attached Slot toolbar from [019](019-slot-toolbar.md) and the attached Text Slot controls from [009 addendum](009-addendum.md).

## Acceptance criteria

- [x] When a Slot is selected in Album mode, the middle group of the command bar shows that Slot's tools instead of the default commands. When the selection is cleared, the default commands come back.
- [x] Photo Slot tools in the bar: Crop/Fit, Zoom, rotate 90°, delete and the other commands from the 019 toolbar.
- [x] Text Slot tools in the bar: the font, size and style controls from the 009 addendum, plus rotate and delete.
- [x] No toolbar or menu is attached to the Slot any more. Direct-manipulation handles stay on the Slot: move, resize, rotate, the drag-to-swap handle and panning a Crop.
- [x] Editing text in a Text Slot keeps focus and selection while its style is changed from the bar.
- [x] The same Slot tools work in Layout mode ([010](010-layouts.md)), without content-only commands such as Crop/Fit and Zoom.

## Decisions

Decided with the user before implementing:

- The right-click menu on a Slot (Fit, Rotate left/right, Delete) stays. It
  opens at the cursor and is not attached to the Slot.
- The Slot's tools replace all of the middle group's default commands,
  including Add Spread.
- Layout mode does not exist yet ([010](010-layouts.md)). `PhotoSlotTools`
  takes `content={false}` to leave out Fit and Zoom, and a test covers it.
  010 connects the tools to Layout mode.

## Notes

- `CommandBar` renders an empty `.command-tools` host at the start of the
  middle group and reports it through `toolsRef`. `App` keeps the element and
  passes it down. `AlbumView` renders the selected Slot's tools into it with
  `createPortal`, so the Slot's state, fonts and handlers stay in `AlbumView`.
  The tools only render while Album mode is shown and no New Album draft is
  open. `active` is now `mode === "album" && !hidden`, so the Delete key also
  ignores a hidden workspace.
- `App` hides Add Photo Slot, Add Text Slot and Add Spread while a Slot is
  selected. The bar's Delete command and the `delete-slot` Album command are
  gone. Delete is a Slot tool (with `aria-keyshortcuts="Delete"`), and the
  Delete key works as before.
- Overflow: the tools are rendered from outside the bar, so its invisible copy
  cannot measure them. `overflowing` adds the host's `scrollWidth`, and the
  ResizeObserver also watches the host. The tools themselves never move into
  "⋯". The font family select shrinks to 70 px. A browser harness showed
  everything fits down to about 560 px; the window's minimum width is 720 px.
- `SlotToolbar.tsx` is now `SlotTools.tsx` (`PhotoSlotTools`, `SlotActions`,
  `keepFocus`), and `TextSlotControls.tsx` is now `TextSlotTools.tsx`. The
  attached positioning (`useAttachedPosition`) and the floating toolbar CSS are
  removed. The tools use the bar's `.command` buttons. Fit is a toggle button
  with `aria-pressed` instead of a checkbox. The Format menu opens below the bar.
- Keeping focus while editing text:
  - `keepFocus` cancels mouse-down on the tools' buttons, the Format summary
    and the Format checkboxes, so the text box keeps focus and selection.
  - Selects and the colour and size inputs need focus. When the text box loses
    focus to the tools, `AlbumView` notes it. `TextSlotTools` calls `onCommit`
    once a choice is made, and focus returns to the text box with its
    selection:
    - after a select changes
    - after a Format checkbox changes
    - after Enter in the exact size
    - after the colour input's native `change` event (React's `onChange`
      follows the picker live)
- `command`, `toolsHost`, `onSlotSelectedChange` and `onEditableChange` travel
  together as one `CommandBarLink` (`bar` prop) through `DocumentWorkspace`,
  `AlbumWorkspace` and `AlbumView`, as 023 suggested.
- Tests:
  - `CommandBar.test.tsx`: the host and the overflow with the tools' width.
  - `App.test.tsx`: the tools replace the default commands, which come back
    when the selection is cleared.
  - `AlbumWorkspace.test.tsx`, through a bar stand-in with a tools host:
    - Photo and Text tools in the bar, not in the Spread editor
    - Fit's pressed state; tools gone when the selection is cleared
    - the text box keeps focus and selection after a style change
    - the Layout-mode option
  - The two attached-position tests were removed with the positioning.
- Verified in a temporary browser harness (removed), with real mouse input:
  - Photo and Text tools in the 38 px bar, handles still on the Slot
  - Format menu below the bar
  - focus and selection kept after Format › Bold and the alignment select
  - overflow at 700, 640, 600, 560 and 420 px
- Verification: 170 tests, typecheck, lint and production build pass. The
  existing Vite chunk-size warning remains.

## Earlier considerations reviewed

- 023: **Data Clumps** is resolved by `CommandBarLink`. `active` stays a
  separate prop because it follows the mode, not the bar. **Shotgun Surgery**
  is resolved for Slot actions: Slot tools are components in `SlotTools.tsx`
  and `TextSlotTools.tsx`, not bar commands, and `delete-slot` is gone. The
  one-frame overflow lag and the WebView2 smoke test of the bar stay deferred.
- 019: **Smoke-test the Slot toolbar, crop handle, context menus** is partly
  done. The browser harness checked the tools in the bar and the crop handle.
  WebView2 remains unchecked (see below). The palette note was already
  resolved in 023. The confirm-deletion helper, the drag listener setup, Slot
  lookups, the deletion preference props and `AlbumView.tsx` size stay
  deferred. This issue removed code from `AlbumView` but did not restructure it.
- 009 addendum: **Confirm floating controls … in WebView2** and Section 2's
  **initial toolbar appearance** are obsolete; nothing floats or is
  positioned any more. Checking typography and Ctrl+B/I/U in WebView2 remains.
  Missing-font warnings stay deferred to Page Export.
- 023 addendum, 020: the Photo pane naming, `PaneModes` passing through
  `DocumentWorkspace` and the pane settings duplication are unrelated and stay
  deferred.

## Future considerations (low priority)

- Smoke-test in `tauri dev` (WebView2):
  - native select and colour picker focus return to the text being edited
  - the colour picker's commit event
  - Ctrl+B/I/U inside the bar
  - the tools at real window sizes
- The Slot tools never move into "⋯". Below about 560 px they would run under
  it. The window's 720 px minimum prevents that today, but a wider Photo pane
  layout or an extra tool could reach it.
- The Format menu (`<details>`) stays open until Format is clicked again, as
  before. It now hangs below the bar over the Spread.
- Focus returns to the text only when it moved straight from the text into the
  tools. Tabbing into the bar through other controls leaves focus in the bar.
- Code review (Standards) judgement calls:
  - `DocumentWorkspace` and `AlbumWorkspace` mostly pass `bar` along
    (Middle Man), as with the other workspace props.
  - The exact font size lives both as a draft in `TextSlotTools` and in the
    Slot's style, and Enter and blur both apply it. A flag now stops the blur
    that follows Enter from applying it twice. Undo (011) may want a simpler
    single commit point.
