# 010 – Layouts, the Layout Library and Layout mode

Status: todo · Depends on: 006, 009, 013, 014, 023, 024

## What

Create and edit Layouts in a dedicated Layout mode. Applying Layouts to Pages in Album mode is [029](029-apply-layouts.md).

## Acceptance criteria

- [ ] The Layout Library belongs to the Library and is stored under `.phalbummakr/`. Every Album in the Library shares it.
- [ ] In Layout mode, the Photo pane lists the Layout Library with simple previews, and the work area shows a single canvas for the selected Layout.
- [ ] The canvas has the open Album's Page Format aspect ratio and shows Bleed and Safe Zone. It never holds Photos or text content: Photo Slots are empty, and Text Slots show only their style with sample text.
- [ ] Photo Slots and Text Slots can be added, moved, resized, snapped, rotated and deleted on the canvas with the same tools as in Album mode ([024](024-slot-tools-in-command-bar.md)).
- [ ] The command bar offers New, Duplicate, Rename and Delete for Layouts. A Layout records its geometry, Slot orientation, Text Slot styles and the aspect ratio of the canvas it was made on.
- [ ] Layout edits are saved automatically. Editing a Layout never changes Pages it was already applied to.
- [ ] Applying a Layout to a Page is a domain-core function with unit tests. It replaces the Page's Slots with a copy, moves Placements and text into the new Slots in order following each Slot's orientation, drops leftovers with a notice, and reports when the Layout was made for a different aspect ratio.
