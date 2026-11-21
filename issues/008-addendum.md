# 008 addendum - Filesystem-aware Photo Usage

Status: done · Addendum to: [008 - Usage badges and duplicate warning](008-usage.md)

Implemented on the foundation of [041 - Content-aware Photo Usage](041-content-aware-photo-usage.md).
The filesystem-alias requirements below remain in force alongside shared Usage
for separate, byte-identical files. This addendum has its own regression
verification, review, native checkpoint and commit.

## Finding

On a case-insensitive filesystem, renaming a Photo with only a case change can
leave an existing Placement resolving to that Photo while Usage treats the
renamed path as different. The badge, unused filter and duplicate warning can
then be incorrect. This was deferred as a non-blocking follow-up during the
007/008 merge.

## Additional acceptance criteria

- [x] Case-only path changes on case-insensitive filesystems retain the correct
  Usage badge, unused filter and duplicate warning after rescan and reopening.
- [x] Paths that refer to distinct Photos on case-sensitive filesystems remain
  distinct; path identity is not inferred by blindly lowercasing names.
- [x] Usage remains derived from the Album, with automated tests for both
  case-insensitive aliases and distinct case-sensitive paths.
- [x] Failures to determine filesystem identity are surfaced without silently
  reporting an already-used Photo as unused.
- [x] Complete the user's native case-only rename/rescan/reopen checkpoint.

## Implementation and verification

The content index from 041 already resolves each recorded/scanned path through
the filesystem and hashes the file it actually refers to. This separate run
reuses that implementation rather than adding a second path-normalisation
system. No lowercasing or Placement relinking is introduced.

- The existing Rust seam test performs a real case-only rename on the current
  case-insensitive filesystem, reopens the persistent cache, resolves both
  spellings and verifies the same SHA identity. Its case-sensitive branch keeps
  separate files distinct.
- A focused core regression exercises both alias and different-content
  case-sensitive identities, derives counts from the Album and surfaces an
  unavailable filesystem identity as an incomplete/error check.
- Browser regressions verify badge/filter behavior after rescan and remount,
  and an Album workspace regression verifies the ordinary warning while keeping
  the original Placement's case unchanged.
- These regressions pass on the 041 foundation. No artificial failing test or
  unnecessary production-code change was introduced for already-working behavior.
- Targeted tests, all 361 frontend tests, typecheck and lint passed. The release executable from 041
  remains current because this run changes only regressions and documentation.

## Review

### Standards

No findings. The focused diff was reviewed directly against starting commit
`1f3aa47`; tests use the agreed core/workspace seams and existing fixtures.

### Spec

No implementation gaps found. All four filesystem-alias requirements are
covered by the shared index and focused regressions; native verification is
passed as a separate completion gate.

## Earlier follow-ups and inbox

This resolves the case-only Usage finding in the original 008 low-priority
section. Unrelated rendition/cache pruning, export, editor refactoring and
broader file lifecycle work stay deferred. No inbox notes are resolved.

## Native verification checkpoint

With a placed Photo in a test Library, rename only its letter casing outside the
app (for example `Photo.jpg` to `photo.jpg`). Rescan, then reopen the Album:

1. Its renamed tile keeps the Usage badge and stays excluded from Unused.
2. Placing the renamed Photo again shows the ordinary already-used warning.
3. The original Placement still refers to its recorded spelling and resolves
   without being automatically relinked.

The user confirmed all three checks passed before this addendum was committed.

## Future considerations (low priority)

No remaining non-blocking review findings for this addendum.
