# 042 - Copy Photos to a Folder

Status: todo · Type: feature · Depends on: 026, 028, 034, 037, 041

## What

Alt-drag Photos to another Folder to copy their files rather than move them.
Offer the same operation through the Photo right-click menu. Copies are
independent files but share Usage with their Identical Photos through
[041](041-content-aware-photo-usage.md).
See [ADR 0005](../docs/adr/0005-identical-photos-share-usage.md).

Designed alongside [040 - Alt-drag to duplicate a Slot](040-alt-drag-duplicate-slot.md).
Both use Alt to leave the original in place, but a Slot duplication is an
Album/Layout edit whereas a Photo copy creates a file.

## Acceptance criteria

- [ ] In Album mode and Sort mode, a Photo-to-Folder drop copies when Alt
  is held at drop and moves otherwise. Pressing/releasing Alt during the
  drag switches an unmistakable copy/move indicator and target highlight.
- [ ] Dropping a Photo on a Page or Photo Slot continues to place it normally,
  regardless of Alt. Existing ordinary placement warnings are preserved.
- [ ] Copy uses the existing move batch rules: from the grid, a Comparison
  member acts on the whole Comparison, otherwise just that Photo; from the
  Comparison, a Selected Photo acts on the Selected Photos, otherwise just
  that Photo. Right-click actions use the same rules.
- [ ] Copy leaves the originals, their Comparison membership and selection
  unchanged. No Placement paths or Album files are changed by copying.
- [ ] Right-click offers "Move to Folder..." and "Copy to Folder..." with
  the existing destination choices. Rename "Send to Folder" to the explicit
  move action; do not change which Photos either action affects.
- [ ] Keep the existing valid destination rules, including Folder tiles and
  breadcrumbs. Protected Folders remain forbidden; a Photo's own Folder
  is not a same-Folder duplication target. In a valid mixed-source batch,
  skip Photos already in the destination and report those skips.
- [ ] Destination filename collisions receive the existing case-insensitive
  suffixes, such as `holiday (2).jpg`. Never overwrite an existing file,
  including one created after planning.
- [ ] A copy batch either creates every planned copy or leaves no new copies;
  originals remain untouched. Surface operation errors and any rollback
  failure explicitly, without reporting an incomplete batch as successful.
- [ ] Each app-created copy initially inherits its original's Reviewed state.
  Thereafter the states are independent. Identical files discovered on disk
  do not automatically inherit Reviewed state.
- [ ] Refresh the grid and shared Usage without reopening. If the original
  has three Placements, its copy shows Usage 3, not zero; placing the copy
  once makes both show 4.
- [ ] Success feedback identifies the destination and suffixed filenames.
  File copying, like file moving, is not part of Album undo and needs no
  confirmation for an ordinary successful operation.
- [ ] Focused tests cover batch selection, modifier changes, naming, skips,
  protected targets, failures, independent Reviewed state and shared Usage.
  Verify actual Alt presses/releases, menu actions, retained selection and
  no-overwrite file behaviour in the native WebView2 app.

## Scope boundaries

No same-Folder Photo duplication, external file import, linked copies, shared
deletion behaviour, file-operation undo or visual duplicate detection. Existing
Album updates for moves remain unchanged. Content-aware Usage must ship before
this feature so file copying does not reintroduce undetected Album reuse.
