# 036 – Delete Folders

Status: todo · Type: feature · Depends on: 027

## What

Folders can be created and renamed, but not deleted. Allow deleting a Folder, letting the user keep its Photos or send everything to the Recycle Bin. See [ADR 0004](../docs/adr/0004-deleting-folders.md).

Comes from real use (inbox, Sort mode).

## Acceptance criteria

- [ ] Right-clicking a Folder tile or breadcrumb offers "Delete Folder…". Protected Folders, such as the Albums folder and the Library root, can't be deleted.
- [ ] An empty Folder is deleted straight away.
- [ ] A Folder with content asks first, with three options: **Keep Photos**, **Delete everything** and **Cancel** (the default).
- [ ] **Keep Photos** moves every Photo in the Folder and its subfolders, flattened, to the Library root, then deletes the Folder. Name clashes get a " (2)" suffix (" (3)" and so on). Albums are updated as for any move.
- [ ] **Delete everything** sends the Folder and its contents to the Recycle Bin. If Photos in it are used in Albums, the dialog warns first, for example "12 Photos are used in Albums and will go missing".
- [ ] Files that aren't Photos go to the Recycle Bin with either option, and the dialog says how many there are.
- [ ] Deleting the Folder you're in takes you to its parent.
- [ ] The Rust side checks again that the Folder is under the Library root and isn't protected.
