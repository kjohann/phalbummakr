# 033 – Folder area and a tidier Photo pane header

Status: todo · Type: tweak · Depends on: 027

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

- [ ] The Folders of the current Folder are shown in a Folder area above the Photo grid, not in the grid. The Folder area stays in place while the grid scrolls.
- [ ] The Folder area is only shown when the current Folder has subfolders. It is at most two rows high and scrolls on its own.
- [ ] While dragging a Photo, hovering near the top or bottom edge of the Folder area scrolls it, and hovering near the top or bottom edge of the grid scrolls the grid.
- [ ] Folder tiles in the Folder area keep their drop target, right-click menu and opening behaviour from 026 and 027. Breadcrumbs stay drop targets.
- [ ] The breadcrumbs and the Unused filter share one row. The filter is a switch labelled "All" when off and "Unused" when on, with the tooltip "Only Photos not used in this Album".
- [ ] Compact is a switch next to Rescan. It makes the Folder area compact too.
- [ ] The "Capture date · oldest first" line is removed. The order stays the same.
