# 013 addendum - All aligned snap guides

Status: done

Additional requirements for [013 - Slot snapping](013-slot-snapping.md).

## Acceptance criteria

- [x] While snapping, show every coincident edge and center alignment on both
  axes, not just the target selected to position the Slot.
- [x] Equal-height Slots aligned at the top also show their matching bottom
  edges; equal-width Slots aligned at the left also show their matching right
  edges.
- [x] Guides describe the final geometry after constraints and Text Slot reflow,
  without duplicate lines or guides for merely nearby, unaligned edges.
- [x] Preserve snap positions, equal-gap markers, Alt bypass and transient guides.

## Implementation and verification

- Snap target selection is unchanged. After snapping, the final Rectangle is
  checked against Page, Safe Zone and Slot targets on both axes. Every matching
  edge or center gets a guide, including fixed resize edges and fitted Text Slot
  height. Nearby targets that do not actually align are not shown.
- Coincident alignment lines are deduplicated; each SVG guide has a distinct
  key. Equal-gap markers remain alongside the additional alignment lines.
- Geometry regressions cover equal-height Slots, duplicate and nearby targets,
  both axes after width resizing and Text Slot reflow, and existing equal gaps.
  A workspace regression checks actual SVG line positions, Alt hide/restore,
  release cleanup and the saved Slot position.
- Verification passed: 110 frontend tests, lint, typecheck and production build.
  The pre-existing Vite chunk-size warning remains.

## Review

- **Standards:** no findings. Target generation is shared with snapping rather
  than duplicated; the existing Rectangle and guide types are retained.
- **Spec:** no findings. Additional guides describe final geometry without
  changing snapping positions, gap detection or modifier-key behavior.

## Earlier considerations reviewed

- Library startup, thumbnail caches, external edits, preview transport, Photo
  identity and bundle splitting remain unrelated to this visual-only addition.
- Additional resize handles, keyboard nudging, Bleed warnings, validator sharing
  and Photo orientation remain outside scope; the shared Rectangle is reused.
- Text controls stay attached and unchanged; missing-font warnings are unrelated.
  Further editor extraction is unnecessary for this small geometry/render change.

## Future considerations (low priority)

- The native WebView2 checks from earlier issues, including
  [013](013-slot-snapping.md#future-considerations-low-priority), remain deferred:
  verification here uses automated geometry and workspace/SVG tests.
- Dense-Page profiling from 013 remains deferred. Equal-gap pair scanning is
  unchanged; this addition does not address that broader performance work.
