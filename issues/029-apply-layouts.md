# 029 – Applying Layouts in Album mode

Status: todo · Type: feature · Depends on: 010, 025

## What

Apply Layouts from the Layout Library to Pages, and save a Page as a new Layout, without leaving Album mode.

## Acceptance criteria

- [ ] The Layouts tab of the Photo pane lists the Layout Library with previews.
- [ ] Dragging a Layout onto a Page applies it to that Page.
- [ ] Right-clicking a Layout offers "Apply to left Page" and "Apply to right Page" for the current Spread. Only the option for the real Page is offered on Spreads that include an Inside Cover.
- [ ] Applying uses the domain-core apply function from [010](010-layouts.md): Placements and text move into the new Slots in order, leftovers are dropped with a notice, and a different aspect ratio shows a warning.
- [ ] "Save as Layout" in the command bar stores the current Page's Slots as a new Layout, keeping geometry, orientation and Text Slot styles but no Photos or text.
- [ ] The Album embeds a copy of each Layout it uses. Later edits to the Layout Library never change existing Pages.
