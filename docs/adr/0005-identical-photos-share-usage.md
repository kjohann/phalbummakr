# Allow Photo copies while Identical Photos share Usage

Supersedes the "Copying Photos into Folders" rejection in
[ADR 0003](0003-sorting-moves-photos-on-disk.md). Accepted design; implementation
is tracked in [041](../../issues/041-content-aware-photo-usage.md) and
[042](../../issues/042-copy-photos-to-folder.md).

Sorting may copy a Photo into another Folder while leaving its original in
place. Each file remains an independent Photo, but byte-identical Photos share
Usage, the unused-filter result and duplicate-placement checks so copies do not
hide accidental Album reuse. ADR 0003 rejected copies because each copy would
appear as a separate Photo with split Usage. Shared Usage addresses that, so
the reason no longer applies. Copies still appear as separate Photos, which is
intended: users want the same Photo in more than one Folder.

## Considered Options

- **Keep rejecting copies**: preserves simple path-based Usage but prevents
  keeping the same Photo in multiple useful Folders.
- **Independent Usage per copy**: simple, but repeats the accidental-reuse
  problem that motivated the original rejection.
- **Linked files or a shared file lifecycle**: rejected. Folders on disk stay
  the source of truth, and moving or deleting one file must not affect another.
- **Visual similarity**: deferred. Exact content equality has a clear boundary;
  perceptual matching requires additional policy for edits and near-duplicates.

## Consequences

- Placements still reference specific file paths. Copying leaves existing
  Placements untouched; matching content does not repair a Missing Photo.
- Shared Usage uses cached SHA-256 content hashes. Background indexing must
  distinguish unresolved or failed checks from unused Photos.
- Different file bytes, including metadata-only changes, are distinct for
  Usage. Slot rotation and Crop/Fit do not change file identity.
- A previously established identity can keep a Missing Photo's Placements in
  the count; an unknown identity must be surfaced rather than guessed.
- Reviewed state remains file-specific. An app-created copy inherits it
  initially, but marking either file later does not mark the other.
- File copies are outside Album undo, like file moves. Alt-drag Slot duplication
  is a separate, undoable editing operation and never copies a Photo file.
