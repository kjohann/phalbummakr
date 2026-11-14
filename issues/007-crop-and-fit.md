# 007 – Crop and Fit

Status: done · Depends on: 006

## What

Let the user choose which part of a Photo is visible in its Photo Slot.

## Acceptance criteria

- [x] Panning and zooming a Placement adjusts its Crop. The Photo always covers the whole Slot and can't be zoomed out past the edges.
- [x] A "Fit" toggle shows the whole Photo inside the Slot, with white where the aspect ratios differ.
- [x] The Crop is stored independently of preview resolution, so the editor (preview) and the export (original) give the same framing.
- [x] The Crop and Fit maths live in the domain core, with unit tests covering portrait and landscape Photos in portrait and landscape Slots.

## Implementation and verification

- **Domain** (`src/core/slots.ts`): Crop panning and zooming use fractions of
	the upright Photo. Zoom cannot go below the cover crop, and pan clamps at the
	Photo edges. Fit uses the full Photo and computes centered contain bounds in
	the Slot. The shared `Rectangle` type represents both Crop and Slot-relative
	Fit bounds.
- **Saved Album:** Placements now store `fit`; schemaVersion remains 1. Loading
	accepts the earlier Placement shape and normalizes its missing Fit value to
	`false`. A unit test loads and resaves an old-style Album.
- **Editor:** Crop mode drag pans locally and commits once on release. Wheel
	zoom is accumulated locally and committed after the wheel gesture; Zoom in
	and Zoom out commands are also available. Fit displays the upright preview
	within a white Slot, without using preview-resolution dimensions in saved
	Crop data. Slot move and resize behavior and photo drop handlers are unchanged.
- **Verification:** `npm test`, `npm run lint`, and `npm run build`.

## Manual check (not run)

1. In the app, place landscape and portrait Photos in both a wide Slot and a
	 tall Slot. Verify each Placement covers the Slot initially.
2. Select Crop photo, drag to pan, and use the mouse wheel and Zoom in/out
	 commands. Verify the Photo never exposes blank edges, the Album is not saved
	 during a pan, and one save occurs at release. Save, reopen, and check framing.
3. Turn on Fit. Verify the whole Photo is visible with white bars where needed.
	 Turn Fit off and verify the previous Crop returns; save and reopen once more.
4. Repeat the drag and wheel gestures in the native WebView2 app to check real
	 mouse event behavior.

## Earlier considerations reviewed

- **002:** remembered-Library messaging, marker-name duplication and port size
	are unrelated; still deferred.
- **003:** on-disk thumbnail and preview pruning is unrelated; still deferred.
- **004:** detecting external edits before autosave is unrelated; still deferred.
- **005:** native WebView2 mouse-drag behavior remains to be checked by hand
	using the list above.
- **006:** the shared rectangle type is now used by Crop and Fit geometry.
	Bleed validation and resize-handle improvements are unrelated. `exactRecord`
	sharing would add a cross-module validation abstraction, and the duplicated
	TypeScript/Rust orientation rule is unchanged; both remain deferred.
- **006 addendum:** cached-rendition validation cost, base64 transport, preview
	state-map consolidation and LRU extraction are unaffected by Crop and Fit;
	remain deferred.

## Review

No blocking findings. Native WebView2 gesture behavior remains the manual check
above.

## Future considerations (low priority)

- Confirm wheel zoom and pan gestures in the integrated WebView2 app; the
	automated workspace test covers local pan commits and the Zoom commands.
