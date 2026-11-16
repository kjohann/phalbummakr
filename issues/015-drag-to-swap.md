# 015 – Drag-to-swap Placements

Status: doing · Depends on: 006, 007

## What

Swap placed Photos by dragging between occupied Photo Slots.

## Acceptance criteria

- [ ] Dragging a placed Photo from one occupied Photo Slot onto another swaps the Photos and their Crop/Fit settings; the Slots and their geometry/orientation stay in place.
- [ ] Dropping a Photo from the Library or a folder onto an occupied Slot continues to replace the existing Photo.
- [ ] Replacing a placed Photo between Slots is available through an explicit Replace command.
- [ ] Dragging a placed Photo to an empty Photo Slot keeps the existing move behavior.
- [ ] When Slot shapes differ, refit Crops around their centers without stretching, preserving relative zoom and Fit where Photo edges permit.
- [ ] Keep Slot dragging separate via a Photo drag handle, and offer an explicit Replace action after a swap.
