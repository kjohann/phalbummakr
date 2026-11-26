# 050 - Copy and paste Slots in Album mode

Status: done · Type: feature · Depends on: 011, 018, 019, 030, 040, 041

## What

Copy a Slot and paste independent copies onto Pages in the same Album,
including across Spreads. This extends the single-Page duplication behavior in
[040 - Alt-drag to duplicate a Slot](040-alt-drag-duplicate-slot.md).

## Acceptance criteria

- [x] Copy one selected Photo or Text Slot, including an empty Slot, with
  Ctrl/Cmd+C or the Slot's right-click menu. Capture a snapshot: later edits
  to, or deletion of, the original Slot do not change the copy.
- [x] Preserve the Slot's size, rotation and content, including Photo
  reference, Crop/Fit, text, formatting and Placeholder text as applicable.
  Each pasted Slot is independent and has its own identity. Do not copy a
  Photo file.
- [x] Ctrl/Cmd+V pastes onto the Selected Page. The right-click menus of a
  Page, Slot and Page thumbnail also offer Paste onto the clicked Page.
  Pasting on a Slot adds another Slot; it does not replace the clicked Slot.
  Select the pasted Slot and place it above the Page's existing Slots.
- [x] The first paste onto a different Page keeps the original Page-relative
  position, without mirroring or using the pointer position. The first paste
  onto the source Page is offset 5 mm right and 5 mm down, independent of
  screen zoom.
- [x] Further pastes onto each destination Page advance another 5 mm right
  and down from that Page's previous paste position. The sequence is
  independent for each Page and starts over on a new Copy. Limit each offset
  using the existing Slot movement and Bleed constraints, even if copies
  overlap at an edge.
- [x] Use normal system-clipboard replacement: copying a Slot replaces the
  previous clipboard contents, and copying other data makes the Slot
  unavailable. Pasting is restricted to the currently open Album. When no
  valid Slot is available, disable Paste in the menus and leave the Album
  unchanged on the shortcut.
- [x] Keep the Slot copy while navigating Pages and Spreads. Invalidate it
  when the Album closes or switches, when leaving Album mode for Sort or
  Layout mode, or after any successful in-app Photo move or Folder rename,
  even if it concerns another Photo. Do not clear unrelated ordinary text from
  the system clipboard when invalidating a Slot copy.
- [x] Preserve normal copy/paste in text fields, inline Text Slot editing and
  dialogs. Report clipboard access failures rather than silently claiming
  success; failed copy/paste does not change the Album or add an undo step.
- [x] Each paste is one undoable Album edit; undo removes the pasted Slot and
  redo restores it. Copy itself adds no undo step.
- [x] Pasting a populated Photo Slot increases its Photo's Usage without the
  ordinary already-used warning, as with Alt-drag duplication. Ordinary Photo
  placement warnings remain unchanged.
- [x] Focused tests cover both Slot types and empty Slots, independent
  snapshots, keyboard and context-menu targets, repeated positions on
  interleaved Pages and Bleed limits, clipboard replacement and failures,
  invalidation, text editing, Usage, and undo/redo. Verify clipboard and menu
  behavior in the native app.

## Scope boundaries

No multi-Slot copying, cross-Album Slot pasting, Slot copying or pasting in
Layout mode, importing ordinary clipboard text as a Slot, or moving an
existing Slot between Pages. Do not change snapping or its guides; the
separate snapping feedback is outside this issue.

## Implementation

- The system clipboard holds an opaque token; the open Album workspace retains
  the independent Slot snapshot only while that token still matches. On
  Windows, the clipboard sequence also detects a token restored from history.
- Pasting appends a cloned Slot, using the existing movement constraints for
  offsets and recording each paste through the existing Album history.
- Clipboard operations are serialized. Queued work and in-flight results are
  invalidated on mode changes, Album switches and successful Photo moves or
  Folder renames, subject to the write-cancellation limitation under Future
  considerations.

## Review and remaining work

Review found and fixed ordinary selected text being intercepted by Ctrl+C,
stale clipboard-read failures discarding a newer copy, and reused Page IDs
inheriting deleted Pages' paste positions. Windows clipboard sequence checking
also rejects an old token restored from history.

Review of the acceptance criteria after implementation confirmed each one in
code and tests. A test was added for invalidating the Slot copy when another
Album is opened, which was handled (the Album view remounts per Album file)
but not covered.

## Future considerations (low priority)

- A Slot write already dispatched to native code cannot be cancelled by a later
  invalidation. A delayed request could in theory start after invalidation and
  overwrite ordinary text copied in the few milliseconds in between. This was
  first treated as blocking, but was downgraded with the user: it needs a
  copy, an invalidating action and a copy in another app within the same
  IPC round trip, and the worst case is the clipboard holding the Slot token
  the user just asked to copy. A fix would need coordinated cancellation or a
  synchronous clipboard-write design.
- On non-Windows platforms the token-only fallback cannot detect a restored
  clipboard-history entry. Windows is the only platform currently targeted.

## Earlier follow-ups and inbox

Reviewed the earlier low-priority considerations. The native Page-thumbnail
and Slot context-menu checks in 018 and 019 were exercised for this feature.
Their broader drag, toolbar and menu checks remain open. The editor extraction
in 009/010/019 and shared history wiring in 011 remain deferred: neither is
necessary to implement Slot clipboard behavior. The snapping performance and
gesture lifecycle points in 013/040 remain unrelated to clipboard placement.
Other earlier follow-ups concern separate workflows and remain deferred.

No inbox notes are resolved; the snapping feedback is explicitly out of scope.

## Native verification

An isolated release build with a separate application identifier and test
Album was used. The empty Photo Slot's menu showed Paste disabled before
copying; menu Copy followed by thumbnail Paste created and selected a Slot on
the other Page. Ctrl+C and Ctrl+V then copied back across Pages, with a second
paste advancing its position. The user's existing Album was not opened.

After review fixes, another isolated release build confirmed menu Copy and
thumbnail Paste with the Windows clipboard sequence check. The full JavaScript
suite passed (459 tests), as did lint, type-checking and the release build.
