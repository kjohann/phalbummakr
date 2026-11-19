# 028 addendum – Right-click sends the chosen Photos

Status: done · Type: tweak · Addendum to [028](028-sort-mode.md)

## What

Right-click "Send to Folder ▸", including "New Folder…", moved only the Photo that was right-clicked, even when it was one of several chosen Photos in the Comparison. It should act on the chosen Photos, as file managers act on the selection.

## Acceptance criteria

- [x] Right-clicking a chosen Photo and using Send to Folder ▸, including "New Folder…", moves every chosen Photo.
- [x] Right-clicking a Photo that isn't chosen moves only that Photo.
- [x] The same rule applies when right-clicking a Photo in the grid.

## Implementation notes

- `PhotoBrowser`'s right-click menu builds Send to Folder ▸ for the chosen Photos
  (`chosenPhotos`) when the right-clicked Photo is one of them, and for that
  Photo alone otherwise. A single shown Photo counts as chosen, so it still
  sends just itself. The New Folder dialog says how many Photos it moves.
- The new test waits for the grid to be replaced after each move's rescan
  before using its tiles. Without that wait, it sometimes ran before the new
  grid had measured its size and showed no tiles.

## Earlier considerations reviewed

- None of the open points in [028](028-sort-mode.md) or earlier issues concern
  which Photos a menu acts on; they stay deferred.
