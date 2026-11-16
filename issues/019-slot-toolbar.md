# 019 – Slot toolbar and menus

Status: todo · Depends on: 018

## What

Move Slot actions next to the selected Slot and remove the toolbar row above the Spreads, so the Spreads get more vertical space.

## Acceptance criteria

### Slot toolbar

- [ ] A selected Photo Slot shows a small toolbar attached to it, like today's Text Slot controls, with: Fit toggle, Zoom out, Zoom in, Rotate left, Rotate right and Delete. Zoom out and Zoom in are hidden while Fit is on.
- [ ] A selected Text Slot's toolbar keeps today's font controls and adds Rotate left, Rotate right and Delete.
- [ ] Zoom out and Zoom in change the Crop in steps of about 10%.
- [ ] Mouse-wheel zoom on a Photo is removed. The wheel scrolls as usual.

### Crop handle

- [ ] A selected Photo Slot with a Placement and Fit off shows a ✥ handle in its centre, the same size on screen at any zoom level.
- [ ] Dragging the handle pans the Photo inside the Slot. Panning ends when the drag ends.
- [ ] Dragging anywhere else on the Slot moves the Slot.
- [ ] Turning Fit on hides the handle.
- [ ] The "Crop photo" checkbox is removed. Placing a Photo keeps Fit off, as today.

### Deleting Slots

- [ ] Delete in the toolbar, the right-click menu and the Delete key delete the selected Slot.
- [ ] Before deleting, the app asks "Delete Slot?" with a "Never ask again" checkbox.
- [ ] Preferences gains a "Confirm Slot deletion" checkbox, cleared by "Never ask again" and stored in `settings.json`.

### Adding Slots

- [ ] The Add Photo Slot and Add Text Slot buttons are removed from the toolbar row.
- [ ] A small palette floating in a corner of the editor adds a Photo Slot or a Text Slot to the selected Page.
- [ ] Right-clicking an empty part of a Page shows Add Photo Slot and Add Text Slot, which place the new Slot where you clicked.

### Right-click on a Slot

- [ ] Right-clicking a Slot selects it and shows the same actions as its toolbar: Fit (Photo Slots), Rotate left, Rotate right and Delete.

### Menus

- [ ] The toolbar row above the Spreads is removed.
- [ ] A native Edit menu has Delete, acting on the selected Slot.
- [ ] A native Album menu has Album Settings… and Add Spread. The in-page Album settings button is removed.
