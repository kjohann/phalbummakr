# 008 addendum - Filesystem-aware Photo Usage

Status: todo · Addendum to: [008 - Usage badges and duplicate warning](008-usage.md)

## Finding

On a case-insensitive filesystem, renaming a Photo with only a case change can
leave an existing Placement resolving to that Photo while Usage treats the
renamed path as different. The badge, unused filter and duplicate warning can
then be incorrect. This was deferred as a non-blocking follow-up during the
007/008 merge.

## Additional acceptance criteria

- [ ] Case-only path changes on case-insensitive filesystems retain the correct
  Usage badge, unused filter and duplicate warning after rescan and reopening.
- [ ] Paths that refer to distinct Photos on case-sensitive filesystems remain
  distinct; path identity is not inferred by blindly lowercasing names.
- [ ] Usage remains derived from the Album, with automated tests for both
  case-insensitive aliases and distinct case-sensitive paths.
- [ ] Failures to determine filesystem identity are surfaced without silently
  reporting an already-used Photo as unused.
