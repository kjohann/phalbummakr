# 049 - Automatic Rescan and manual feedback

Status: todo · Type: feature · Depends on: 003, 048

## What

Refresh the open Library quietly when returning to the app, while making an
explicit manual Rescan visibly active. Comes from the Rescan inbox feedback.
Build on [048 - Protect progress during incomplete scans](048-incomplete-rescan-safety.md)
so background scanning cannot mistake unverifiable paths for removals.

## Acceptance criteria

- [ ] Rescan the whole open Library on returning to the foreground after
  switching to another app or minimizing, in Album and Sort modes. Moving focus
  within the app or closing an app-owned file dialog alone does not trigger a
  scan.
- [ ] Automatic scans are quiet and non-blocking: keep the current view usable
  without a loading banner or spinner, and apply confirmed changes when the
  scan completes. Continue to show scan warnings and errors.
- [ ] An automatic scan with no Library changes does not flicker the grid or
  existing Usage indicators, or temporarily empty the Unused view by
  restarting its checks.
- [ ] If the app is left and returned to again while an automatic scan is
  already running, do not schedule another scan solely for that return.
  Changes the running scan misses wait for a later return or manual Rescan.
- [ ] Rescan remains clickable during an automatic scan. An explicit click
  queues a fresh manual scan that begins after the click, rather than merely
  reusing the in-flight scan.
- [ ] During a manual Rescan, replace the Rescan button's label with a
  size-stable, accessible indeterminate spinner until the requested scan
  finishes, then restore the button. Keep the existing "Scanning Library..."
  status and current view usable; do not invent a percentage.
- [ ] Changes found on disk update the grid, Comparison and Folder navigation
  as in a manual Rescan, subject to 048's incomplete-scan safeguards.
  In-app moves, copies and Folder renames during scanning are not overwritten
  by stale scan results.
- [ ] A Photo discovered at a genuinely new path after an outside move or copy
  starts unreviewed there. An outside copy leaves the original's mark alone.
  External Folder renames and replacements at the same path remain best-effort.
- [ ] Focused tests cover focus and dialog triggers, unchanged scans, automatic
  scan overlap, a manual click during automatic scanning, spinner and error
  states, external changes, and in-app file operations during a scan. Verify
  foreground return, dialogs and the spinner in the native app.

## Scope boundaries

Do not add a filesystem watcher or silently repair Album Placements after
outside moves; that repair remains in the [backlog](backlog.md). Do not add
a persistent scan cache or change the unrelated top-bar and PNG inbox notes.
