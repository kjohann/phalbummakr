# 056 – Keyboard nudging for Selected Slots

Status: done · Type: feature · Depends on: 011, 013, 014, 030, 051, 054

## What

Allow precise positioning of Selected Slots with the arrow keys in Album and
Layout modes. Nudging moves Photo Slots and Text Slots together without a
pointer drag, while providing alignment guides and preserving a consistent
movement step when a nudge stops at an alignment.

## Acceptance criteria

- [x] In Album and Layout modes, the arrow keys move all Selected Slots
  together by 1 mm per press; Shift+arrow moves them by 10 mm. Distances are
  measured on the Page, independent of canvas zoom.
- [x] Nudging follows the same movement limits as dragging and does not
  otherwise snap.
- [x] If a nudge step would cross an alignment target, it stops exactly at the
  target and shows the matching snap guide. Targets match drag snapping:
  Page edges and centre, Safe Zone, other Slots' edges and centres, and equal
  gaps.
- [x] After a step stops at an alignment, the next press completes the
  remaining distance to the original 1 mm or 10 mm step endpoint. If that
  completion crosses another alignment, it stops there in turn. Changing
  direction or ending the nudge run resets the interrupted-step rhythm.
- [x] Guides remain visible until the nudge run ends.
- [x] Each nudge run is one undo step. A run ends on selection change, another
  action, or about one second without nudging.
- [x] Nudging follows existing keyboard ownership rules and does not interfere
  with text editing, fields, dialogs, or other controls. Ctrl+Left/Right
  continues to rotate the selected Slot(s).
- [x] Focused tests cover single and multiple Selected Slots, both step sizes,
  alignment stops and guide visibility, movement limits, undo grouping, and
  keyboard ownership in both modes.

## Implementation

- Shared crossing-aware snapping finds the first reachable drag alignment in a
  keyboard step. Nudging uses the existing rigid Slot move and Bleed limits.
- A shared keyboard run retains an interrupted step, guides and one history
  group until an action, selection change or one-second pause ends it.
- Layout mode retains its existing single-Slot selection; Album mode moves
  Selected Slots together.

## Earlier follow-ups and inbox

- [006](006-photo-slots.md) suggested keyboard nudging; this issue implements it.
- [013](013-slot-snapping.md) and [054](054-move-selected-slots-together.md)
  dense-Page profiling remains deferred: the existing pair scan and group
  bounds rules are unchanged. Inner group-edge snapping remains separate.
- Native WebView2 checks from 011, 013, 014, 030, 051 and 055 remain deferred;
  automated workspace tests cover the keyboard and SVG guide behavior here.
- The inbox has no additional note resolved by this change; its broader
  matching-distance request remains separate.

## Code review

- Fixed an out-of-Bleed rotated Slot jumping on the axis perpendicular to a
  nudge: an unchanged movement axis no longer clamps the Slot.
- Fixed pointer selection leaving focus on a toolbar button: selecting a Slot
  by pointer now focuses it, without taking arrow keys from other controls.
- Standards review found no significant issues.

## Future considerations (low priority)

- No remaining non-blocking review findings.
