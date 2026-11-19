# 027 – Folder interactions

Status: todo · Type: feature · Depends on: 026

## What

Let the user create and rename Folders under the Library root from the Photo grid, and go back and forward through the Folders they have visited. Album mode and Sort mode each keep their own place and history, so going back in one mode never takes you to somewhere you were in the other.

## Acceptance criteria

- [ ] "New Folder…" in the Photo pane header, and on right-click of empty grid space, creates a subfolder of the current Folder, or of the root.
- [ ] "Rename…" on right-click of a folder tile renames that Folder, including everything under it. It asks for confirmation, then updates Placements in every Album directly in the Library root, as in [026](026-sorting-core.md).
- [ ] The root and protected folders (`.phalbummakr`, `Exports`, dot-folders) cannot be renamed.
- [ ] Folder names that are invalid on Windows, or that already exist in the same parent, are rejected with a clear message.
- [ ] Folders cannot be deleted from the app.
- [ ] Album mode and Sort mode each keep their own current Folder and their own back/forward history. Both start at the Library root, and switching modes returns to where you were in that mode.
- [ ] Back and Forward work with the mouse back/forward buttons anywhere in the window while the Photo pane is visible, with Alt+← / Alt+→, and with ← / → buttons next to the breadcrumbs that are disabled when there is nowhere to go. The mouse buttons never trigger the webview's own back navigation.
- [ ] History works like a web browser: opening a folder tile or a breadcrumb adds a step, opening the current Folder does not, going somewhere new after going back drops the forward steps, and the rescan fallback to a parent Folder replaces the current step.
- [ ] History holds Folders only, not shown Photos or the Comparison.
- [ ] History is kept in memory, survives mode switches and is cleared when the Library changes.
- [ ] Renaming a Folder clears the history of each mode whose history includes that Folder or anything under it. Every mode's current Folder follows the rename.
- [ ] When a rescan finds that a Folder in a mode's history no longer exists, that mode's history is cleared and its current Folder falls back to the nearest existing parent, with the existing notice. If Back or Forward reaches a missing Folder, the app rescans and falls back the same way, without an error dialog.
