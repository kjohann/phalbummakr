# 007 – Crop and Fit

Status: todo · Depends on: 006

## What

Let the user choose which part of a Photo is visible in its Photo Slot.

## Acceptance criteria

- [ ] Panning and zooming a Placement adjusts its Crop. The Photo always covers the whole Slot and can't be zoomed out past the edges.
- [ ] A "Fit" toggle shows the whole Photo inside the Slot, with white where the aspect ratios differ.
- [ ] The Crop is stored independently of preview resolution, so the editor (preview) and the export (original) give the same framing.
- [ ] The Crop and Fit maths live in the domain core, with unit tests covering portrait and landscape Photos in portrait and landscape Slots.
