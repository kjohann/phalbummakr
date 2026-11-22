# 046 - Mosaic starter Layouts

Status: done · Type: feature · Depends on: 045

## What

Replace equal-Slot starter Layouts with six Mosaic Layouts now that
[045 - Quick grid layout](045-quick-grid-layout.md) supplies arbitrary grids.
Keep the existing non-grid starter Layouts.

Follows [010](010-layouts.md), its [addendum](010-addendum.md), and
[029](029-apply-layouts.md).

## Acceptance criteria

- [x] The starter set retains full bleed, one large Photo with two stacked,
  a Photo with a caption, and the title page.
- [x] Remove all seven equal-Slot arrangements from the starter set: two side
  by side, three landscape, three portrait, 2 by 2, 2 by 2 portrait,
  2 by 3 and 3 by 3.
- [x] Add the six compositions listed below, making ten starter Layouts in
  total. New Photo Slots are non-overlapping and unrotated, with a 15 mm inset
  and 6 mm gaps.
- [x] Starter Layouts use the default Safe Zone (5 mm) and Bleed (3 mm),
  rather than adapting to unusually large values in the Album. If Slots extend
  outside the actual Safe Zone, the existing Page guides and interaction
  behavior apply. Quick grids continue to use the Album's actual Safe Zone.
- [x] Mosaic Layouts mix larger and smaller rectangular Photo Slots. Landscape
  and portrait Slot shapes are allowed; overlap, Slot rotation and automatic
  collage generation are outside scope.
- [x] The compositions fit the open Album's Page Format and remain ordinary
  editable Layouts. They use existing card previews; descriptive labels below
  do not introduce stored Layout names.
- [x] Libraries without a saved Layout Library receive the new starter set,
  following the existing rule of not writing seeded Layouts until needed.
- [x] Existing saved Layout Libraries retain every existing Layout, including
  old grids and edited presets, and receive the six mosaics once. Subsequent
  opens do not append duplicates; deliberately deleted additions do not return.
- [x] A failed automatic migration reports the error and offers retry. If no
  user edits are pending, it does not prevent leaving the Album; pending user
  edits remain protected. A file picker returning during a save must not hide
  the save or retry controls. If migration starts while New Album settings are
  already open, the user can cancel those settings and return to the Album.
- [x] Later changes to Layouts never alter Album Pages that already copied
  their Slots. No Album rewrite is needed for this update.
- [x] Verify the user's 2024 Album receives the refreshed starter set as
  described below, without modifying Photos or existing Page designs.
- [x] Focused tests cover the ten starter compositions, geometry and Slot
  counts, preserving saved Layouts, adding mosaics once, keeping deleted
  additions deleted and leaving existing Album Pages unchanged.
- [x] Inspect all six new previews and applied Pages visually.

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

## Implementation and verification

The starter generator retains the four non-grid presets and adds the six
mosaics as ordinary Layouts. Their geometry uses the default margins even
when the Album has a larger Safe Zone or Bleed. Quick grids continue to use
the actual Safe Zone.

Saved schema-1 Layout Libraries are upgraded to schema 2 by appending the six
mosaics and autosaving once through the existing atomic-write and retry path.
Existing Layouts are preserved, including edited presets, grids and ID
collisions; later schema-2 reads do not restore deletions. Missing Libraries
remain in memory until edited. No Album file is written by the migration.

An automatic migration failure leaves navigation available when there are no
user edits, while edited Layouts remain protected until retry succeeds. The New
Album picker checks for saves that start while it is open, and its settings
can be cancelled if a migration starts later.

Focused core and workspace tests cover the compositions and their geometry,
the migration, failed-save retry and navigation, deleted additions, the
default-margin edge case and unchanged Album Pages. The six previews and
applied Pages were inspected in a temporary Chromium harness, including a
larger actual Safe Zone. A read-only check of the specified 2024 Album
confirmed its ten seeded Layouts, no saved Layout Library, and an unchanged
Album hash; no Photos were accessed or changed.

## Earlier considerations and inbox

- The starter seeding note in [010](010-layouts.md) is superseded: saved
  Libraries now migrate once, while missing Libraries still remain unwritten
  until edited. Starter margins use defaults rather than the Album's Bleed.
- The position-dependent caption tests noted in
  [010's addendum](010-addendum.md) now find the caption by its Slot types;
  composition-order tests intentionally verify the starter order.
- [022](022-effective-resolution-warning.md)'s repeated print-settings
  fields remain deferred. The default Bleed and Safe Zone values are now
  shared by the Album creation forms and starter generator.
- The possible need to flag Slots outside the Bleed from
  [006](006-photo-slots.md) remains deferred; the default full-bleed starter
  can require adjustment when an Album uses a larger Bleed.
- [029](029-apply-layouts.md)'s native Layout-drag check remains deferred;
  the visual check used the existing Apply menu in Chromium.
- Dense-Page snapping profiling from [013](013-slot-snapping.md) remains
  deferred; the grid and mosaic work does not change snapping.
- Shared Slot gesture/editor refactoring, native WebView2 checks, bundle size,
  export, caching and external-edit coordination remain outside this scope.
- No inbox notes were resolved.

## Future considerations (low priority)

- The large-grid preview finding was resolved for Page canvases in
  [045's review addendum](045-addendum.md), which records the remaining
  broader performance considerations.

