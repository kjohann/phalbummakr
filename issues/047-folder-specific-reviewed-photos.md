# 047 - Folder-specific Reviewed Photos

Status: todo · Type: feature · Depends on: 037, 042

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

- [ ] An in-app move or copy to another Folder makes every transferred Photo
  unreviewed at the destination, regardless of its previous state. This applies
  in Album and Sort modes, to drags and menu actions, including New Folder.
- [ ] A copy leaves the original Photo's Reviewed state unchanged. A move
  removes the old path's mark and clears its old Folder's last-shown reference
  only if it points to that Photo. Skipped Photos and transfers fully rolled
  back after failure keep their marks; rollback failures remain visible.
- [ ] A Photo moved from A to B and then back to A is unreviewed each time it
  arrives, even if it had previously been reviewed in that Folder. Folder
  renames performed in the app preserve marks and remembered positions,
  including those in subfolders.
- [ ] Existing saved marks remain unchanged when this feature is introduced;
  their history cannot distinguish actual reviews from old inherited marks.
  The new rule applies to future transfers, and marks still survive restarts.
- [ ] In Sort mode, a visible "Mark all unreviewed" button in the Photo pane
  header acts on the current Folder's direct Photos, not its subfolders. It
  includes marks for Photos hidden by the Unused filter or temporarily absent
  from the scan, and never changes marks in other Folders.
- [ ] The button asks for confirmation identifying the Folder and scope.
  Cancelling changes nothing; confirming clears the marks without adding undo.
  Existing progress-loading and saving errors remain visible.
- [ ] Resetting marks leaves the Comparison, scroll position and remembered
  last-shown Photo unchanged. Displayed Photos from that Folder remain visible
  and unreviewed; Photos from other Folders keep their marks.
- [ ] After a Photo is marked unreviewed, individually or by the Folder reset,
  adding or removing other Comparison members does not mark it reviewed again.
  Newly shown Photos and Photos explicitly shown again become reviewed,
  including a remembered Photo restored on reopening a Folder.
- [ ] Update the Reviewed Photo definition in [GLOSSARY.md](../GLOSSARY.md)
  when implementing this issue. Leave the completed criteria in 037 and 042
  intact as history.
- [ ] Focused tests cover move and copy batches, both modes, round trips, skipped
  and failed transfers, Folder renames, existing saved marks, filtered and
  unreadable Photos, confirmation, Comparison changes and restored Photos.
  Verify the reset control in the native app.

## Scope boundaries

The reset changes review marks only, not Folder navigation, Usage, Placements or
file contents. External changes remain best-effort; see
[049 - Automatic Rescan and manual feedback](049-automatic-rescan.md).
