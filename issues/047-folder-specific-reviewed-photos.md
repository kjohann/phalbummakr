# 047 - Folder-specific Reviewed Photos

Status: done · Type: feature · Depends on: 037, 042

## What

Review progress belongs to a Photo in its current Folder, rather than following
the file wherever it is sorted. A Photo becomes reviewed when it is shown while
Sorting or marked by hand; it can be unmarked again. Moving or copying it to
another Folder starts it unreviewed there.

Follows [037 - Reviewed Photos and remembered position](037-reviewed-photos.md)
and [042 - Copy Photos to a Folder](042-copy-photos-to-folder.md), reversing
their move and copy inheritance rules. Comes from the Reviewed Photos inbox
feedback.

## Acceptance criteria

- [x] An in-app move or copy to another Folder makes every transferred Photo
  unreviewed at the destination, regardless of its previous state. This applies
  in Album and Sort modes, to drags and menu actions, including New Folder.
- [x] A copy leaves the original Photo's Reviewed state unchanged. A move
  removes the old path's mark and clears its old Folder's last-shown reference
  only if it points to that Photo. Skipped Photos and transfers fully rolled
  back after failure keep their marks; rollback failures remain visible.
- [x] A Photo moved from A to B and then back to A is unreviewed each time it
  arrives, even if it had previously been reviewed in that Folder. Folder
  renames performed in the app preserve marks and remembered positions,
  including those in subfolders.
- [x] Existing saved marks remain unchanged when this feature is introduced;
  their history cannot distinguish actual reviews from old inherited marks.
  The new rule applies to future transfers, and marks still survive restarts.
- [x] In Sort mode, a visible "Mark all unreviewed" button in the Photo pane
  header acts on the current Folder's direct Photos, not its subfolders. It
  includes marks for Photos hidden by the Unused filter or temporarily absent
  from the scan, and never changes marks in other Folders.
- [x] The button asks for confirmation identifying the Folder and scope.
  Cancelling changes nothing; confirming clears the marks without adding undo.
  Existing progress-loading and saving errors remain visible.
- [x] Resetting marks leaves the Comparison, scroll position and remembered
  last-shown Photo unchanged. Displayed Photos from that Folder remain visible
  and unreviewed; Photos from other Folders keep their marks.
- [x] After a Photo is marked unreviewed, individually or by the Folder reset,
  adding or removing other Comparison members does not mark it reviewed again.
  Newly shown Photos and Photos explicitly shown again become reviewed,
  including a remembered Photo restored on reopening a Folder.
- [x] Update the Reviewed Photo definition in [GLOSSARY.md](../GLOSSARY.md)
  when implementing this issue. Leave the completed criteria in 037 and 042
  intact as history.
- [x] Focused tests cover move and copy batches, both modes, round trips, skipped
  and failed transfers, Folder renames, existing saved marks, filtered and
  unreadable Photos, confirmation, Comparison changes and restored Photos.
  Verify the reset control in the native app.

## Scope boundaries

The reset changes review marks only, not Folder navigation, Usage, Placements or
file contents. External changes remain best-effort; see
[049 - Automatic Rescan and manual feedback](049-automatic-rescan.md).

## Implementation and verification

Successful transfers clear destination marks; moves also clear source marks and
matching last-shown references. Copies leave originals alone. Folder renames
continue to carry marks and positions with the renamed paths.

The Sort pane confirms a direct-Folder reset against saved marks, including
filtered or unscanned Photos. It does not change Comparison membership,
positions or undo history. Only newly shown or explicitly reshown Photos become
reviewed automatically; changing other Comparison members does not re-mark
retained Photos.

The complete frontend suite passes (438 tests), as do the Rust suite (59 tests,
one ignored benchmark), typecheck, lint and the production build. A Windows
native debug build with an isolated synthetic Library verified that cancelling
the reset retained two marks and confirming it cleared them while the
Comparison remained. This native check preceded the later Comparison-tracking
edge-case fixes, which are covered by the final automated tests and build.
The existing JavaScript chunk-size warning and a non-fatal Rust incremental
compilation access warning remain.

## Earlier considerations and inbox

- [037](037-reviewed-photos.md)'s best-effort save-on-quit and per-Folder
  scroll offsets across different filters remain unchanged; neither belongs
  to the Reviewed reset. Its full real-Library restart, move, rename and
  Compact-tick checks remain deferred; this native check used synthetic Photos.
- The native drag, move and scroll checks in [028](028-sort-mode.md),
  [032](032-smooth-moves-in-sort-mode.md) and
  [034](034-drag-selected-photos.md) remain separate from this reset check.
  The stale scan-warning path after a move from 032 is also unchanged.
- The repeated rename-path helper and separate grid position lookups noted in
  037 remain deferred; this change does not require restructuring them.
- Other earlier editor, rendering, cache, filesystem and native gesture
  considerations remain outside this issue.
- No inbox notes were resolved; preserving progress on scan warnings does not
  fix the reported PNG decoding warnings.

## Code review

The working diff was reviewed directly against the prior commit and this issue.

### Standards

No documented-standard violations or consequential new code smells were found.

### Spec

The review fixed nested-Folder renames, same-path Library switches and
Comparison changes while Sort mode is hidden. One non-blocking safeguard
boundary remains: a scan warning postpones all progress pruning, even for
unrelated removals. [048](048-incomplete-rescan-safety.md) tracks the more
precise incomplete-scan behavior.

Standards: 0 findings. Spec: 1 non-blocking safeguard boundary, tracked in 048.

## Future considerations (low priority)

- Implement [048](048-incomplete-rescan-safety.md) to distinguish unverifiable
  paths from confirmed removals and retain affected Photos and Folders in the
  current view. This issue only conservatively preserves saved progress when
  a scan reports warnings.
