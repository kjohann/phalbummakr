# 040 - Alt-drag to duplicate a Slot

Status: done · Type: feature · Depends on: 006, 009, 010, 011, 013, 014

## What

Promoted from the Editing backlog. Alt-drag duplicates a Slot in Album mode
and Layout mode. Ctrl replaces Alt as the temporary snapping bypass.
Designed alongside [042 - Copy Photos to a Folder](042-copy-photos-to-folder.md),
but independent of file copying and content-aware Usage.

## Acceptance criteria

- [x] Alt held when a Slot drag starts chooses duplication for the whole
  gesture. Pressing or releasing Alt later does not change that choice.
- [x] Photo Slots, including empty ones, and Text Slots can be duplicated.
  Preserve size, Slot rotation, Photo reference, Crop/Fit, text formatting
  and Placeholder text as applicable. No Photo file is copied.
- [x] The original stays visibly unchanged while a full duplicate preview
  follows the pointer. The duplicate uses the normal movement constraints
  and snap guides, without treating the preview as its own snap target.
- [x] Ctrl bypasses snapping during both Slot movement and resizing, including
  when pressed or released mid-gesture. Alt+Ctrl duplicates without snapping.
  Alt alone during resizing neither duplicates nor bypasses snapping.
- [x] Bleed bounds and minimum-size constraints remain enforced. Duplication
  stays on the source Page; cross-gutter dragging and existing Slot/content
  drag distinctions are unchanged.
- [x] A successful drop selects the duplicate and places it above the
  original in stacking order. In Album mode this is one undoable edit;
  undo removes only the duplicate and redo restores it.
- [x] Clicking without dragging creates nothing. Escape, loss of focus or
  an interrupted drag discards the preview without changing the Album or
  creating an undo step.
- [x] Duplicating a populated Photo Slot increases Usage without the ordinary
  already-used warning. Slot rotation and Crop/Fit do not change Photo
  identity. Ordinary Photo-drop warnings remain unchanged.
- [x] Update gesture hints and directly related documentation to distinguish
  Alt duplication from Ctrl free placement.
- [x] Focused tests cover both Slot types, empty Slots, preserved content,
  modifier changes, snapping, cancellation and undo/redo.
- [x] Verify actual Alt/Ctrl gestures in the native WebView2 app.

## Scope boundaries

No multi-Slot selection, new resize handles, Slot-duplicate menu command,
cross-Page dragging or redesign of ordinary duplicate-placement warnings.
The backlog items for those changes remain deferred. This changes the modifier
described in [013](013-slot-snapping.md), without changing its completed
acceptance criteria.

## Implementation

- `duplicateSlot` makes an independent content copy at the top of the source
  Page's stacking order. `applySlotDrag` uses the existing movement, text fitting,
  Bleed and snapping rules, with the original available as a snap target.
- Both modes latch Alt at movement start; Ctrl remains live during movement and
  resizing. Duplicate previews are local until release. Escape, focus loss,
  pointer cancellation and hiding the mode discard them.
- Photo previews share the original's currently visible image, including its
  thumbnail while loading, and adopt the full Photo when the original loads.
  Ordinary Photo placement warnings and file operations are unchanged.

## Review

### Standards

No documented-standard violations. Two non-blocking heuristic findings remain:
duplicated gesture listener setup in the two workspaces, and duplicate-ID
discovery through the appended Slot (with an extra geometry calculation).

### Spec

One preview finding was resolved: initially only ready primary previews were
shared. A workspace regression now covers sharing the thumbnail and adopting
the primary image during the gesture, without waiting for a second image load.
The user verified all six native checklist steps below on 2026-11-21 and
approved committing this issue and continuing.

## Automated verification

- `npm test`: 351 tests passed across 22 files after the review fix.
- `npm run typecheck` and `npm run lint`: passed.
- `npm run tauri build -- --no-bundle`: passed; the release executable includes
  the reviewed changes. Existing bundle-size and macOS identifier warnings
  remain unrelated.
- A full-suite regression caught cancellation of an ordinary Slot drag when
  an earlier Crop save started. Cancellation on disabled state is now restricted
  to duplicates, preserving the existing serialized-save behavior.

## Earlier follow-ups and inbox

Reviewed earlier low-priority considerations. Native Slot gesture checks from
013 and 010 are relevant and were verified in the manual check below. Dense-Page
snapping performance (013), broader editor extraction (009/010), existing
preview/cache pruning (006 addendum), and history consolidation (011) stay
deferred: none is required to duplicate a single Slot correctly.

No inbox notes are resolved by this change.

## Native verification

The desktop automation API cannot hold/release modifier keys during a drag.
The user chose to pause after each issue for manual native verification, and
reported that all the checks below passed.

Use the newly built `../src-tauri/target/release/phalbummakr.exe`, not an older
Desktop copy. Prefer a test Album:

1. In Album mode, Alt-drag a populated/rotated Photo Slot, an empty Photo Slot
   and a Text Slot. Check the stationary original, complete preview, selected
   duplicate, preserved content and same-Page Bleed bounds.
2. Start with Alt and release it mid-drag: still duplicate. Start without Alt
   and press it mid-drag: still move.
3. During movement/duplication and resizing, press/release Ctrl: guides disappear
   and return. Alt+Ctrl duplicates freely; Alt resizing still snaps.
4. Cancel duplicates with Escape and by switching focus. Click without movement.
   Check that no duplicate or undo step remains.
5. Undo/redo a completed Album duplicate. Check increased Usage without a
   warning; an ordinary repeated Photo drop must still warn.
6. Repeat movement/duplication, Ctrl snapping, cancellation and selected-copy
   checks in Layout mode, including a rotated Text Slot with Placeholder text.

## Future considerations (low priority)

- Sharing the two workspaces' gesture listener lifecycle would reduce repeated
  wiring; this is a focused follow-up, not a prerequisite for verified behavior.
- Returning the affected Slot ID from the drag result could replace the
  append-position lookup and extra result calculation used for selection.
