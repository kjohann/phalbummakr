# 030 – Slot shortcuts and inline text formatting

Status: done · Type: tweak · Depends on: 024

## What

Add keyboard shortcuts for zooming a Crop and rotating a Slot. Also show the
Text Slot tools' bold, italic and underline as buttons directly in the command
bar, like a WYSIWYG editor, instead of behind the Format dropdown from
[024](024-slot-tools-in-command-bar.md). Text alignment gets the same
treatment: the alignment dropdown was easy to miss.

## Acceptance criteria

### Shortcuts

- [x] With a Photo Slot selected that has a Placement and Fit off, Ctrl+Plus
  zooms in and Ctrl+Minus zooms out, in the same steps as the Zoom buttons.
- [x] With a Slot selected, Ctrl+Left rotates it counterclockwise and
  Ctrl+Right rotates it clockwise, like the Rotate buttons.
- [x] The shortcuts follow the Delete key's rules. They do nothing while typing
  in a text field, while editing a Text Slot, while a dialog is open, or
  outside Album mode.
- [x] The Zoom and Rotate buttons show their shortcuts in their tooltips and
  `aria-keyshortcuts`.

### Inline text formatting

- [x] The Text Slot tools show Bold, Italic and Underline as toggle buttons in
  the bar, each showing whether it is on. The Format dropdown is removed.
- [x] The buttons keep focus and selection in the text being edited, as the
  other Slot tools do.
- [x] Ctrl+B, Ctrl+I and Ctrl+U work as before, and the buttons' tooltips
  show them.
- [x] Text alignment is three icon buttons (left, centre, right) instead of a
  dropdown. The current alignment is shown as pressed, and they keep focus in
  the text being edited, like the formatting buttons.
- [x] When the bar is too narrow, such as at the 720 px minimum window width,
  the formatting buttons and the alignment buttons each fold into a dropdown
  again. At wider widths they stay inline.
- [x] The same tools work in Layout mode ([010](010-layouts.md)).

## Notes

- Ctrl+Plus and Ctrl+Minus are the webview's own page zoom shortcuts. The app
  must stop the webview zooming the page while a Photo Slot handles them.
  Decide what they do when no Slot is selected.
- Ctrl+Left and Ctrl+Right move by word in text fields, so they must keep doing
  that while editing text.
- Ctrl+Plus may arrive as `+` or `=` depending on the keyboard layout and
  Shift; the numeric keypad keys should also work.
- Six more buttons make the Text Slot tools wider. Check them against the
  bar's overflow at the 720 px minimum window width (see 024's Notes).

## Decisions

Decided with the user before implementing:

- **Page zoom:** Ctrl+Plus and Ctrl+Minus never zoom the page while Album or
  Layout mode is shown, even with no Slot selected or when the selected Slot
  can't zoom (Text Slot, Fit on, no Placement). They then do nothing. They are
  blocked in text fields and dialogs too, where they have no other meaning.
  Tauri 2 already turns off the webview's zoom hotkeys by default
  (`zoomHotkeysEnabled`), so this mainly matters in a plain browser.
- **Folding order:** the formatting and alignment buttons fold into dropdowns
  before the bar moves its own commands into "⋯".
- "Outside Album mode" means the shortcuts only work in the mode that is
  shown. Layout mode has its own Rotate and Delete shortcuts for its Slots, as
  it already had for Delete.

## Implementation notes

- `slotShortcuts.ts` has `useSlotShortcuts(active, handlers)`. It handles
  Delete, Ctrl+Plus/Minus and Ctrl+Left/Right on `window`, using the Delete
  key's existing rules, and replaces the Delete-only effects in `AlbumView`
  and `LayoutWorkspace`. A handler is left out while its action is
  unavailable. Album mode passes `zoom` only for a Photo Slot with a Placement
  and Fit off. Layout mode never passes `zoom`.
  - `App` blocks page zoom with `isPageZoomKey`. Its listener depends only on
    the mode shown, so the keys are blocked even with no Album open or while
    Layout mode is switching documents (when the workspaces aren't `active`).
    Because `App` has already prevented them, `useSlotShortcuts` still zooms
    the Crop for a prevented zoom key.
  - Zoom keys: `+`, `=` or `NumpadAdd`, and `-`, `_` or `NumpadSubtract`, with
    or without Shift. Rotation keys: Ctrl+ArrowLeft/ArrowRight without Shift,
    so Ctrl+Shift+Arrow still selects by word. Cmd works as Ctrl, as for the
    other shortcuts.
  - In text fields, the Text Slot editor and dialogs, the event is left alone
    (page zoom is still blocked), so Ctrl+Left/Right still move by word.
  - `ZOOM_STEP` (1.1) moved into `slotShortcuts.ts` so the buttons and the keys
    share it.
- Tooltips and `aria-keyshortcuts`: Zoom in `Control+Plus` (Ctrl+Plus), Zoom
  out `Control+-` (Ctrl+Minus), Rotate left/right `Control+ArrowLeft` and
  `Control+ArrowRight` (Ctrl+Left/Right). Bold, Italic and Underline show
  `Control+B`, `Control+I` and `Control+U`.
- `TextSlotTools` shows B, I and U as `aria-pressed` buttons and three SVG
  alignment buttons (Align left, Align centre, Align right). `keepFocus`
  already cancels mouse-down on the bar's buttons, so the text box keeps focus
  and selection. Each click still calls `onCommit` to end the undo group.
- Folding:
  - `CommandBar` exports `observeToolsRoom`, which reports the bar's width minus
    its invisible copy of every command (and the group gap). This is the room
    the tools have before any command moves into "⋯".
  - `TextSlotTools` folds when its unfolded width is more than that room. The
    unfolded width is its natural width with `flex-shrink: 0` (the font
    select would otherwise hide the shortage by shrinking). While folded, it
    adds the difference between the inline sets (measured while mounted
    unfolded) and the folded triggers. The decision doesn't depend on whether
    the tools are folded, so it doesn't flicker. The Text Slot tools always
    mount unfolded and fold in a layout effect before paint.
  - Folded, the tools show the old Format menu (checkboxes with Ctrl+B/I/U)
    and an alignment select with Left/Centre/Right.
- Tests:
  - `App.test.tsx`: page zoom keys are blocked in Album mode with no Album
    open, and a plain `+` is not.
  - `AlbumWorkspace.test.tsx`:
    - zoom keys, including `=` and the keypad
    - rotation keys and the buttons' tooltips and shortcuts
    - no Crop change with Fit on
    - shortcuts left to the Text Slot editor and dialogs
    - inline B/I/U and alignment: pressed state, saved style, mouse-down kept
      off, focus and selection kept after clicks
  - `LayoutWorkspace.test.tsx`: inline buttons and rotation keys in Layout
    mode, and no rotation while Layout mode is hidden.
  - `TextSlotTools.test.tsx`: the tools in the real `CommandBar` with stubbed
    widths fold before "⋯" appears, work folded, and unfold at the exact width.
- Verified in a temporary browser harness (removed): real `CommandBar` with
  Undo, Redo and Album Settings… and the Album Text Slot tools.
  - The tools need about 865 px unfolded. They fold below that and unfold at
    865 px.
  - At 720 px they are folded, and Album Settings… is in "⋯".
  - With real mouse clicks on Italic and Align right, focus and the text
    selection stay in the text box.
  - Folding saves only about 20–40 px, as the Format menu and alignment
    select are nearly as wide as the six buttons.
- Verification: 281 tests, typecheck and lint pass. `AlbumWorkspace.test.tsx`
  takes about 45 s and fails now and then on timing. "shows a failed Layout
  Library save…" and "places a dropped Photo…" each failed in some runs and
  passed in others. The Layout Library test also failed in one of two runs of
  the unchanged baseline (HEAD), so the flakiness predates this issue.

## Code review

Two-axis review (Standards and Spec) of the working tree against `2f5d2d8`.

- Fixed: page zoom was only blocked while a workspace was `active`, so with no
  Album open, or while Layout mode switched documents, Ctrl+Plus still zoomed
  the page. `App` now blocks the keys by mode (see above).
- Fixed smells:
  - The two command gap calculations in `CommandBar` are now one `commandGap`.
  - `slotShortcut` returns the action with its factor or turn, so the key
    handler no longer decodes a string a second time.
  - The two tests share one Ctrl key press helper.
  - `TextSlotTools` shares `setFormat` and `setAlign` between the buttons and
    the folded dropdowns.
- Noted, kept:
  - The README's crop paragraph still described the removed Crop photo
    checkbox and wheel zoom. It was rewritten along with the new zoom keys.
  - The Delete key now does nothing while editing is disabled, where it used
    to call a delete that did nothing.

## Future considerations (low priority)

- `AlbumWorkspace.test.tsx` is slow and flaky under load (see Verification).
  It is worth looking at the Layout Library notice timing and splitting the
  file.
- Folding saves only about 20–40 px, as the Format menu and alignment select
  are nearly as wide as the six buttons. A compact icon-only fold (one ▾ menu
  for both) would save more if the bar gets tighter.
- The fold reserves one 4 px group gap even when the middle group has no
  other commands, so it folds about 4 px early. This is harmless.
- Smoke-test in `tauri dev` (WebView2): Ctrl+Plus/Minus with the webview's
  zoom hotkeys, Ctrl+Left/Right, and the fold at real window sizes.

## Earlier considerations reviewed

- 024: **The Slot tools never move into "⋯"**: still true, but the Text Slot
  tools now fold first, which leaves more room before they reach "⋯". The
  window's 720 px minimum still prevents that. **The Format menu stays open
  until Format is clicked again**: it now only appears when the tools are
  folded. Deferred, as before. **Smoke-test in `tauri dev`**: still deferred,
  now including the new shortcuts and the fold at real window sizes.
- 023: the one-frame overflow lag also applies to the fold, which is applied on
  the next ResizeObserver callback. Deferred together.
- 009 addendum: checking Ctrl+B/I/U in WebView2 remains, as above.
- Keyboard nudging (006, 009, 013, 014) is a different shortcut and stays
  deferred. Mouse-wheel and pinch zoom stay in the [backlog](backlog.md).
