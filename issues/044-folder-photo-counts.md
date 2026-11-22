# 044 - Folder Photo counts

Status: todo · Type: feature · Depends on: 033, 042

## What

Show a Folder Photo count badge on Folder tiles in both Sort and Album mode.
The count covers the Folder and every subfolder, even though opening a Folder
shows only its directly contained Photos.

Follows [033 - Folder area](033-folder-area.md).

## Acceptance criteria

- [ ] Every Folder tile shows its count in both Sort and Album mode, in regular
  and compact views. Empty Folders show `0`. Breadcrumbs do not get badges.
- [ ] Counts include Photos directly in the Folder and in all descendants.
  Folder boundaries are respected: `holiday` does not include `holiday-extra`.
- [ ] Each recognised Photo file counts separately, including Identical Photos.
  Counts are not Usage and do not change with unused or reviewed filters.
- [ ] The badge tooltip says "Photos in this Folder and its subfolders". Its
  meaning and count are accessible without relying on visual position.
- [ ] Counts use the latest scan results. In-app moves and copies update all
  affected Folder counts immediately after the scan state is updated; Rescan
  updates counts after outside changes.
- [ ] Files the scanner does not recognise as Photos are not counted. Existing
  scan warnings remain visible. This feature does not add a filesystem watcher.
- [ ] Badges preserve Folder opening, drop targets, menus and the Folder area's
  existing sizing and scrolling behaviour.
- [ ] Focused tests cover nested counts, empty Folders, Identical Photos,
  filter independence and updates after moves, copies and Rescan. Verify both
  display sizes and both modes.

## Design notes

- Use the shared Folder browser so the two modes cannot disagree about counts.
- A Folder with 10 direct Photos and 30 in descendants shows `40`; opening it
  still shows only its 10 direct Photos.
- No new scanning or disk traversal is needed solely to render a badge.

