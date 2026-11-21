# 041 - Content-aware Photo Usage

Status: todo · Type: feature · Depends on: 008

## What

Recognise byte-identical Photo files as Identical Photos for Usage, the unused
filter and duplicate-placement warnings. Files remain independent Photos and
Placements still reference their particular Library-relative paths.
See [ADR 0005](../docs/adr/0005-identical-photos-share-usage.md).
This is a prerequisite for [042 - Copy Photos to a Folder](042-copy-photos-to-folder.md).

Implement together with the still-todo
[008 addendum](008-addendum.md), retaining all its filesystem-alias criteria.
That addendum concerns paths resolving to the same file; this issue additionally
groups separate files with identical contents. Neither distinction should be
lost. Mark both work items complete only after their criteria are verified.

## Acceptance criteria

- [ ] Identical Photos share the total number of their Placements in the
  current Album. If the original is placed three times, its identical copy
  also shows Usage 3; placing either once more makes both show 4.
- [ ] Badges, the unused filter and ordinary duplicate-placement warnings
  consistently use this shared Usage, including duplicates already on disk,
  after rescan, reopening, Album switching and Placement edits.
- [ ] Use SHA-256 hashes of complete file contents, not filenames, paths or
  the existing metadata-based preview revision. Cache hashes persistently
  for unchanged files and invalidate them when files change.
- [ ] Different bytes count separately, including external EXIF edits and
  recompression. In-app Slot rotation, Crop/Fit and differently oriented
  Placements of the same Photo continue to share Usage.
- [ ] Hashing runs in the background without preventing browsing or placing
  Photos. Unresolved Usage shows "Checking..." rather than zero. The unused
  filter excludes unresolved Photos and displays an indexing notice.
- [ ] A placement whose duplicate check is unresolved remains allowed, with
  an explicit duplicate-check-pending notice rather than a false all-clear.
- [ ] Hash/read failures are visible and offer retry. A failed check is not
  silently reported as unused or complete.
- [ ] Retain an established content identity for a Missing Photo's Placements
  so they still contribute to shared Usage. If that identity was never known,
  surface incomplete duplicate-check status rather than guessing.
- [ ] Moving or deleting one Identical Photo does not relink Placements of
  another. Content identity never substitutes for a Placement's file path.
- [ ] Retain correct Usage after case-only path changes on case-insensitive
  filesystems. Do not blindly lowercase paths or merge different-content
  files on case-sensitive filesystems. Identity-resolution failures remain
  explicit, as required by the 008 addendum.
- [ ] Usage remains derived from the current Album; the content index does
  not store Placement counts. Verify aliases, identical files, distinct
  files, indexing/error states, Missing Photos and cache invalidation with
  focused tests.
- [ ] Measure first-pass and cached-index behaviour on a representative
  Library. Verify that unchanged cached files are not fully reread, and
  that pending/error UI behaves correctly while browsing and placing.

## Feasibility measurement

On 2026-11-21, a read-only, sequential SHA-256 pass over the user's representative
2024 Library measured:

- 991 supported Photo files, totalling 2,667,528,056 bytes.
- Enumeration: 0.113 seconds; hashing: 4.928 seconds, about 516 MiB/s.
- No read errors; no byte-identical groups.

The scan followed the current JPG/JPEG/PNG extensions, excluded `Exports` and
`.phalbummakr`, and did not follow symlinks. OS cache state was unknown: this is
not a certified cold-start result or an application-level performance guarantee.
The benchmark changed no Library files and used one full pass.

## Scope boundaries

No visual-similarity detection, shared file lifecycle, automatic Missing Photo
relinking or redesign of the ordinary warning's presentation. Unknown identity
is an explicit state, not permission to treat a Photo as unused.
