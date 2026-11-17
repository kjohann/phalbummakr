# 024 – Slot tools in the command bar

Status: todo · Type: tweak · Depends on: 023

## What

Move the buttons and menus currently attached to a selected Slot into the command bar. This replaces the attached Slot toolbar from [019](019-slot-toolbar.md) and the attached Text Slot controls from [009 addendum](009-addendum.md).

## Acceptance criteria

- [ ] When a Slot is selected in Album mode, the middle group of the command bar shows that Slot's tools instead of the default commands. When the selection is cleared, the default commands come back.
- [ ] Photo Slot tools in the bar: Crop/Fit, Zoom, rotate 90°, delete and the other commands from the 019 toolbar.
- [ ] Text Slot tools in the bar: the font, size and style controls from the 009 addendum, plus rotate and delete.
- [ ] No toolbar or menu is attached to the Slot any more. Direct-manipulation handles stay on the Slot: move, resize, rotate, the drag-to-swap handle and panning a Crop.
- [ ] Editing text in a Text Slot keeps focus and selection while its style is changed from the bar.
- [ ] The same Slot tools work in Layout mode ([010](010-layouts.md)), without content-only commands such as Crop/Fit and Zoom.
