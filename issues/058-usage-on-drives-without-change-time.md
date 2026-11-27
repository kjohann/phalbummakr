# 058 – Photo Usage on drives without a change time

Status: done · Type: bug · Depends on: 041

## What

A Library on a FAT32 (or exFAT) USB stick fails every Photo Usage check with
"The filesystem did not provide a Photo change identity." These filesystems
report a Windows `ChangeTime` of 0. The content index from
[041 - Content-aware Photo Usage](041-content-aware-photo-usage.md) required that
value to validate cached SHA-256 hashes, so it treated every Photo as an error.

Running the app from the computer, with the Library and Album on the stick, must
work. The user chose to make the cached hash depend on weaker metadata on these drives,
rather than rehashing every Photo on every check.

## Acceptance criteria

- [x] On a filesystem without a change time, Photos get hashed identities
  instead of errors.
- [x] Their cached hashes stay valid while the Photo's length, modified time,
  volume and file index are unchanged, so repeat checks do not reread the Photos.
- [x] A change to length or modified time still invalidates the cached hash.
- [x] Filesystems that provide a change time (NTFS, Unix) keep the stronger
  041 validation unchanged. Existing content indexes stay readable.

## Known limitation

On these drives, an external edit that keeps both the length and the modified
time is not detected until either one changes. The user accepted this to keep
Usage checks on USB drives fast.

## Implementation and verification

- `content_index.rs` records a `WindowsWithoutChangeTime` token (volume and
  file index) when `ChangeTime` is 0 instead of failing. Cache hits on such
  drives therefore depend on length, modified time, volume and file index.
  Legacy entries without a token still never produce cache hits.
- New focused test, using a test-only seam that simulates a missing change time:
  the first pass hashes, the repeat pass is a cache hit, and a length change rehashes.
- Verified on the user's real FAT32 stick (E:), using a scratch Library of two
  copied Photos that was removed afterwards: 0 errors, and a separate second
  process got 2/2 cache hits without rereading. The file index is therefore
  stable across runs.
- All 60 Rust tests pass (1 ignored benchmark). The two clippy warnings are
  pre-existing in `fonts.rs` and `settings.rs`.

## Earlier follow-ups and inbox

The only open future consideration in 041, extracting a shared test fixture,
is unrelated. No inbox note is resolved. The bare "Scanning library..." text without a
progress indicator is related to
[049 - Automatic Rescan and manual feedback](049-automatic-rescan.md), which
adds a spinner for scans. It is not changed here.

## Future considerations (low priority)

- When many Photos fail the same way, the Usage error lists every Photo in
  full, which looked like a crash. Grouping identical messages would make such
  failures easier to read.
