# 010 – Layouts and the Layout Library

Status: todo · Depends on: 006, 009, 013, 014

## What

Turn a Page into a reusable Layout and apply Layouts to Pages.

## Acceptance criteria

- [ ] "Save as Layout" stores the Page's Slots in the Layout Library under `.phalbummakr/`. This includes geometry (including Slot orientation) and Text Slot styles, but not Photos or text content. It also records the Page's aspect ratio.
- [ ] A Layout picker shows the Layout Library with simple previews.
- [ ] Applying a Layout replaces the Page's Slots with a copy. Existing Placements and text are moved into the new Slots in order and follow each Slot's orientation; anything left over is dropped with a notice.
- [ ] The Album embeds a copy of each Layout it uses. Later edits to the Layout Library never change existing Pages.
- [ ] Applying a Layout made for a different aspect ratio shows a warning.
- [ ] Applying a Layout is a domain-core function with unit tests.
