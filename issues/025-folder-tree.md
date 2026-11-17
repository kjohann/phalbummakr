# 025 – Folder tree in the Photo pane

Status: todo · Type: feature · Depends on: 023

## What

Show the Library's Folders as a tree in the Photo pane and filter the Photo grid by Folder.

## Acceptance criteria

- [ ] The Photo pane shows a Folder tree above the Photo grid, with the Library root at the top. It is read from disk.
- [ ] Selecting a Folder shows its Photos, including those in its subfolders. Selecting the root shows every Photo.
- [ ] The tree hides the same folders as the Photo scan: `.phalbummakr`, `Exports` and folders whose names start with a dot.
- [ ] The same Photo pane is used in Album mode and Sort mode. In Album mode, dragging a Photo always means placing it.
- [ ] In Album mode, the pane has a Photos | Layouts tab. The Layouts tab shows a placeholder until [029](029-apply-layouts.md).
