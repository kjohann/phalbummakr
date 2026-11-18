# 028 – Sort mode

Status: todo · Type: feature · Depends on: 023, 026

## What

A mode for looking at Photos large, comparing up to four and sending the chosen ones to a Folder. The work area shows Photos instead of Spreads, and the Photo pane shows only Photos.

## Acceptance criteria

- [ ] Clicking a Photo in the grid shows it large in the work area. With a single Photo shown, the left and right arrow keys step through the grid.
- [ ] Ctrl-click, or "Add to Comparison" on right-click, adds a Photo to a Comparison of up to four Photos shown side by side (2×2 for four). Ctrl-click again, or "Remove from Comparison", removes it.
- [ ] Clicking a Photo in the Comparison chooses or unchooses it. A single shown Photo counts as chosen.
- [ ] "Send to Folder…" in the command bar moves the chosen Photos, using [026](026-sorting-core.md). It is disabled when no Photo is chosen.
- [ ] Right-clicking a Photo in the grid offers Show, Add to Comparison / Remove from Comparison and Send to Folder ▸. In the Comparison, it offers Choose / Unchoose, Remove from Comparison and Send to Folder ▸.
- [ ] Send to Folder ▸ is a nested submenu that mirrors the Folder hierarchy, plus "New Folder…", which creates the Folder and moves the Photos into it.
- [ ] Dragging a Photo onto a folder tile or breadcrumb works in Sort mode as described in [026](026-sorting-core.md).
- [ ] Moved Photos leave the Comparison. When only one Photo was shown, the next Photo in the grid appears.
- [ ] The large view shows the Photo's Usage badge.
