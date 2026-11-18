# 011 – Undo and redo

Status: done · Depends on: 006, 018, 019, 023

## What

Undo and redo every Album and Layout change during the current session.

## Acceptance criteria

- [x] Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) undo and redo Slot, Placement, Crop, text and page operations.
- [x] A drag or pan counts as one undo step, not one per mouse move.
- [x] Undo history is kept only for the session. Autosave still writes the current state.
- [x] Adding, deleting and duplicating Spreads, Duplicate Page onto New Spread and dragging a Page to a new position can each be undone and redone as one step, restoring the Pages' content and order.
- [x] Deleting a Slot can be undone, restoring its content, position and rotation.
- [x] Undo and Redo buttons are added to the right-hand group of the command bar ([023](023-command-bar.md)), with the same enabled state as the shortcuts.
- [x] In Layout mode ([010](010-layouts.md)), each Layout has its own undo history. Moving Photos between Folders is never undone.
- [x] With undo available, the Spread and Slot deletion questions from [018](018-page-strip.md) and [019](019-slot-toolbar.md) are removed, along with their Preferences checkboxes.

## Decisions

- **Preferences removed.** With both deletion checkboxes gone, Preferences had
  nothing left, so File → Preferences… is removed until a preference exists.
  The `confirmSpreadDeletion`/`confirmSlotDeletion` settings and their
  `set_confirm_*` commands are gone from Rust; older `settings.json` files still
  load and the fields are dropped on the next write.
- **Layout Library operations are not undone.** New, Duplicate and Delete Layout
  act on the Library rather than one Layout, so they are outside every Layout's
  history. Delete Layout keeps its confirmation, and deleting a Layout discards
  its history.
- **What one step is.** Every Album change goes through `AlbumWorkspace`'s
  `changeAlbum`, which records the replaced Album; changes that leave the Album
  unchanged record nothing. Drags and pans were already committed once on
  release. Typing in a Text Slot (or a Layout placeholder) is grouped into one
  step until the editor gains or loses focus; the colour picker's live changes
  are grouped until the colour is chosen. Album settings and Apply Layout are
  undoable too.
- **Where undo lands.** After an undo or redo, Album mode keeps the selected
  Page if the step changed it, and otherwise selects the first Page that
  changed, so the user sees the effect.
- **Shortcuts.** `App` handles Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z for the current
  mode, with the same enabled state as the Undo and Redo buttons. Text fields
  keep their own undo, except the Text Slot and placeholder editors, whose
  content is Album or Layout state. Modal dialogs leave the shortcuts alone.
  Sort mode has nothing to undo; moving Photos between Folders (026/028) will
  not be part of any history ([ADR 0003](../docs/adr/0003-sorting-moves-photos-on-disk.md)).
- **Session only.** The history lives in memory: `AlbumWorkspace` starts an
  empty history for each opened Album, and `LayoutWorkspace` keeps one per
  Layout while the Album is open. Autosave writes whatever state undo or redo
  leaves.

## Earlier considerations reviewed

- [019](019-slot-toolbar.md) / [020](020-photo-pane.md) / [023](023-command-bar.md) / [024](024-slot-tools-in-command-bar.md):
  "deletion preferences travel as four props / generic preference command" is
  resolved: the preferences no longer exist.
- [029](029-apply-layouts.md): "011 should cover Apply Layout" is resolved;
  applying a Layout is one undo step that brings back what did not fit (tested).
- [010](010-layouts.md): "each Layout has no undo history until 011" is
  resolved. Its duplicated Slot interaction code between `AlbumView` and
  `LayoutWorkspace` stays deferred: undo added parallel history wiring in both
  but no shared Slot-overlay, and that refactor of the large `AlbumView` is
  out of this issue's scope.
- [024](024-slot-tools-in-command-bar.md): the exact font size's double commit
  point stays deferred; Enter and blur each apply at most once, so each applied
  size is one undo step.
- Native WebView2 checks (005–029) stay deferred; undo was verified through
  the jsdom tests only.

## Future considerations (low priority)

- **Code review, Standards (judgement calls):**
  - `AlbumWorkspace` and `LayoutWorkspace` each wire record / end group / step
    around `UndoHistory`, and both repeat the colour-picker grouping rule. A
    small shared hook could own this if a third history appears.
  - `{ canUndo, canRedo }` is declared as `HistoryState` but restated in
    `LayoutBarState` and as literals.
  - `App`'s shortcut handler recognises the Text Slot editors by their
    `.slot-text-editor` class; renaming it would quietly give those editors the
    browser's own undo back.
  - Group keys are template strings (`text:…`, `placeholder:…`, `colour:…`).
- **Flaky tests under load:** two full-suite runs out of seven failed on
  existing `AlbumWorkspace` tests ("runs command bar commands…" and "shows a
  failed Layout Library save…") with effects not yet flushed, while 0 of 5
  baseline runs did. Neither touches undo; they assert straight after a
  `findBy…` and may need a `waitFor`.
- **Native check:** try Ctrl+Z/Ctrl+Y in WebView2, especially inside a Text
  Slot editor, and that Escape-then-retype starts a new step there.