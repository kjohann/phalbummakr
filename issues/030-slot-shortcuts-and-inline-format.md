# 030 – Slot shortcuts and inline text formatting

Status: todo · Type: tweak · Depends on: 024

## What

Add keyboard shortcuts for zooming a Crop and rotating a Slot. Also show the
Text Slot tools' bold, italic and underline as buttons directly in the command
bar, like a WYSIWYG editor, instead of behind the Format dropdown from
[024](024-slot-tools-in-command-bar.md).

## Acceptance criteria

### Shortcuts

- [ ] With a Photo Slot selected that has a Placement and Fit off, Ctrl+Plus
  zooms in and Ctrl+Minus zooms out, in the same steps as the Zoom buttons.
- [ ] With a Slot selected, Ctrl+Left rotates it counterclockwise and
  Ctrl+Right rotates it clockwise, like the Rotate buttons.
- [ ] The shortcuts follow the Delete key's rules. They do nothing while typing
  in a text field, while editing a Text Slot, while a dialog is open, or
  outside Album mode.
- [ ] The Zoom and Rotate buttons show their shortcuts in their tooltips and
  `aria-keyshortcuts`.

### Inline text formatting

- [ ] The Text Slot tools show Bold, Italic and Underline as toggle buttons in
  the bar, each showing whether it is on. The Format dropdown is removed.
- [ ] The buttons keep focus and selection in the text being edited, as the
  other Slot tools do.
- [ ] Ctrl+B, Ctrl+I and Ctrl+U work as before, and the buttons' tooltips
  show them.

## Notes

- Ctrl+Plus and Ctrl+Minus are the webview's own page zoom shortcuts. The app
  must stop the webview zooming the page while a Photo Slot handles them.
  Decide what they do when no Slot is selected.
- Ctrl+Left and Ctrl+Right move by word in text fields, so they must keep doing
  that while editing text.
- Ctrl+Plus may arrive as `+` or `=` depending on the keyboard layout and
  Shift; the numeric keypad keys should also work.
- Three more buttons make the Text Slot tools wider. Check them against the
  bar's overflow at the 720 px minimum window width (see 024's Notes). If they
  don't fit there, keep Bold, Italic and Underline in a Format dropdown only
  when the bar is too narrow. At wider widths they stay inline.
