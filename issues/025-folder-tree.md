# 025 – Folder tree in the Photo pane

Status: closed · Type: feature · Depends on: 023

## Close reason

Closed without implementation. A separate Folder tree above the Photo grid is not
wanted: the inline folder tiles and breadcrumbs from [003](003-browse-photos.md)
stay the way to browse Folders, and the grid keeps showing only the Photos
directly in the current Folder. The rest of the scope is either done or moved:

- The same Photo pane is already used in Album mode and Sort mode, and the scan
  already hides `.phalbummakr`, `Exports` and dot-folders.
- Dropping Photos on Folders moved to [026](026-sorting-core.md), using folder
  tiles and breadcrumbs as drop targets in both modes. This replaces "dragging a
  Photo always means placing it" in Album mode.
- The Photos | Layouts tab moved to [029](029-apply-layouts.md). So did the
  deferred "Photo pane" rename (see [010](010-layouts.md) and the
  [023 addendum](023-addendum.md)), which was to be done with 025.
- Folders elsewhere in the Library are reached through "Send to Folder ▸" in
  [028](028-sort-mode.md).

## What

Show the Library's Folders as a tree in the Photo pane and filter the Photo grid by Folder.

## Acceptance criteria

- [ ] The Photo pane shows a Folder tree above the Photo grid, with the Library root at the top. It is read from disk.
- [ ] Selecting a Folder shows its Photos, including those in its subfolders. Selecting the root shows every Photo.
- [ ] The tree hides the same folders as the Photo scan: `.phalbummakr`, `Exports` and folders whose names start with a dot.
- [ ] The same Photo pane is used in Album mode and Sort mode. In Album mode, dragging a Photo always means placing it.
- [ ] In Album mode, the pane has a Photos | Layouts tab. The Layouts tab shows a placeholder until [029](029-apply-layouts.md).
