# Deleting Folders, preserving or recycling Photos

Supersedes the "Deleting Folders from the app" option rejected in [ADR 0003](0003-sorting-moves-photos-on-disk.md).

Real sorting leaves Folders that are no longer wanted, and having to leave the app to remove them breaks the workflow. The app can now delete Folders. An empty Folder is deleted straight away. For a Folder with content, the user chooses between keeping its Photos, which moves them flattened to the Library root with Albums updated, and sending everything to the Recycle Bin. Nothing is deleted permanently, so the reason for rejecting this in ADR 0003 no longer holds.

## Considered Options

- **Only empty Folders**: safest, but makes the user move every Photo out by hand first.
- **Deleting permanently**: rejected. The Recycle Bin keeps a way back.

## Consequences

- "Delete everything" can leave Placements pointing at Photos in the Recycle Bin. They go missing, and the dialog warns about it first.
