# 019 – Slot toolbar and menus

Status: done · Depends on: 018

## What

Move Slot actions next to the selected Slot and remove the toolbar row above the Spreads, so the Spreads get more vertical space.

## Acceptance criteria

### Slot toolbar

- [x] A selected Photo Slot shows a small toolbar attached to it, like today's Text Slot controls, with: Fit toggle, Zoom out, Zoom in, Rotate left, Rotate right and Delete. Zoom out and Zoom in are hidden while Fit is on.
- [x] A selected Text Slot's toolbar keeps today's font controls and adds Rotate left, Rotate right and Delete.
- [x] Zoom out and Zoom in change the Crop in steps of about 10%.
- [x] Mouse-wheel zoom on a Photo is removed. The wheel scrolls as usual.

### Crop handle

- [x] A selected Photo Slot with a Placement and Fit off shows a ✥ handle in its centre, the same size on screen at any zoom level.
- [x] Dragging the handle pans the Photo inside the Slot. Panning ends when the drag ends.
- [x] Dragging anywhere else on the Slot moves the Slot.
- [x] Turning Fit on hides the handle.
- [x] The "Crop photo" checkbox is removed. Placing a Photo keeps Fit off, as today.

### Deleting Slots

- [x] Delete in the toolbar, the right-click menu and the Delete key delete the selected Slot.
- [x] Before deleting, the app asks "Delete Slot?" with a "Never ask again" checkbox.
- [x] Preferences gains a "Confirm Slot deletion" checkbox, cleared by "Never ask again" and stored in `settings.json`.

### Adding Slots

- [x] The Add Photo Slot and Add Text Slot buttons are removed from the toolbar row.
- [x] A small palette floating in a corner of the editor adds a Photo Slot or a Text Slot to the selected Page.
- [x] Right-clicking an empty part of a Page shows Add Photo Slot and Add Text Slot, which place the new Slot where you clicked.

### Right-click on a Slot

- [x] Right-clicking a Slot selects it and shows the same actions as its toolbar: Fit (Photo Slots), Rotate left, Rotate right and Delete.

### Menus

- [x] The toolbar row above the Spreads is removed.
- [x] A native Edit menu has Delete, acting on the selected Slot.
- [x] A native Album menu has Album Settings… and Add Spread. The in-page Album settings button is removed.

## Notes

- The Photo Slot toolbar shows Fit, Zoom out and Zoom in only when the Slot has a
  Placement; an empty Photo Slot offers Rotate left, Rotate right and Delete. The
  right-click menu follows the same rule.
- Edit › Delete has no keyboard accelerator: on Windows a native accelerator
  would take the Delete key from text fields. The webview handles Delete for the
  selected Slot instead, ignoring inputs and open dialogs. Backspace still deletes
  only a focused Slot, as before.
- Native menu commands reach the open Album as a numbered `AlbumCommand`.
  Edit › Delete is enabled only while a Slot is selected; the Album menu only
  while an Album is open and idle.
- Album settings is now a modal dialog opened from Album › Album Settings…, and
  validation errors are shown inside it.
- Removing the toolbar row also removed the Page dropdown; the Page strip and
  the canvas select Pages.
- The crop handle uses the Slot overlay's size to convert drags to Crop
  movement, as the previous Crop mode did.

## Earlier considerations reviewed

- 014's toolbar-wrapping canvas shift is resolved: the toolbar row is gone and
  Slot controls float next to the Slot.
- 016's deferred "toolbar redesign" is addressed by this issue.
- 007's wheel-zoom smoke check is obsolete: wheel zoom was removed.
- 009's "extract editor controls" is partly addressed: Slot toolbar positioning
  and actions moved to `SlotToolbar.tsx`; `AlbumView` still owns gestures, menus
  and dialogs.
- Native WebView2 smoke checks (005–018), cache pruning and rendition transport
  (003/006), external edits (004), Slot bounds/handles/helpers (006), Photo
  identity casing (008), missing fonts (009), dense-Page profiling (013), Layout
  orientation (014/010) and bundle splitting (008) remain deferred: this issue
  does not change those concerns.

## Future considerations (low priority)

- Smoke-test the Slot toolbar, crop handle, context menus, Delete key and the
  native Edit and Album menus in the integrated WebView2 app.
- The floating palette sits in the editor's bottom-right corner and can cover
  the corner of a right-hand Page in short windows.
- Code review (Standards) judgement calls:
  - Slot and Spread deletion confirmations duplicate their confirm logic and
    dialog; consider a shared confirm-deletion helper.
  - `startCropPan` and `startSlotDrag` repeat window listener setup/teardown.
  - Slot lookups (`pages.find(...).slots.find(...)`) recur; consider a core
    helper.
  - Deletion preferences travel as four props through each layer; consider a
    preferences object, or a generic preference command in Rust.
  - `AlbumView.tsx` keeps growing (gestures, menus, dialogs, commands); consider
    splitting further when touching it again.
