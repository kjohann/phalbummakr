# 014 – Slot rotation

Status: done · Depends on: 006, 009

## What

Rotate a Slot together with the content it holds.

## Acceptance criteria

- [x] Photo Slots and Text Slots can be rotated in 90° turns in either direction.
- [x] Rotating a Slot rotates its content with it. For Text Slots, the text rotates with the Slot; vertical text with normally oriented letters can be made with a narrow, tall Text Slot.
- [x] Rotation preserves the Slot's center and swaps its page-space width and height. Rotation does not automatically clamp the Slot to the Bleed.
- [x] Slot orientation belongs to the Slot, not its content. A photo in a Slot is oriented by that Slot.
- [ ] Saving and applying a Layout preserves each Slot's orientation. When existing content is transferred into a rotated Slot, it follows the Slot's orientation. Deferred to [010](010-layouts.md), which implements Layouts; the Slot model now persists orientation independently of content.

## Implementation and verification

- Slot geometry remains in Page-space fractions. Quarter turns swap physical
  dimensions around the centre; legacy Slots without an orientation remain upright.
- Photo Crop and Fit use the Slot's local orientation, including panning and
  replacement. Text measurement, editing, width resizing and snapping follow
  the rotated Slot; the toolbar can move beside a tall Slot.
- The Album/Slot and workspace test seams cover geometry, persistence,
  backwards compatibility, resizing, text reflow and Crop panning. All 118
  frontend tests passed, as did typecheck, lint and the production build.
- Browser checks used an in-memory Album and synthetic Photo to verify rotated
  content, text editing and editor bounds at 90 and 270 degrees. Layout
  transfer cannot yet be tested because issue 010 has not been implemented.

## Review

- Standards and spec were reviewed against the current changes; no remaining
  blocking findings in the implemented rotation scope.
- The Layout criterion remains open for issue 010 rather than claiming that
  an unavailable feature has been verified.

## Earlier considerations reviewed

- **002-004:** Library messaging, cache pruning and external-edit detection
  do not affect Slot orientation.
- **005-007 and 013:** native WebView2 gesture checks remain manual. Additional
  resize handles, keyboard nudging, validator factoring, Photo EXIF duplication,
  preview cache/transport and dense-Page profiling remain separate work.
  Slots may still extend beyond changed Bleed settings by design.
- **008:** filesystem-aware Photo identity and bundle splitting remain
  deferred; the build still reports the existing large-chunk warning.
- **009:** missing-font warnings remain deferred to portability/export work;
  text controls are already extracted. This change keeps their positioning
  usable for tall rotated Slots.

## Future considerations (low priority)

- Check rotation, Crop panning, rotated text editing and handles in the native
  WebView2 app; browser checks do not replace a native smoke test.
- On narrow windows, selecting a filled Photo Slot changes the Page toolbar's
  wrapping and can shift the canvas before a double-click on another Slot.
  A broader toolbar layout redesign remains deferred.
- Issue 010 must test Layout orientation and content transfer end to end.
