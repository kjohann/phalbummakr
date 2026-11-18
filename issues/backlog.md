# Backlog (after the MVP)

Decided in the design session but deliberately left out of the MVP. Promote an item to a numbered issue when it's picked up.

## Library and Photos

- **Albums in subfolders**: an Album file in a subfolder has its own nested Library. Sorting and Folder renames only update Albums directly in the Library root, so such Albums can break.
- **Repair after outside changes**: Folders or Photos renamed or moved outside the app break Placements. Offer a repair or relink function that finds them again.
- **Missing Photos**: mark Placements whose file is gone and relink them by hand, with a match suggested from file name and capture date.
- **Drag several Photos to a Folder**: dragging moves only the dragged Photo (026). Moving several at once is done with "Send to Folder ▸" in Sort mode (028).
- **Usage in other Albums**, shown in the Photo's details (nice to have).
- **HEIC support**, only if the app is published.

## Editing

- **Single-Page focus view**: show one Page at a time, larger, for focused editing.
- **Mouse-wheel and pinch zoom** of a Photo's Crop, removed in 019 in favour of the Zoom buttons.
- **Photo rotation within a fixed Slot** in 90° steps. Free rotation is something to explore later.
- **Resize Slots from every corner**: today a Slot can only be resized from its bottom-right handle.
- **Alt-drag to duplicate a Slot**, as in Miro and FigJam: holding Alt while dragging leaves the original in place and drops a copy. Alt currently turns snapping off during a drag (013), so the two need a different split of modifiers.
- **Move several Slots together**: select several Slots on a Page and move them as a group. Mixed selections of Photo Slots and Text Slots need thought: which Slot tools still apply, and how snapping and rotation behave for a group.
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
