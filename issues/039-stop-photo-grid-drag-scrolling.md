# 039 – Stop Photo-grid edge scrolling during drags

Status: done · Type: tweak · Depends on: 033

## What

The Folder area is pinned above the Photo grid, so dragging a Photo no longer
needs to scroll the grid to reach a Folder. This changes the grid edge-scrolling
behavior introduced in [033](033-folder-area.md).

## Acceptance criteria

- [x] Dragging a Photo near either edge of the Photo grid does not
  automatically scroll the grid, whether the drag starts in the grid or in
  Sort mode's work area.
- [x] The Folder area still scrolls near its edges during a Photo drag, so
  Folders beyond its first two rows remain reachable.
- [x] Normal Photo-grid scrolling and Folder and breadcrumb drop targets
  continue to work.

## Implementation notes

- The grid no longer uses the Folder area's edge-scroll handlers. Chromium also
  scrolls overflow areas during native drags, so the grid temporarily hides its
  vertical overflow while a Photo is being dragged. Its position is retained,
  and normal scrolling returns on drop, drag end or the lost-drag fallback.
- The Folder area's edge scrolling is unchanged.

## Verification

- All 49 `PhotoBrowser` tests pass, including the grid and work-area drag
  cases. Focused Album drop tests, TypeScript checking and lint also pass.
- In an Electron Chromium browser with a temporary mocked harness, a grid
  scrolled to 640 px stayed there during one-second drags at each edge. The
  Folder area scrolled both ways and accepted a grid Photo; a Comparison drag
  moved both selected Photos. An Album-mode drag retained its Photo payload,
  and wheel scrolling worked again after a drop or Escape.

## Earlier considerations reviewed

- **033, shared `edgeScroll` props:** resolved; the grid no longer takes that
  prop, leaving only `compact` and the empty-space menu shared.
- **028, arrow-key grid scrolling**, and **037, restored positions after a
  filter or resize:** still deferred; neither concerns drag-edge scrolling.
- **006/032/033/034, native drag checks:** still deferred because the browser
  harness is not WebView2 and does not use a real Library. The 033 check now
  expects the grid to stay still, while the Folder area continues to scroll.
- No inbox notes were resolved by this change.

## Code review

- Direct review found no remaining non-blocking code findings.

## Future considerations (low priority)

- Check grid and Folder-area dragging in the native WebView2 app with a real
  Library, including a drop and a cancelled drag.
