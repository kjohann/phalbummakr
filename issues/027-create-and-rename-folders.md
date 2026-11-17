# 027 – Create and rename Folders

Status: todo · Type: feature · Depends on: 026

## What

Let the user create and rename Folders under the Library root from the Folder tree.

## Acceptance criteria

- [ ] "New Folder…" creates a subfolder of the selected Folder, or of the root.
- [ ] "Rename…" renames a Folder, including everything under it. It asks for confirmation, then updates Placements in every Album directly in the Library root, as in [026](026-sorting-core.md).
- [ ] The root and protected folders (`.phalbummakr`, `Exports`, dot-folders) cannot be renamed.
- [ ] Folder names that are invalid on Windows, or that already exist in the same parent, are rejected with a clear message.
- [ ] Folders cannot be deleted from the app.
