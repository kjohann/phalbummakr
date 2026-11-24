# 052 - Smart placement of new Photos

Status: doing · Type: feature · Depends on: 006, 011, 013, 014

## What

Help the user build an arrangement incrementally in Album mode. When dragging
a Photo from the Photo pane onto empty Page space near an existing Photo Slot,
suggest a matching Slot size and position. Recognise a started row or column
and offer to extend it with the same spacing.

Smart placement changes only the incoming Slot. Existing Slots stay fixed,
and the incoming Photo keeps its proportions. This is not the Placement's
Fit mode, an automatic Layout, or a request to rearrange the Page.

Extends [006](006-photo-slots.md) and [013](013-slot-snapping.md), preserving
the upright-Photo behaviour in [014's addendum](014-addendum.md).
Design agreed through discussion; implementation authorised for this issue.

## Acceptance criteria

- [x] Assistance applies only to a new Photo dragged from the Photo pane onto
  empty Page space in Album mode. Moving/resizing existing Slots, Layout mode,
  and dropping onto a Photo Slot to place or replace its Photo are unchanged.
- [x] Beside one Photo Slot, a suggestion matches its visible height and aligns
  top/bottom edges. Above or below it, a suggestion matches its visible width
  and aligns left/right edges. The incoming Photo's proportions are preserved;
  it is not cropped or distorted to match both dimensions.
- [x] A diagonal approach selects the closer valid horizontal or vertical
  suggestion rather than forcing both dimensions to match.
- [x] Two or more aligned Photo Slots with matching heights and consistent
  gaps establish a row; matching widths establish a column. Row widths and
  column heights may differ because Photos can have different proportions.
- [x] Suggestions extend either end of a row/column and copy its established
  gap, including zero. With only one neighbour and no established pattern,
  the suggested gap is 3 mm in printed Page dimensions.
- [x] Pattern recognition tolerates discrepancies in alignment, matching
  dimensions and gaps of roughly 2 screen pixels at the current zoom.
- [x] Occupied and empty Photo Slots can establish suggestions. Quarter-turn
  rotation is respected through visible Slot dimensions. Use Slot boundaries,
  not the visible content bounds of a Crop or Fit Placement.
- [x] Text Slots do not establish suggestions. All Slots, including empty
  Slots and Text Slots, block suggestions that would overlap them; touching
  boundaries are allowed.
- [x] Suggestions stay within the outer Bleed boundary of the target Page.
  The Safe Zone remains guidance, not a hard restriction.
- [x] An invalid suggestion is suppressed rather than shrunk, cropped,
  rearranged or wrapped to make it fit. A valid alternative may still be
  offered; without one, normal manual placement remains available.
- [x] A suggestion activates when the pointer is within roughly 32 screen
  pixels of its proposed centre, independent of zoom.
- [x] Among eligible suggestions, an established row/column takes precedence
  over a single-neighbour match. Otherwise the closest proposed centre wins.
  Near-ties retain the current suggestion to avoid flicker.
- [x] During dragging, an outline shows the proposed Slot geometry. Dropping
  commits exactly that previewed geometry, without a post-drop size jump.
- [x] Holding Ctrl temporarily bypasses smart placement and restores normal
  Page-drop behaviour. Releasing it restores eligible assistance.
- [x] Existing Slots are never moved or resized. The incoming Photo's existing
  upright-placement behaviour is preserved. Each completed drop remains one
  undo step, with its geometry preserved through redo and save/reopen.
- [x] Focused geometry and interaction tests cover single-neighbour matching,
  mixed-proportion row/column extension at both ends, gaps and tolerances,
  rotated/empty anchors, blocked candidates, Bleed, zoom, candidate selection,
  preview/drop agreement, Ctrl bypass and unchanged replacement behaviour.
  Type-checking, lint and build pass.
- [ ] Native desktop drag/drop is smoke-tested for preview, modifier changes,
  drop agreement and replacement behaviour; any validation limitation is
  recorded explicitly.

## Scope decisions

- No insertion between existing Slots, wrapping, inferred whole grids,
  resizing the existing arrangement, or automatic cropping.
- Assistance is local to the target Page, not its Spread sibling.
- General centre-line snapping, mirrored edge distances, and broader snapping
  improvements for moving/resizing Slots remain separate.
- The related Album-mode note in [the Inbox](inbox.md) remains open. This issue
  captures only equal-spacing continuation when adding new Photos; documenting
  it does not resolve or implement that note.

## Feasibility and implementation starting points

The existing Page-drop creation path makes this feasible without changing the
Album model or introducing persistent row/column membership:

- [AlbumView](../src/ui/AlbumView.tsx) handles Photo drag-over, Page drops,
  existing-Slot replacement feedback, and transient snap guides.
- [Slot creation](../src/core/slots.ts) currently creates a Photo-proportion
  Slot centred on the drop point with its long side at 40% of the corresponding
  Page dimension, clamped to Bleed.
- [Slot snapping](../src/ui/slotSnapping.ts) already provides alignment,
  equal-gap candidates and guides for existing Slot moves/resizes. New-Slot
  size inference and a drag-over preview still need to be added.

These are investigation findings, not an implementation. Preserve the existing
normal-drop fallback and replacement path. Derive preview and committed
geometry from the same candidate calculation.

## Verification and review

- Automated geometry and workspace tests cover placement, protected drag data,
  modifier changes, replacement, undo/redo and serialized Album geometry.
  The full test suite, type-check, lint and production build pass.
- Standards and spec review identified independent aligned groups losing their
  spacing, and 3 mm suggestions appearing inside or instead of established
  rows. These were fixed and covered by regression tests.
- Native smoke testing is outstanding. The existing desktop window is open on
  a real Album; the app automatically reopens the last Album and writes to it.
  It was not safe to use that window for test drops. The available desktop drag
  automation also performs an atomic drag and cannot inspect the preview or
  change Ctrl during the gesture. Check preview, Ctrl, drop agreement and
  replacement in WebView2 with a disposable Album before marking this done.
- No Inbox notes were resolved: its broader Album-mode snapping request remains
  open as agreed.

## Earlier future considerations

- The native Photo drop, upright placement and replacement checks in 006, 007,
  014 and 015 remain open until the WebView2 check above is performed.
- Dense-Page snapping performance in 013 remains deferred; this feature has
  its own candidate search and does not change Slot move/resize snapping.
- The shared Rectangle and upright-Photo helpers from 006 are reused. Extracting
  further AlbumView gesture infrastructure or unifying the existing thumbnail
  state would be a broader refactor, so the 006, 009, 019 and 040 notes remain
  deferred. Export, Layout, sorting, cache, menus and other native checks are
  unrelated and remain deferred.

## Future considerations (low priority)

- Profile Smart placement on unusually dense Pages if those become common.
