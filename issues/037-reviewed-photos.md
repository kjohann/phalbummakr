# 037 – Reviewed Photos and remembered position

Status: todo · Type: feature · Depends on: 028

## What

Sorting a large Folder can take several evenings, and Photos you've looked at but not sent anywhere stay where they are. The next evening, you need to know where you stopped. Mark Reviewed Photos (see [GLOSSARY.md](../GLOSSARY.md)), and remember where you were in each Folder.

Example: 1000 Photos at the Library root. After one evening, 200 have been looked at, 80 sent to a Folder, and 120 left at the root on purpose.

Comes from real use (inbox, Sort mode, the "checkpoint" idea).

## Acceptance criteria

- [ ] A Photo shown in the work area, alone or in a Comparison, becomes a Reviewed Photo.
- [ ] Right-clicking a Photo offers "Mark as reviewed" or "Mark as unreviewed". It acts on the Selected Photos when the right-clicked Photo is one of them, and on that Photo alone otherwise.
- [ ] Right-clicking a grid tile offers "Mark all up to here as reviewed", which marks it and every Photo before it in the grid.
- [ ] In Sort mode, Reviewed Photos have a subtle mark on their grid tile. Other modes don't show it.
- [ ] Reviewed marks are stored per Library in `.phalbummakr/` and survive restarts.
- [ ] Moving a Photo in the app, or renaming its Folder, keeps its mark. Changes made outside the app may lose it.
- [ ] Opening a Folder again, including after a restart, restores its last scroll position and last shown Photo (best effort).
- [ ] There's no filter for Reviewed Photos.
