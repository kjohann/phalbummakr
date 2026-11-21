# 041 - Content-aware Photo Usage

Status: done · Type: feature · Depends on: 008

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

- [x] Identical Photos share the total number of their Placements in the
  current Album. If the original is placed three times, its identical copy
  also shows Usage 3; placing either once more makes both show 4.
- [x] Badges, the unused filter and ordinary duplicate-placement warnings
  consistently use this shared Usage, including duplicates already on disk,
  after rescan, reopening, Album switching and Placement edits.
- [x] Use SHA-256 hashes of complete file contents, not filenames, paths or
  the existing metadata-based preview revision. Cache hashes persistently
  for unchanged files and invalidate them when files change.
- [x] Different bytes count separately, including external EXIF edits and
  recompression. In-app Slot rotation, Crop/Fit and differently oriented
  Placements of the same Photo continue to share Usage.
- [x] Hashing runs in the background without preventing browsing or placing
  Photos. Unresolved Usage shows "Checking..." rather than zero. The unused
  filter excludes unresolved Photos and displays an indexing notice.
- [x] A placement whose duplicate check is unresolved remains allowed, with
  an explicit duplicate-check-pending notice rather than a false all-clear.
- [x] Hash/read failures are visible and offer retry. A failed check is not
  silently reported as unused or complete.
- [x] A timestamp-preserving, equal-length external edit or file replacement
  invalidates the cached identity using filesystem change/file-identity
  information, not only size and mtime.
- [x] Keep the content index with the Library to preserve established Missing
  identities across machines, as the user confirmed during implementation.
  Record the narrow ADR 0001 exception in ADR 0005; no Placement counts are stored.
- [x] Retain an established content identity for a Missing Photo's Placements
  so they still contribute to shared Usage. If that identity was never known,
  surface incomplete duplicate-check status rather than guessing.
- [x] Moving or deleting one Identical Photo does not relink Placements of
  another. Content identity never substitutes for a Placement's file path.
- [x] Retain correct Usage after case-only path changes on case-insensitive
  filesystems. Do not blindly lowercase paths or merge different-content
  files on case-sensitive filesystems. Identity-resolution failures remain
  explicit, as required by the 008 addendum.
- [x] Usage remains derived from the current Album; the content index does
  not store Placement counts. Verify aliases, identical files, distinct
  files, indexing/error states, Missing Photos and cache invalidation with
  focused tests.
- [x] Measure first-pass and cached-index behaviour on a representative
  Library. Verify that unchanged cached files are not fully reread, and
  that pending/error UI behaves correctly while browsing and placing.
- [x] Complete the user's manual native UI checkpoint before committing.

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

## Implementation and verification

- Rust `index_photo_contents` streams complete file contents through SHA-256
  on a blocking worker, separately from browsing and rendition requests.
  The persistent index contains path/hash/metadata entries, not Placement counts.
- The UI indexes small sequential batches, with explicit pending, missing and
  error states. Library identities are shared with Album placement checks;
  counts are always derived from the current Album.
- Badges and the unused filter use the same derivation in the grid and
  Comparison. Failures offer retry; an unknown Missing Placement leaves the
  whole duplicate check visibly incomplete rather than guessing.
- Rust seam: 14 focused tests passed for complete-file hashing, persistent cache
  hits, mutation invalidation, Missing identities, aliases, failures and
  concurrency. UI/core targeted tests, typecheck and lint passed.
- Full validation: 358 frontend tests, 56 Rust tests (one ignored benchmark),
  typecheck, lint and a release native build passed.
- Representative measurements are recorded below. The user reported all native
  checklist checks passed on 2026-11-21 and approved committing and continuing.
  The 008 addendum is still a separate run and commit.

### Representative index measurement

With the user's permission, the actual `index_paths` implementation processed
the representative 2024 Library in sequential batches of eight, like the UI:

| Pass | Files hashed | Bytes hashed | Cache hits | Backend time | Wall time |
| ---- | ------------ | ------------ | ---------- | ------------ | --------- |
| First | 989 | 2,667,275,858 | 0 | 44.170 s | 44.248 s |
| Cached | 0 | 0 | 989 | 0.810 s | 0.898 s |

No pre-existing content cache; zero indexing errors or Missing Photos. The
metadata scan took 2.978 s and excluded two invalid PNGs with visible warnings.
This is a **debug-profile** measurement, not release-app hashing performance;
OS cache state was unknown. The cached pass did not reread complete unchanged
Photo contents. Only `.phalbummakr/content-index.json` was written; no Photo or
Album was edited. The ignored benchmark remains available for repeat measurement.

## Native UI checkpoint

Use the newly built `../src-tauri/target/release/phalbummakr.exe` with a test
Album and a pair of byte-identical Photo files in different Folders:

1. Place the original three times: both files show Usage 3. Place its copy once:
   both show 4. The ordinary already-used warning remains dismissible.
2. Unused excludes both files. Rescan and reopen; badges/filter/warnings remain
   correct. Switching Albums derives that Album's own counts.
3. While the index is unresolved, browsing/placement remain available, Checking
   is explicit and Unused excludes unresolved Photos. Failed checks are visible
   with retry; unresolved placements receive a pending-check notice.
4. Slot rotation and Crop/Fit keep shared Usage. A real byte edit separates it
   after Rescan. Missing Photos retain known identities without relinking.

The representative index benchmark is run separately with the user's permission.

## Earlier follow-ups and inbox

Reviewed the earlier low-priority sections. The case-only path identity finding
in 008 is relevant and retained for the separate addendum run. The new SHA cache
is metadata-invalidated; older rendition/cache pruning and transport changes
(003/006), export colour management (012), missing-font handling (009), broader
editor refactors (010/011), and file-operation lifecycle work remain outside
content-aware Usage.

The inbox's broad Rescan loading-feedback note is not removed: this change
reports content-index progress, not overall scan progress or automatic rescans.
No other inbox note is resolved.

## Review

### Standards

Resolved the content-index storage conflict with ADR 0001: the user explicitly
chose the Library-local index to preserve established Missing Photo identities
across Library moves. ADR 0005 records this narrow exception; thumbnails and
previews remain per-machine. The duplicated index fixture in the two existing
test suites is a non-blocking consideration.

### Spec

Review caught stale hashes for equal-length external edits that preserve mtime.
Resolved using Windows ChangeTime plus volume/file ID, and Unix ctime plus
device/inode. A timestamp-preserving mutation regression failed before the fix;
mutation, replacement and legacy Missing-identity migration tests now pass.
Representative verification passed as above; the user also completed native UI
verification.

## Future considerations (low priority)

- Extract the identical index response fixture if more UI suites need it;
  for now each existing suite owns its external-port setup.
