# 034 – Drag Selected Photos to a Folder

Status: done · Type: feature · Depends on: 028, 033

## What

Dragging moves only the dragged Photo (026). With several Selected Photos, dragging one of them should move all of them, following the same rule as right-click in the [028 addendum](028-addendum.md). Promoted from the backlog ("Drag several Photos to a Folder").

Comes from real use (inbox, Sort mode).

## Acceptance criteria

- [x] Dragging a Selected Photo from the grid, or from the Comparison, to a Folder tile or breadcrumb moves every Selected Photo.
- [x] Dragging a Photo that isn't selected moves only that Photo.
- [x] The drag image shows how many Photos are being moved when there's more than one.
- [x] A Folder already holding every dragged Photo doesn't accept the drop.

## Implementation notes

- A drag records the Photos it moves (`dragged` in `PhotoBrowser`). It follows
  the right-click rule from the [028 addendum](028-addendum.md): a chosen Photo
  takes every chosen Photo with it, and any other Photo goes on its own. A
  single shown Photo counts as chosen, so it still moves just itself.
- The chosen Photos only count in Sort mode, where they're shown. The Photo
  pane keeps its Comparison across modes, so in Album mode a grid drag always
  moves just the dragged Photo. The code review found this bug.
- Photos in Sort mode's work area (`SortView`) can now be dragged, both in a
  Comparison and when shown alone. Photos being moved can't be dragged. The
  drag carries the same Photo payload as a grid tile.
- Drop targets: a Folder accepts the drop unless it already holds every
  dragged Photo. This replaces 026's rule that the current Folder is never a
  target. Chosen Photos from other Folders can now be dropped on the current
  Folder's breadcrumb or tile, as agreed with the user. For a grid drag of one
  Photo, the current Folder is still no target.
- Drag image (`writeCountDragImage` in `photoDrag.ts`): with more than one
  Photo, a small card shows the dragged Photo's loaded picture, labelled
  "N Photos", with a stacked edge. It's built off screen and removed right
  after the browser takes its snapshot. A drag of one Photo keeps the
  browser's default drag image.

## Verification

- `PhotoBrowser.test.tsx` ("dragging chosen Photos") covers:
  - grid drags of a chosen and of an unchosen Photo;
  - Comparison drags of a chosen and of an unchosen Photo, and of a Photo
    shown on its own;
  - the "N Photos" drag image, only for more than one Photo;
  - Folders holding every dragged Photo not accepting the drop, while the
    current Folder accepts Photos from elsewhere;
  - Album mode moving only the dragged Photo.
- **Browser check:** a temporary harness, since removed, ran `PhotoBrowser`
  in Chromium with mocked Tauri calls. A real mouse drag of a chosen Photo
  from the Comparison (a `<button>`) to a Folder tile moved both chosen
  Photos. The drag image showed the Photo with "2 Photos" and was removed
  afterwards.

## Earlier considerations reviewed

- **026, `sendPhotosToFolder`/`onSendPhotos` take a list although a drag sends
  one Photo:** fully resolved. Drags now send several Photos too.
- **026, "The current Folder and the Photo's own Folder are not targets":**
  this rule is replaced by "a Folder holding every dragged Photo is no target"
  (see above). For a drag of one Photo, both rules give the same result.
- **026/028/033, native checks in `tauri dev` (WebView2):** still deferred.
  They now include dragging chosen Photos (see below).
- **026/028, `fileName`/`parentFolder` duplicated:** still deferred. This
  change added no new copies.
- **033, Data Clumps in `FolderArea`/`PhotoGrid` props:** still deferred. The
  grid's drag callbacks changed shape (`onDragStart`/`onDragEnd`), but none of
  them was added to the clump.
- Nothing in the inbox was resolved by this change.

## Future considerations (low priority)

- **Native check:** in `tauri dev` (WebView2), drag chosen Photos from the
  grid and from the Comparison to a Folder. Check that the drag image shows
  the count and that dragging a Comparison `<button>` works in WebView2.
- **Code review (Standards):** the `photoDrag.ts` naming note from
  [029](029-apply-layouts.md) still applies, now that the module also builds
  the count drag image.