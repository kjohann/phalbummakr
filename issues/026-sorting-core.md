# 026 – Sorting core: send Photos to a Folder

Status: todo · Type: feature · Depends on: 023

## What

Move Photo files to another Folder in the Library and keep every Album's Placements pointing at them. See [ADR 0003](../docs/adr/0003-sorting-moves-photos-on-disk.md). Photos are moved by dragging them onto Folders in the Photo grid, which replaces the Folder tree from the closed [025](025-folder-tree.md).

## Acceptance criteria

- [ ] In Album mode and Sort mode, dragging a Photo from the grid onto a folder tile or a breadcrumb segment, including "Library", moves that Photo to the Folder. Only the dragged Photo moves. Dropping it on a Page still places it.
- [ ] While a Photo is dragged, every valid target has a dashed outline and the target under the pointer is highlighted. The current Folder and the Photo's own Folder are not targets. Outside a drag, folder tiles and breadcrumbs look as before.
- [ ] Sending Photos to a Folder moves their files on disk. Nothing is copied.
- [ ] If a file with the same name already exists in the target Folder, the moved Photo gets a suffix, such as `IMG_0012 (2).jpg`, without asking.
- [ ] Placements of a moved Photo are updated in every Album file directly in the Library root, including the open Album. If any Album can't be updated, the move is cancelled and the files are left where they were.
- [ ] The Photo grid and Usage counts reflect the new location without reopening the Album.
- [ ] Moves are not part of undo, and single moves are not confirmed.
- [ ] Protected folders (`.phalbummakr`, `Exports`, dot-folders) can never be a target.
- [ ] Planning the move, including name suffixes and Placement path changes, is a domain-core function with unit tests.
