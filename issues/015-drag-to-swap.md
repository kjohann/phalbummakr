# 015 – Drag-to-swap Placements

Status: done · Depends on: 006, 007

## What

Swap placed Photos by dragging between occupied Photo Slots.

## Acceptance criteria

- [x] Dragging a placed Photo from one occupied Photo Slot onto another swaps the Photos and their Crop/Fit settings; the Slots and their geometry/orientation stay in place.
- [x] Dropping a Photo from the Library or a folder onto an occupied Slot continues to replace the existing Photo.
- [x] Replacing a placed Photo between Slots is available through an explicit Replace command.
- [x] Dragging a placed Photo to an empty Photo Slot keeps the existing move behavior.
- [x] When Slot shapes differ, refit Crops around their centers without stretching, preserving relative zoom and Fit where Photo edges permit.
- [x] Keep Slot dragging separate via a Photo drag handle, and offer an explicit Replace action after a swap.

## Implementation and verification

- The Photo drag handle moves a Placement to an empty Slot or swaps Placements
  between occupied Slots. Replace instead removes the displaced Placement after
  a swap. Library Photo drops still use their existing replacement behavior.
- Crop refitting shares the resize logic, preserving the Crop center and relative
  zoom where possible; Fit and Slot geometry/rotation remain independent.
- Core tests cover cross-Page swaps, rotated Slot geometry, Crop refitting and
  persistence. Workspace tests cover swapping, replacement, empty and self
  drops, pending Crops, and a drag spanning an autosave.
- Verification: all 127 frontend tests pass; the production build, typecheck
  and lint pass. The existing large-bundle warning remains.

## Earlier considerations reviewed

- **006/007/014 and addenda:** native WebView2 gestures and Photo drops remain
  unverified; this interaction also needs a native smoke test. Slot resizing
  handles, Bleed validation, shared validation/orientation helpers and upright
  Library placement are unchanged.
- **006 addendum:** thumbnail and preview status maps remain separate. Swaps
  transfer the existing thumbnail entries; the preview lifecycle is otherwise
  unchanged, so a broader state redesign and cache optimizations remain deferred.
- **009:** extracting editor controls remains deferred; this adds one small
  drag handle and a post-swap command, not a general controls redesign.
- **014:** narrow-window toolbar layout and Layout transfer are unrelated and
  remain deferred.
- **002–005, 008, 009 addendum and 013/addendum:** Library restoration and
  caching, external edits, filesystem-aware Usage, bundle size, fonts, text controls,
  snapping performance and other native checks remain outside this change.

## Review

- Standards: no documented-standard violations found. Separate thumbnail and
  preview maps remain an existing, deferred design consideration.
- Spec: review found that an autosave could unmount the active Photo drag
  handle. The handle now stays mounted for that gesture, with a regression test.

## Future considerations (low priority)

- Check real Photo drags, cross-Page swaps and Replace instead in the integrated
  WebView2 app; workspace tests simulate HTML drag events.
