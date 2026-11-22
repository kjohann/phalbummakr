# 046 - Mosaic starter Layouts

Status: todo · Type: feature · Depends on: 045

## What

Replace equal-Slot starter Layouts with six Mosaic Layouts now that
[045 - Quick grid layout](045-quick-grid-layout.md) supplies arbitrary grids.
Keep the existing non-grid starter Layouts.

Follows [010](010-layouts.md), its [addendum](010-addendum.md), and
[029](029-apply-layouts.md).

## Acceptance criteria

- [ ] The starter set retains full bleed, one large Photo with two stacked,
  a Photo with a caption, and the title page.
- [ ] Remove all seven equal-Slot arrangements from the starter set: two side
  by side, three landscape, three portrait, 2 by 2, 2 by 2 portrait,
  2 by 3 and 3 by 3.
- [ ] Add the six compositions listed below, making ten starter Layouts in
  total. New Photo Slots are non-overlapping and unrotated, with the existing
  inset of the greater of 15 mm and the Safe Zone, and 6 mm gaps.
- [ ] Mosaic Layouts mix larger and smaller rectangular Photo Slots. Landscape
  and portrait Slot shapes are allowed; overlap, Slot rotation and automatic
  collage generation are outside scope.
- [ ] The compositions fit the open Album's Page Format and remain ordinary
  editable Layouts. They use existing card previews; descriptive labels below
  do not introduce stored Layout names.
- [ ] Libraries without a saved Layout Library receive the new starter set,
  following the existing rule of not writing seeded Layouts until needed.
- [ ] Existing saved Layout Libraries retain every existing Layout, including
  old grids and edited presets, and receive the six mosaics once. Subsequent
  opens do not append duplicates; deliberately deleted additions do not return.
- [ ] Later changes to Layouts never alter Album Pages that already copied
  their Slots. No Album rewrite is needed for this update.
- [ ] Verify the user's 2024 Album receives the refreshed starter set as
  described below, without modifying Photos or existing Page designs.
- [ ] Focused tests cover the ten starter compositions, geometry and Slot
  counts, preserving saved Layouts, adding mosaics once, keeping deleted
  additions deleted and leaving existing Album Pages unchanged.
- [ ] Inspect all six new previews and applied Pages visually.

## Six compositions

These are discussion labels, not stored Layout names:

1. **Hero + three:** a large Photo on the left and three smaller Photos stacked
   on the right.
2. **Hero above four:** a wide Photo above a row of four smaller Photos.
3. **Two heroes + three:** two larger Photos above three smaller Photos.
4. **Offset four:** tall upper-left, wide upper-right, wide lower-left and tall
   lower-right; the horizontal joins occur at different heights.
5. **Five-piece mosaic:** two stacked Photos on each side of a larger central
   Photo.
6. **Six-piece mosaic:** three columns of two Photos, with alternating split
   heights instead of aligned rows.

## 2024 Album verification

The user confirmed that the intended Album is
`C:\Users\KristianJohannessen\Documents\2024\2024.phalbum`, whose Library root
is `C:\Users\KristianJohannessen\Documents\2024`.
The initially supplied `Utvalg\Spennende opplevelser` path is a Photo subfolder,
not the Library root.

During the design discussion, this Library had no saved
`.phalbummakr\layouts.json`. After implementation, reopening the Album should
naturally seed the four retained presets and six mosaics, without old grids.
Verify current state before touching personal data. The user has authorised
removing the old grids in this specific untouched Library if a targeted refresh
is needed; do not apply that exception to other Libraries, remove edited
Layouts, or rewrite the Album unnecessarily.

No personal Album or Layout Library data was modified during specification.

