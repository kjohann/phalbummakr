# 042 - Copy Photos to a Folder

Status: done · Type: feature · Depends on: 026, 028, 034, 037, 041

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

- [x] In Album mode and Sort mode, a Photo-to-Folder drop copies when Alt
  is held at drop and moves otherwise. Pressing/releasing Alt during the
  drag switches an unmistakable copy/move indicator and target highlight.
- [x] Dropping a Photo on a Page or Photo Slot continues to place it normally,
  regardless of Alt. Existing ordinary placement warnings are preserved.
- [x] Copy uses the existing move batch rules: from the grid, a Comparison
  member acts on the whole Comparison, otherwise just that Photo; from the
  Comparison, a Selected Photo acts on the Selected Photos, otherwise just
  that Photo. Right-click actions use the same rules.
- [x] Copy leaves the originals, their Comparison membership and selection
  unchanged. No Placement paths or Album files are changed by copying.
- [x] Right-click offers "Move to Folder..." and "Copy to Folder..." with
  the existing destination choices. Rename "Send to Folder" to the explicit
  move action; do not change which Photos either action affects.
- [x] Keep the existing valid destination rules, including Folder tiles and
  breadcrumbs. Protected Folders remain forbidden; a Photo's own Folder
  is not a same-Folder duplication target. In a valid mixed-source batch,
  skip Photos already in the destination and report those skips.
- [x] Destination filename collisions receive the existing case-insensitive
  suffixes, such as `holiday (2).jpg`. Never overwrite an existing file,
  including one created after planning.
- [x] A copy batch either creates every planned copy or leaves no new copies;
  originals remain untouched. Surface operation errors and any rollback
  failure explicitly, without reporting an incomplete batch as successful.
- [x] Each app-created copy initially inherits its original's Reviewed state.
  Thereafter the states are independent. Identical files discovered on disk
  do not automatically inherit Reviewed state.
- [x] Refresh the grid and shared Usage without reopening. If the original
  has three Placements, its copy shows Usage 3, not zero; placing the copy
  once makes both show 4.
- [x] Success feedback identifies the destination and suffixed filenames.
  File copying, like file moving, is not part of Album undo and needs no
  confirmation for an ordinary successful operation.
- [x] Focused tests cover batch selection, modifier changes, naming, skips,
  protected targets, failures, independent Reviewed state and shared Usage.
  Verify actual Alt presses/releases, menu actions, retained selection and
  no-overwrite file behaviour in the native WebView2 app.
- [x] Replace the bottom-left Move/Copy status with live Move/Copy feedback
  attached to the Photo drag badge, preserving modifier changes during dragging.
- [x] Remove content-index statistics from the Photo browser's everyday chrome;
  retain diagnostic access in a less prominent location.
- [x] Verify the revised drag badge and collapsed Diagnostics in the native app.

## Scope boundaries

No same-Folder Photo duplication, external file import, linked copies, shared
deletion behaviour, file-operation undo or visual duplicate detection. Existing
Album updates for moves remain unchanged. Content-aware Usage must ship before
this feature so file copying does not reintroduce undetected Album reuse.

## Implementation

- Copy is chosen from Alt at the Folder drop, not at drag start. Dragover and
  modifier events update the live Photo-count badge, cursor effect and distinct
  Folder highlighting. Existing Page/Slot placement continues to ignore Alt.
- Both Photo panes share move/copy destinations and the established batch rules.
  Album mode now exposes just the file-operation menu; Sort mode retains its
  Comparison and Reviewed actions too. New Folder supports Create and Copy.
- Copy planning reuses the existing collision/same-Folder planner. It does not
  read or rewrite Albums. The App tracks file-copy busy state independently of
  Album editing and never runs copies through the Placement-relink/undo bridge.
- Rust validates the whole batch, stages complete bytes in the destination
  Folders, flushes them and publishes with `persist_noclobber`. A publication
  failure removes all earlier published copies; removal failures are included
  in the operation error. Originals remain untouched.
- The grid merges new records without removing originals or changing the
  Comparison. Copies inherit Reviewed through the existing queued Sort progress
  lifecycle, then have independent marks. The shared content index refreshes on
  the changed scan. Record-refresh failures are explicitly reported and rescan.
- Success names the destination, suffixed names and skipped same-Folder Photos.

## Verification

Red-before-green tracers exposed absent copy orchestration, native file copying,
live copy feedback, copy menus, Reviewed inheritance and a silent refresh failure.
Focused tests now cover those slices, all four batch-selection branches,
retained selection, protected/own destinations, mixed skips, New Folder,
independent Reviewed state and shared Usage 3 -> 4 without reopening.

The actual Windows backend tests verify full bytes, unchanged originals/Albums,
collisions created after planning, protected/own Folders and a locked second
source leaving no published or temporary copies. Targeted frontend tests,
all 375 frontend tests, 59 Rust tests (plus one intentionally ignored benchmark),
typecheck, lint and the release native build pass. The existing JavaScript
chunk-size and macOS bundle-identifier warnings remain non-blocking. The user
passed the functional native checkpoint and, separately, verified the revised
live drag badge and collapsed Diagnostics in the rebuilt native app.

## Code review

The user verified native functionality, then requested the two presentation
changes above before completion. The user chose a badge for every Photo drag and
collapsed Diagnostics in Album settings, then passed the updated presentation's
separate native checkpoint and approved completion.

The native Photo snapshot contains only the small Photo preview. A separate
pointer-following badge shows the batch count and adds live Move/Copy when over a
valid Folder, avoiding a misleading file-operation label on a Page/Slot. This
separation is necessary because a native drag-image snapshot cannot change when
Alt changes mid-drag. Statistics are passed through the document workspace into
the collapsed settings section, never written into the Album. Index errors and
retry remain visible in the Photo browser.

### Standards

The independent Standards review of the worktree against `caf88bc` reported no
significant issues.

The narrow presentation follow-up was reviewed directly against the agreed
badge/settings choices. No Standards findings were found.

### Spec

The independent Spec review against the same baseline reported no significant
issues. Native verification remains a separate gate, not a claim made by the
DOM tests.

The follow-up Spec review found no gaps in live counts/modifier feedback,
statistics relocation or preserved error/retry visibility.

## Future considerations (low priority)

No remaining non-blocking review points were reported for this issue. Earlier
deferrals are recorded above rather than being mistaken for new copy work.

## Earlier considerations and inbox

- The no-clobber concern in [026](026-sorting-core.md) is resolved for copies:
  publication atomically refuses existing destinations. The older move/rename
  race stays deferred because changing move transactions is outside this issue.
- Native grid/Comparison drag, Folder-menu and scroll checks from
  [028](028-sort-mode.md), [034](034-drag-selected-photos.md),
  [032](032-smooth-moves-in-sort-mode.md) and
  [039](039-stop-photo-grid-drag-scrolling.md) are included in this checkpoint
  for the move/copy paths. Unrelated Folder renames and two-Album move checks
  remain separate earlier work.
- [037](037-reviewed-photos.md)'s best-effort save-on-quit and scroll offsets
  remain unchanged; this issue adds copy inheritance, not a general shutdown
  or scroll redesign.
- Cache pruning, rendition transport/size, code splitting, dense Page geometry,
  editor/toolbar refactoring, colour/font handling, broader external-edit
  coordination and the move Album-serialization trade-off remain unrelated.
  Existing shared path-helper/fixture duplication does not need new copies or
  another UI suite here, so it stays deferred.
- No inbox notes are resolved; the broader Rescan feedback, toolbar alignment,
  invalid PNG files and issue-phase organisation remain untouched.
