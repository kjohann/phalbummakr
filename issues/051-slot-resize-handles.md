# 051 - Resize Slots from corners and sides

Status: done · Type: feature · Depends on: 006, 009, 011, 013, 014

## What

Extend Slot resizing beyond the bottom-right handle in Album and Layout modes.
Follows [006](006-photo-slots.md), [009](009-text-slots.md) and
[014](014-slot-rotation.md), and promotes the corresponding Editing backlog item.

Photo Slots have four corner handles and four side-midpoint handles. Dragging
a corner keeps the opposite corner fixed; dragging a side keeps the opposite
side fixed. Proportions remain freely adjustable.

Text Slots keep their auto-fitted height. Their corners and text-width sides
resize only text width, with the opposite edge fixed along that axis and the
existing auto-height behavior on the perpendicular axis. Top/bottom-only handles
are omitted for upright text; the available directions follow quarter-turn
rotation.

## Acceptance criteria

- [x] Photo Slots can resize from all four corners and all four side midpoints
  wherever resizing is already supported in Album and Layout modes.
- [x] Photo corner resizing keeps the opposite corner fixed; side resizing
  keeps the opposite side fixed and does not change the other dimension.
- [x] Text Slots expose only meaningful width-changing sides and corners,
  respecting rotation, opposite-edge anchoring and automatic height fitting.
- [x] Handles have usable screen-sized hit areas and directional cursors;
  corners take priority when small-Slot hit areas overlap.
- [x] Resizing clamps at the existing minimum size and Bleed boundaries without
  flipping the Slot when dragged past an opposite edge.
- [x] All handles preserve existing snapping and Ctrl bypass, including guides
  that agree with the final constrained geometry.
- [x] Photo Crop behavior, move/content/rotation interactions and single-Slot
  selection behavior remain intact; each resize gesture is one undo step.
- [x] Focused geometry, snapping and interaction tests pass, along with
  type-checking, lint and build.

## Scope decisions

No aspect-ratio lock, manually sized Text Slots, group resizing, whole-border
resize targets or new snapping patterns. The Inbox's additional placement
snapping request remains separate.

## Implementation and verification

- Shared handle rendering serves Album and Layout modes. Hit areas are 20 x
  20 screen pixels with 10-pixel visible handles; corners stack above sides.
  The Photo swap handle is inset 12 pixels from the left so the new top-left
  resize target does not cover its starting area.
- Direction-aware resizing preserves the opposite edge before applying minimum
  size and Bleed constraints. Existing Crop refitting and Text measurement are
  reused, including automatic growth anchors at 90 and 180 degrees.
- Snapping follows the moving edge, including mirrored equal-gap candidates for
  left/top resizing, and rejects candidates that constraints cannot reach.
- All 224 tests in the affected Slot, snapping, Album workspace and Layout
  workspace suites pass. Type-checking, lint and production build pass.
- Browser smoke tests used the real Layout workspace with in-memory Library
  ports: all eight Photo handles changed the expected dimensions, saved their
  geometry and undid in one step. Measured hit targets stayed 20 pixels at the
  minimum Slot size, with corners winning overlapping side targets. Upright
  and rotated Text resizing preserved opposite-edge and automatic reflow
  anchors with real text measurement.

## Earlier considerations reviewed

- Additional resize handles deferred in [006](006-photo-slots.md),
  [007](007-crop-and-fit.md), [013's addendum](013-addendum.md) and
  [014](014-slot-rotation.md) are resolved here. Their other open points remain
  separate.
- The editor-control sharing concern from [009](009-text-slots.md) is addressed
  for resize handles by one component and one geometry pipeline; the existing
  Text tools and text measurement are reused rather than duplicated.
- Keyboard nudging, broader editor extraction, warnings after changing Bleed,
  validator sharing and dense-Page profiling remain deferred: none is required
  for anchored handle resizing.
- Library scanning/caches, Photo identity, missing-font portability, export
  optimization and other unrelated earlier considerations remain outside scope.
- The Inbox was checked. No note is resolved by this change; additional
  placement snapping patterns remain in the Inbox, as agreed.

## Code review

- Standards and spec: no blocking findings after reviewing the implementation
  and exercising the resize, Crop, selection, undo and persistence paths.

## Future considerations (low priority)

- Native WebView2 smoke testing of handles, Crop panning, swapping and rotated
  text remains manual, as in 014 and 015. Browser and mocked-port workspace
  checks do not replace testing the packaged desktop app.
- The existing production bundle-size warning remains unrelated.
