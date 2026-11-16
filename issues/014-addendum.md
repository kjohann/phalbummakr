# 014 addendum - Upright Photos on placement

Status: done

Follow-up to [014 - Slot rotation](014-slot-rotation.md). The original rule
that newly placed content inherits Slot orientation made upright portrait
Photos appear sideways when dropped into previously rotated portrait Slots.
This addendum supersedes that rule for new and replacement Photos.

## Acceptance criteria

- [x] Newly placed and replacement Photos retain their original upright
  orientation, including EXIF orientation, regardless of previous Slot turns.
- [x] Placement preserves the Slot's Page-space position and dimensions.
- [x] Rotating an occupied Slot still rotates its current Photo with it.
- [x] Crop, Fit, resizing and panning use the newly placed Photo's upright
  orientation; saving and reopening preserves the corrected behavior.
- [x] Previously saved content and Text Slot rotation remain unchanged.

## Implementation and verification

- Root cause: `placePhoto` kept the previous Slot rotation and calculated Crop
  against its rotated local aspect. The renderer then turned the new Photo.
- A Photo Slot's turns already change its Page-space bounds. Placement now
  resets its content rotation to zero before calculating Crop, preserving those
  bounds. No new persisted field or migration is needed. Existing Albums retain
  their saved orientation until a Photo is placed or replaced; deliberately
  rotated content cannot be distinguished from unintended rotation on disk.
- The minimal reproduction is an empty Photo Slot, a quarter turn and a portrait
  Photo. `npm test -- src\core\slots.test.ts src\ui\AlbumWorkspace.test.tsx -t "upright"`
  initially failed both tests with `expected 90 to be +0`.
- All 76 Slot/workspace tests then passed. Coverage includes plain and
  EXIF-oriented portrait Photos, replacement after 90/180/270-degree turns,
  unchanged bounds, renderer rotation, resizing, horizontal Crop panning,
  Crop/Fit persistence and subsequent rotation of occupied Slots.
- Production build (including typecheck) and lint passed. The existing
  large-chunk build warning remains.

## Review

- Direct code and test review found no blocking findings. Rotation is reset only
  at new/replacement Photo placement, not during loading, Slot rotation, text
  editing or Crop/Fit changes. The renderer and interaction paths already use
  the updated Slot rotation consistently.
- [README](../README.md#photo-slots-crop-and-usage) documents the changed behavior;
  the completed original issue's acceptance criteria remain historical.

## Earlier considerations reviewed

- **002-004:** Library messaging, marker/port factoring, thumbnail pruning and
  external-edit detection remain unrelated to placement orientation.
- **005-007 and 013:** Native WebView2 gesture checks remain manual. Bleed
  clamping, additional handles/nudging, validator/rectangle factoring, shared
  EXIF rules, preview transport/cache cleanup and dense-Page profiling remain
  deferred: this fix changes none of those mechanisms.
- **008-009:** Filesystem-aware Photo identity, bundle splitting, missing-font
  warnings and native text-control checks remain separate work.
- **014:** Crop direction and renderer orientation are verified by the new
  workspace regression; native rotation/text checks remain deferred. Toolbar
  wrapping is unchanged. Layout orientation/content-transfer tests still belong
  to unimplemented [010](010-layouts.md); its implementation should distinguish
  existing-content transfer from new Library Photo placement.

## Future considerations (low priority)

- Confirm upright placement/replacement and subsequent rotation in the native
  WebView2 app. Automated core/workspace checks do not substitute for a native
  smoke test.
