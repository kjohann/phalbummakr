# 023 – Command bar and mode switch

Status: todo · Type: feature · Depends on: 016, 019, 020

## What

Replace the Album title bar and most of the native menu with a compact, context-aware command bar above the work area, and add a switch between the Album, Layouts and Sort modes.

## Acceptance criteria

- [ ] A single-row command bar replaces the Album title bar ("title · N Pages") and the Page Format line below it. It is no taller than the title bar it replaces.
- [ ] The bar has three groups: the mode switch on the left, commands for the current context in the middle, and document commands on the right. Low-priority commands move into a "⋯" overflow menu when the window is too narrow.
- [ ] The mode switch offers **Album**, **Layouts** and **Sort**. The app always starts in Album mode, and the mode is not saved in the Album file. Layouts and Sort show placeholders until [010](010-layouts.md) and [028](028-sort-mode.md) are done.
- [ ] Switching modes keeps the state of each mode, such as the current Spread and Slot selection in Album mode.
- [ ] Every mode needs an open Album. With no Album open, the bar shows only what's needed to open or create one.
- [ ] The native **File** menu stays. The Edit, Album and View menus are removed, and their commands (Delete, Album Settings…, Add Spread, Toggle Photos, Compact Photos) move into the bar with the same enabled/disabled rules and shortcuts.
- [ ] In Album mode with no Slot selected, the middle group shows Add Photo Slot and Add Text Slot.
- [ ] The Album title is shown in the window title.
