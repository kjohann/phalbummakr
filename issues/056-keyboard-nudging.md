# 056 – Keyboard nudging for Selected Slots

Status: todo · Type: feature · Depends on: 011, 013, 014, 030, 051, 054

## What

Allow precise positioning of Selected Slots with the arrow keys in Album and
Layout modes. Nudging moves Photo Slots and Text Slots together without a
pointer drag, while providing alignment guides and preserving a consistent
movement step when a nudge stops at an alignment.

## Acceptance criteria

- [ ] In Album and Layout modes, the arrow keys move all Selected Slots
  together by 1 mm per press; Shift+arrow moves them by 10 mm. Distances are
  measured on the Page, independent of canvas zoom.
- [ ] Nudging follows the same movement limits as dragging and does not
  otherwise snap.
- [ ] If a nudge step would cross an alignment target, it stops exactly at the
  target and shows the matching snap guide. Targets match drag snapping:
  Page edges and centre, Safe Zone, other Slots' edges and centres, and equal
  gaps.
- [ ] After a step stops at an alignment, the next press completes the
  remaining distance to the original 1 mm or 10 mm step endpoint. If that
  completion crosses another alignment, it stops there in turn. Changing
  direction or ending the nudge run resets the interrupted-step rhythm.
- [ ] Guides remain visible until the nudge run ends.
- [ ] Each nudge run is one undo step. A run ends on selection change, another
  action, or about one second without nudging.
- [ ] Nudging follows existing keyboard ownership rules and does not interfere
  with text editing, fields, dialogs, or other controls. Ctrl+Left/Right
  continues to rotate the selected Slot(s).
- [ ] Focused tests cover single and multiple Selected Slots, both step sizes,
  alignment stops and guide visibility, movement limits, undo grouping, and
  keyboard ownership in both modes.
