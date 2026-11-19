# 021 – Move a Slot between Pages in a Spread

Status: closed · Depends on: 013, 014, 015, 017

## Close reason

Closed without implementation to keep the MVP focused. Moving Slots between the
Pages of a Spread is not needed for the MVP; a Slot stays on its own Page and
Placements still move between Pages by drag-to-swap ([015](015-drag-to-swap.md)).
The scope moved to the [backlog](backlog.md#editing) as "Move a Slot between
Pages in a Spread". If it is picked up after the MVP, create a new issue that
follows this one and reuse the acceptance criteria below.

## What

Drag a Slot from one Page to the facing Page of the open Spread. Today a Slot
is clamped to its own Page; only Placements can move between Pages, by
drag-to-swap (015).

## Acceptance criteria

- [ ] Dragging a Photo Slot or Text Slot across the gutter moves it to the facing Page of the same Spread, keeping its size, rotation, Placement, Crop/Fit and text.
- [ ] The Slot follows the pointer across the gutter during the drag. The target Page is the one under the pointer when the drag ends.
- [ ] On the target Page the Slot is clamped to that Page and snaps to its Slots and guides, as within a Page (013).
- [ ] The moved Slot stays selected and goes on top of the target Page's Slots.
- [ ] Single-Page Spreads, such as the Inside Covers (017), keep the current behaviour: the Slot cannot leave the Page.
- [ ] Moving to a Page outside the open Spread is out of scope.
- [ ] Drag-to-swap of Placements (015) and Library Photo drops are unchanged.
- [ ] A move between Pages is one Album change, so it autosaves once and later becomes one undo step (011).
