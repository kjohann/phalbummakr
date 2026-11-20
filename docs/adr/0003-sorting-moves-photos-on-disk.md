# Sorting moves Photos on disk

A Library can hold far more Photos than anyone wants to browse at once, so users need to organise candidates. Until now the app never touched Photo files. Sorting changes that: it moves Photo files between Folders under the Library root and creates or renames those Folders. When it does, it rewrites the Placement paths in every Album stored directly in the Library root, so their Photos don't go missing. Folders on disk are the only way Photos are organised, and the planned Tags are dropped. We chose this because the file system is already the source of truth for which Photos exist, and Folders stay useful outside the app.

## Considered Options

- **Tags stored in `.phalbummakr/`**: rejected because they duplicate what Folders already do, and nobody sees them outside the app.
- **Copying Photos into Folders**: rejected. Every file under the root is a Photo, so each copy would appear twice and its Usage would be split.
- **Deleting Folders from the app**: rejected because it is destructive. Folders can only be created and renamed. _Superseded by [ADR 0004](0004-deleting-folders.md)._

## Consequences

- Only Albums directly in the Library root are updated. Albums kept in subfolders, and Folders renamed outside the app, can still break Placements (see the backlog).
- Moving a Photo is not part of an Album's undo history.
