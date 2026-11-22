# 048 - Protect progress during incomplete scans

Status: todo · Type: bug · Depends on: 003, 037, 044

## What

A Library scan can return warnings and incomplete results when a Photo or
Folder cannot be read. Treating every omitted path as deleted can erase Reviewed
marks and remembered positions and remove Photos from the current view.
Preserve what cannot be verified while still applying confirmed changes.

Follows [003 - Browse Photos in the Library](003-browse-photos.md),
[037 - Reviewed Photos and remembered position](037-reviewed-photos.md), and
[044 - Folder Photo counts](044-folder-photo-counts.md). This protects manual
scans now and is a prerequisite for
[049 - Automatic Rescan and manual feedback](049-automatic-rescan.md).

## Acceptance criteria

- [ ] When a scan cannot read a Photo or enumerate a Folder, distinguish
  potentially affected paths from confirmed removals. If the affected area
  cannot be determined, conservatively preserve all potentially affected
  paths. A warning about a successfully scanned Photo does not by itself make
  unrelated paths unverifiable.
- [ ] Preserve Reviewed marks and remembered Folder positions for unverifiable
  paths, including when saved Sort progress loads after the incomplete scan.
  Continue to forget confirmed removals in unaffected areas.
- [ ] Previously known but unverifiable Photos and Folders remain in the
  current session's grid and Folder navigation. Keep an unverifiable Photo in
  the Comparison and an unverifiable current Folder open rather than treating
  either as confirmed missing.
- [ ] Retained Photo tiles, Comparison Photos and Folder tiles have a visible,
  accessible "Could not verify" indication. Scan warnings and errors remain
  visible; an unverifiable Photo is not presented as a confirmed Missing Photo.
- [ ] Folder Photo count badges whose totals may be incomplete, including
  affected ancestors, show the best-known count with an uncertainty indicator.
  If no count is known, show `?` instead. The uncertainty is accessible and
  does not imply an exact count.
- [ ] Normal actions remain available on retained Photos. If the file is
  unavailable, report the operation error normally rather than claiming success.
- [ ] A later scan that confirms a Photo or Folder was removed applies the
  existing removal, Comparison and Folder-fallback behavior. A failed scan
  keeps the last usable view and reports the error.
- [ ] If the first scan after restart is incomplete, retain saved Reviewed
  marks and Folder positions, but do not invent unavailable tiles without a
  prior in-memory snapshot. Do not add a persistent scan cache.
- [ ] Focused tests cover unreadable Photos and Folders, warnings of unknown
  scope, unaffected removals, lazy progress loading, both Photo panes,
  Comparison and Folder retention, uncertain descendant counts, actions and
  errors, a subsequent complete scan, and the first scan after restart.

## Scope boundaries

Keep external Folder renames and replacements at the same path best-effort.
Repairing Album Placements after outside moves remains in the
[backlog](backlog.md).
