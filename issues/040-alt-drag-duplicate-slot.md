# 040 - Alt-drag to duplicate a Slot

Status: todo · Type: feature · Depends on: 006, 009, 010, 011, 013, 014

## What

Promoted from the Editing backlog. Alt-drag duplicates a Slot in Album mode
and Layout mode. Ctrl replaces Alt as the temporary snapping bypass.
Designed alongside [042 - Copy Photos to a Folder](042-copy-photos-to-folder.md),
but independent of file copying and content-aware Usage.

## Acceptance criteria

- [ ] Alt held when a Slot drag starts chooses duplication for the whole
  gesture. Pressing or releasing Alt later does not change that choice.
- [ ] Photo Slots, including empty ones, and Text Slots can be duplicated.
  Preserve size, Slot rotation, Photo reference, Crop/Fit, text formatting
  and Placeholder text as applicable. No Photo file is copied.
- [ ] The original stays visibly unchanged while a full duplicate preview
  follows the pointer. The duplicate uses the normal movement constraints
  and snap guides, without treating the preview as its own snap target.
- [ ] Ctrl bypasses snapping during both Slot movement and resizing, including
  when pressed or released mid-gesture. Alt+Ctrl duplicates without snapping.
  Alt alone during resizing neither duplicates nor bypasses snapping.
- [ ] Bleed bounds and minimum-size constraints remain enforced. Duplication
  stays on the source Page; cross-gutter dragging and existing Slot/content
  drag distinctions are unchanged.
- [ ] A successful drop selects the duplicate and places it above the
  original in stacking order. In Album mode this is one undoable edit;
  undo removes only the duplicate and redo restores it.
- [ ] Clicking without dragging creates nothing. Escape, loss of focus or
  an interrupted drag discards the preview without changing the Album or
  creating an undo step.
- [ ] Duplicating a populated Photo Slot increases Usage without the ordinary
  already-used warning. Slot rotation and Crop/Fit do not change Photo
  identity. Ordinary Photo-drop warnings remain unchanged.
- [ ] Update gesture hints and directly related documentation to distinguish
  Alt duplication from Ctrl free placement.
- [ ] Focused tests cover both Slot types, empty Slots, preserved content,
  modifier changes, snapping, cancellation and undo/redo. Verify actual
  Alt/Ctrl gestures in the native WebView2 app.

## Scope boundaries

No multi-Slot selection, new resize handles, Slot-duplicate menu command,
cross-Page dragging or redesign of ordinary duplicate-placement warnings.
The backlog items for those changes remain deferred. This changes the modifier
described in [013](013-slot-snapping.md), without changing its completed
acceptance criteria.
