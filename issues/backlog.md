# Backlog (after the MVP)

Decided in the design session but deliberately left out of the MVP. Promote an item to a numbered issue when it's picked up.

## Library and Photos

- **Albums in subfolders**: an Album file in a subfolder has its own nested Library. Sorting and Folder renames only update Albums directly in the Library root, so such Albums can break.
- **Repair after outside changes**: Folders or Photos renamed or moved outside the app break Placements. Offer a repair or relink function that finds them again.
- **Missing Photos**: mark Placements whose file is gone and relink them by hand, with a match suggested from file name and capture date.
- **Usage in other Albums**, shown in the Photo's details (nice to have).
- **Redesign the "already in the Album" warning**: the warning that pops up when a Photo already used in the Album is placed again is annoying, and it makes the whole Spread jitter. Find a less intrusive design.
- **Locate where a Photo is used**: the usage badge shows that a Photo is used but not where. Explore highlighting the Slots that use it and/or a tooltip listing the Pages it's used on.
- **HEIC support**, only if the app is published.

## Editing

- **Single-Page focus view**: show one Page at a time, larger, for focused editing.
- **Mouse-wheel and pinch zoom** of a Photo's Crop, removed in 019 in favour of the Zoom buttons.
- **Photo rotation within a fixed Slot** in 90° steps. Free rotation is something to explore later.
- **Move a Slot between Pages in a Spread**: drag a Slot across the gutter to the facing Page. Scoped in closed [021](021-move-slot-between-pages.md); a new issue should follow it and can reuse its acceptance criteria.
- **More for Selected Slots** (follows [054](054-move-selected-slots-together.md)): Selected Slots in Layout mode; Ctrl+A and drag-to-select a region; copy/paste, Alt-drag duplicate, rotate and resize for a whole selection.
- **Clear a Photo Slot**: pressing Delete with a Photo Slot selected removes the whole Slot. Add a way to remove just the Photo and keep the empty Slot.
- **Snap to matching distances**: beyond the Equal gap guides from 013, help place Slots at the same distance from the Page's edges as other Slots, for example mirrored at opposite sides of a Page, and help build evenly spaced grids.

## Album and output

- **Page Format Presets** in the Library, with page-count rules (minimum, maximum, even).
- **Reflow**: change the Page Format, keep Slot fractions, re-centre Crops and flag changed Pages for review.
- **Duplicate Album**.

## Out of scope for now

- Covers and spines
- Backgrounds other than white
- Clip-art, stickers and shapes
- macOS
- Getting Photos onto disk (Google Takeout and similar)
