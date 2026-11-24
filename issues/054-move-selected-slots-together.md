# 054 – Move Selected Slots together

Status: done · Type: feature · Depends on: 011, 013, 019, 024, 040, 051

## What

Select several Slots on a Page with Ctrl-click, as with the Comparison in Sort
mode, and move them together as one unit, keeping their spacing exactly. Also
snap to the horizontal and vertical centre of the Page, which helps centre a
whole arrangement.

Promotes the backlog item "Move several Slots together" and sorts the inbox
note "Ctrl to mark several slots and move them togheter, preserving spacing and
such".

## Acceptance criteria

- [x] In Album mode, Ctrl-click (Cmd-click) adds a Slot to the Selected Slots
  or removes it. Ctrl-clicking the last Selected Slot leaves none selected.
  Ctrl+Space does the same for a focused Slot.
- [x] A plain click selects only that Slot. Clicking an empty part of a Page
  clears the Selected Slots.
- [x] Selected Slots are always on one Page. Ctrl-clicking a Slot on the other
  Page of the Spread starts a new selection there and makes it the Selected
  Page.
- [x] A plain drag of any Selected Slot moves all of them as one rigid unit.
  Ctrl-pressing an unselected Slot adds it and drags the selection with
  snapping off. Holding Ctrl during the drag still turns snapping off.
- [x] The move stops for the whole group at the first Bleed limit any Selected
  Slot reaches, so the spacing never changes. One drag is one undo step.
- [x] The group snaps by its outer bounds to Page edges, the Page centre, the
  Safe Zone, unselected Slots and equal gaps between unselected Slots.
- [x] Page-centre guides (horizontal and vertical middle of the Page) apply to
  every Slot move and resize in Album and Layout mode. When another guide is
  equally close, that guide wins, and lines at the same position are shown
  once.
- [x] Delete removes every Selected Slot as one undo step.
- [x] With more than one Slot selected, resize handles, the Slot tools in the
  command bar, rotate, Crop zoom and pan, Copy and Alt-drag duplicate are
  unavailable. Alt-dragging a Selected Slot duplicates just that Slot.
- [x] Every Selected Slot gets the normal selected outline; no box is drawn
  around the group.
- [x] With more than one Slot selected, the Selected Slots show no Photo drag
  handle ("Drag to swap"). Unselected Slots keep theirs, and a single Selected
  Slot shows it as before.
- [x] After undo or redo, Slots that still exist stay selected, and others
  drop out of the selection.
- [x] Focused tests cover toggling, group move, snapping to the Page centre,
  Bleed limits, undo, clearing and group Delete.
- [x] Check Ctrl-click, group drag and Page-centre guides in the native app.

## Scope boundaries

No Selected Slots in Layout mode, no selecting across Pages, no Ctrl+A or
drag-to-select region, and no group copy/paste, duplicate, rotate, resize or
z-order. These are in the [backlog](backlog.md) or the [inbox](inbox.md).
A right-click on a Slot still selects only that Slot.

## Decisions

Agreed while sorting the inbox note:

- Ctrl-click matches the Comparison in Sort mode. Ctrl during a drag keeps its
  existing meaning of turning off snapping.
- Selecting Slots never creates a lasting grouping; see **Selected Slots** in
  the [glossary](../GLOSSARY.md).
- Page-centre snapping was asked for with this feature. It lives in the shared
  snapping code, so it applies to single Slots and Layout mode as well, rather
  than being a group-only special case.

## Implementation

- [moveSlots](../src/core/slots.ts) and `deleteSlots` work on several Slots of a
  Page. `moveSlots` limits one shared offset by every Slot's own Bleed limit.
- [applySlotDrag](../src/ui/pageCanvas.tsx) moves a group through
  `applyGroupDrag`, which snaps the group's outer bounds with the existing
  [snapSlot](../src/ui/slotSnapping.ts).
- [AlbumView](../src/ui/AlbumView.tsx) keeps a list of Selected Slot IDs. The
  single-Slot `selectedSlot` exists only when exactly one Slot is selected,
  which hides the single-Slot tools for a group. A short-lived press record
  lets the click after a mouse press know whether it was a drag or had already
  added the Slot.

## Earlier follow-ups and inbox

- The backlog item "Move several Slots together" is promoted to this issue.
- The inbox snapping note's request to align with the middle of a Page is
  resolved by the Page-centre guides. Its matching-distance and grid help stay
  in the inbox and backlog ("Snap to matching distances").
- [052](052-smart-photo-placement.md) deferred "general centre-line snapping";
  Page-centre guides now cover centring on the Page. Mirrored edge distances
  remain separate.
- Dense-Page snapping performance in [013](013-slot-snapping.md) remains
  deferred: the group adds only one bounds rectangle and two guide positions.
- Native gesture checks in 006, 007, 013, 014 and 015 remain deferred, along
  with the native check of this issue.

## Code review

- Fixed: equal-gap snapping for a group that is not a rectangle could line up
  with a gap measured from a bounds edge where no Selected Slot sits at that
  height, a gap that does not exist. `snapSlot` now takes the Selected Slots as
  `members` and accepts an equal gap only next to a Selected Slot that
  actually borders it.

## Future considerations (low priority)

- Group snapping uses only the outer bounds and equal gaps a Selected Slot
  borders. Snapping an inner Selected Slot's edge to an unselected Slot is not
  supported.
- Group drags re-measure the bounds after the Bleed clamp on each mouse move.
  This is fine for the few Slots on a Page, but it would need a look if Pages
  ever hold many Slots (see the dense-Page note in [013](013-slot-snapping.md)).
