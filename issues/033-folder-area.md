# 033 – Folder area and a tidier Photo pane header

Status: done · Type: tweak · Depends on: 027

## What

Folder tiles sit inside the scrolling Photo grid. Once you've scrolled down, there's no easy way to drag a Photo to a Folder. Move the Folders into a pinned Folder area above the grid, and tidy up the pane's header around it. This applies in every mode, since the Photo pane is shared.

Comes from real use (inbox, Sort mode).

```
[Rescan] [Compact ⟷]
Library › 2024 › grandparents        [ All ⟷ Unused ]
┌ Folder area (pinned, 1–2 rows, scrolls inside) ┐
└─────────────────────────────────────────────────┘
Photo grid
```

## Acceptance criteria

- [x] The Folders of the current Folder are shown in a Folder area above the Photo grid, not in the grid. The Folder area stays in place while the grid scrolls.
- [x] The Folder area is only shown when the current Folder has subfolders. It is at most two rows high and scrolls on its own.
- [x] While dragging a Photo, hovering near the top or bottom edge of the Folder area scrolls it, and hovering near the top or bottom edge of the grid scrolls the grid.
- [x] Folder tiles in the Folder area keep their drop target, right-click menu and opening behaviour from 026 and 027. Breadcrumbs stay drop targets.
- [x] The breadcrumbs and the Unused filter share one row. The filter is a switch labelled "All" when off and "Unused" when on, with the tooltip "Only Photos not used in this Album".
- [x] Compact is a switch next to Rescan. It makes the Folder area compact too.
- [x] The "Capture date · oldest first" line is removed. The order stays the same.

## Decisions made during implementation

- The grid's list is now named "Photos" and the Folder area's list "Folders".
- The filter switch's accessible name follows its visible label ("All" or
  "Unused"). The tooltip is its description.
- Regular folder tiles in the Folder area are shorter than Photo tiles: a
  64 px icon box with the name, and no "Folder" label. Two rows are 192 px;
  compact rows are 68 px (136 px for two). The columns line up with the
  grid's.
- The Folder area sits right under the breadcrumbs row, above the status
  messages, so a move message never shifts the Folders under the pointer.
- Edge scrolling (`useEdgeScroll` in `src/ui/edgeScroll.ts`) runs for any
  Photo drag. The closer to the edge, the faster it goes. It stops when the
  pointer leaves the edge zone or the area, or on drop, or when dragover
  stops arriving.

## Verification

- `PhotoBrowser.test.tsx` covers:
  - the Folder area apart from the grid, and hidden without subfolders;
  - its two-row max height in both sizes;
  - edge scrolling of both areas with a simulated dragover;
  - both switches;
  - the removed order line.
- **Browser check:** a temporary harness, since removed, ran `PhotoBrowser`
  in Chromium with mocked Tauri calls. It showed the pinned Folder area and
  that the columns line up. Real mouse drags scrolled the Folder area and the
  grid down and up, and scrolling stopped in the middle. Compact gave a
  136 px Folder area.

## Earlier considerations reviewed

- **028, grid scrolling with the arrow keys:** still deferred. Unrelated to
  the Folder area.
- **026/027/028/032, native checks in `tauri dev`:** still deferred. They now
  include this issue (see below).
- **020, `compact` checked in several places:** still deferred. Compact now
  also picks the Folder area's row height, from the same `GRID` entry.
- Nothing in the inbox was resolved by this change.

## Future considerations (low priority)

- **Native check:** in `tauri dev` (WebView2), drag a Photo to the edges of
  the Folder area and the grid. Check the scroll speed, and that scrolling
  stops after the drop. WebView2's dragover rate while the pointer rests may
  differ from Chromium's.
- **Code review (Standards), judgement call left:** `compact`,
  `onSpaceContextMenu` and `edgeScroll` travel together into both
  `FolderArea` and `PhotoGrid` (Data Clumps). Minor; bundle them if more
  shared props appear.
- The filter switch's name changes with its state, as the issue asks. Screen
  readers announce "All, switch, off" and "Unused, switch, on". If that reads
  poorly, a stable name such as "Only unused Photos" would be the
  alternative.