# 050 - Copy and paste Slots in Album mode

Status: todo · Type: feature · Depends on: 011, 018, 019, 030, 040, 041

## What

Copy a Slot and paste independent copies onto Pages in the same Album,
including across Spreads. This extends the single-Page duplication behavior in
[040 - Alt-drag to duplicate a Slot](040-alt-drag-duplicate-slot.md).

## Acceptance criteria

- [ ] Copy one selected Photo or Text Slot, including an empty Slot, with
  Ctrl/Cmd+C or the Slot's right-click menu. Capture a snapshot: later edits
  to, or deletion of, the original Slot do not change the copy.
- [ ] Preserve the Slot's size, rotation and content, including Photo
  reference, Crop/Fit, text, formatting and Placeholder text as applicable.
  Each pasted Slot is independent and has its own identity. Do not copy a
  Photo file.
- [ ] Ctrl/Cmd+V pastes onto the Selected Page. The right-click menus of a
  Page, Slot and Page thumbnail also offer Paste onto the clicked Page.
  Pasting on a Slot adds another Slot; it does not replace the clicked Slot.
  Select the pasted Slot and place it above the Page's existing Slots.
- [ ] The first paste onto a different Page keeps the original Page-relative
  position, without mirroring or using the pointer position. The first paste
  onto the source Page is offset 5 mm right and 5 mm down, independent of
  screen zoom.
- [ ] Further pastes onto each destination Page advance another 5 mm right
  and down from that Page's previous paste position. The sequence is
  independent for each Page and starts over on a new Copy. Limit each offset
  using the existing Slot movement and Bleed constraints, even if copies
  overlap at an edge.
- [ ] Use normal system-clipboard replacement: copying a Slot replaces the
  previous clipboard contents, and copying other data makes the Slot
  unavailable. Pasting is restricted to the currently open Album. When no
  valid Slot is available, disable Paste in the menus and leave the Album
  unchanged on the shortcut.
- [ ] Keep the Slot copy while navigating Pages and Spreads. Invalidate it
  when the Album closes or switches, when leaving Album mode for Sort or
  Layout mode, or after any successful in-app Photo move or Folder rename,
  even if it concerns another Photo. Do not clear unrelated ordinary text from
  the system clipboard when invalidating a Slot copy.
- [ ] Preserve normal copy/paste in text fields, inline Text Slot editing and
  dialogs. Report clipboard access failures rather than silently claiming
  success; failed copy/paste does not change the Album or add an undo step.
- [ ] Each paste is one undoable Album edit; undo removes the pasted Slot and
  redo restores it. Copy itself adds no undo step.
- [ ] Pasting a populated Photo Slot increases its Photo's Usage without the
  ordinary already-used warning, as with Alt-drag duplication. Ordinary Photo
  placement warnings remain unchanged.
- [ ] Focused tests cover both Slot types and empty Slots, independent
  snapshots, keyboard and context-menu targets, repeated positions on
  interleaved Pages and Bleed limits, clipboard replacement and failures,
  invalidation, text editing, Usage, and undo/redo. Verify clipboard and menu
  behavior in the native app.

## Scope boundaries

No multi-Slot copying, cross-Album Slot pasting, Slot copying or pasting in
Layout mode, importing ordinary clipboard text as a Slot, or moving an
existing Slot between Pages. Do not change snapping or its guides; the
separate snapping feedback is outside this issue.
