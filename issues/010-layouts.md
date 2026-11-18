# 010 – Layouts, the Layout Library and Layout mode

Status: done · Depends on: 006, 009, 013, 014, 023, 024

## What

Create and edit Layouts in a dedicated Layout mode. Applying Layouts to Pages in Album mode is [029](029-apply-layouts.md).

Follow-up feedback: [010 addendum](010-addendum.md).

## Acceptance criteria

- [x] The Layout Library belongs to the Library and is stored under `.phalbummakr/`. Every Album in the Library shares it.
- [x] In Layout mode, the Photo pane lists the Layout Library with simple previews, and the work area shows a single canvas for the selected Layout.
- [x] The canvas has the open Album's Page Format aspect ratio and shows Bleed and Safe Zone. It never holds Photos or text content: Photo Slots are empty, and Text Slots show only their style with sample text.
- [x] Photo Slots and Text Slots can be added, moved, resized, snapped, rotated and deleted on the canvas with the same tools as in Album mode ([024](024-slot-tools-in-command-bar.md)).
- [x] The command bar offers New, Duplicate and Delete for Layouts. Deleting asks for confirmation. A Layout records its geometry, Slot orientation, Text Slot styles and the aspect ratio of the canvas it was made on.
- [x] Layouts have no names: the preview in the Layout Library identifies each one.
- [x] A Library without a Layout Library starts with predefined Layouts: full bleed, two Photos side by side, one large Photo with two stacked, three columns, 2×2, 2×3 and 3×3 grids, a Photo with a caption, and a title page. They are seeded once and are then ordinary Layouts that can be edited and deleted. Deleted ones do not come back.
- [x] Layout edits are saved automatically. Editing a Layout never changes Pages it was already applied to.
- [x] Applying a Layout to a Page is a domain-core function with unit tests. It replaces the Page's Slots with a copy, moves Placements and text into the new Slots in order following each Slot's orientation, drops leftovers with a notice, and reports when the Layout was made for a different aspect ratio.

## Notes

- **Domain core:** [`src/core/layouts.ts`](../src/core/layouts.ts).
  - A `Layout` is `{ id, aspectRatio, slots }`. Slots are ordinary Slots
    that never hold content: Photo Slots have `placement: null` and Text
    Slots have `text: ""`. The Layout Library file is
    `{ schemaVersion: 1, layouts }`.
  - `newLayout`, `duplicateLayout` (inserts the copy after the original),
    `deleteLayout` and `setLayoutSlots` (strips content).
  - Editing a Layout records the aspect ratio of the canvas it was edited
    on. A code review found that a Layout edited on another canvas
    otherwise kept a stale ratio.
  - `readLayoutLibrary(null, format)` seeds `predefinedLayoutLibrary`.
- **Predefined Layouts:** they are designed in millimetres on the open
  Album's Page Format.
  - Content is inset by `max(15 mm, Safe Zone)`, with 6 mm gaps.
  - Full bleed extends out to the Album's Bleed.
  - The ids are `predefined-1` to `predefined-9`. New and duplicated
    Layouts get `layout-<uuid>`, so an id is never reused after a
    deletion.
- **`applyLayout(album, pageId, layout)`** returns
  `{ album, dropped: { placements, texts }, aspectMismatch }`.
  - Placements move into the Layout's Photo Slots in Page order, and
    non-blank text into its Text Slots, which take the Layout's style.
  - Each Placement is refitted with `refitPlacement` (now exported) to its
    new Slot's content aspect, keeping the Slot's rotation. This differs
    from placing a new Photo from the Library, which turns the Slot
    upright (014 addendum).
  - The ratio check is shared as `madeForOtherAspectRatio`.
  - 029 adds the UI that applies a Layout and shows the notices.
- **Storage:** [`src-tauri/src/layouts.rs`](../src-tauri/src/layouts.rs)
  reads and writes `<Library>/.phalbummakr/layouts.json`. Commands:
  `read_layout_library` (returns `null` when missing) and
  `write_layout_library`.
  - Writes are atomic, through a temporary file.
  - The folder is created on the first write only. A seeded Library is
    not written until it is edited, as ADR 0001 asks.
- **UI:** [`LayoutWorkspace`](../src/ui/LayoutWorkspace.tsx).
  - It loads the Layout Library the first time Layout mode opens. After
    that it stays mounted but hidden, like Album mode.
  - It portals the Layout cards (SVG previews) into the left pane. The
    Photo browser is hidden, not unmounted, in that mode.
  - It edits the selected Layout on one canvas, as a one-Page Album, so
    every Slot operation, `applySlotDrag` and snapping are shared with
    Album mode.
  - It autosaves after 500 ms, as Albums do.
  - Text Slots render "Sample text" in their style. Photo Slot tools hide
    Fit and Zoom (`content={false}`).
  - Slot deletion follows the "Confirm Slot deletion" preference. Delete
    Layout always asks.
- **Shared canvas parts:** `applySlotDrag`, `LayerPage`, `TextContent` and
  `SnapGuides` moved from `AlbumView` to
  [`pageCanvas.tsx`](../src/ui/pageCanvas.tsx). All 83 AlbumWorkspace tests
  pass unchanged.
- **Command bar:** in Layout mode it shows Add Photo Slot, Add Text Slot,
  New Layout, Duplicate Layout and Delete Layout. The selected Slot's tools
  replace the two Add commands.
  - Layout commands travel on their own `LayoutBarLink`, so Album mode
    never receives them.
  - A pending Layout save counts as busy, so File commands wait for it.
- **Tests:**
  - core `layouts.test.ts`: library, seeding, validation and apply
  - Rust `layouts.rs`
  - `LayoutWorkspace.test.tsx`: list, seeding without a write, New and
    adding Slots, Duplicate and Delete with confirmation, moving Slots,
    tools, the inactive mode
  - `App.test.tsx`: routing, pane contents, busy
- **Browser check:** a temporary harness (removed) showed the cards, the
  canvas with Bleed and Safe Zone, sample text and the Slot tools.

## Earlier considerations reviewed

- **014 and the 014 addendum:** resolved at the core seam. The criterion
  "Saving and applying a Layout preserves each Slot's orientation…" was
  deferred to 010. Saving keeps each Slot's `rotation`, and `applyLayout`
  turns transferred content with its new Slot. The test is "fits each Photo
  to the orientation of its new Slot". Transfer stays separate from placing
  a new Photo from the Library. The UI that applies a Layout end to end
  belongs to 029.
- **024:** resolved. `PhotoSlotTools`' `content` prop is now used in Layout
  mode.
- **023 addendum and 020:** the "Photo pane" naming stays deferred. The
  pane now also lists Layouts, and its resizer is still labelled "Resize
  Photos". Renaming touches the persisted `photoPane` setting in
  `settings.json` and the Rust settings, so do it together with 025.
- **023:** the placeholder for Layouts is gone. The one for Sort remains
  until 028.
- Other open points (WebView2 smoke tests, bundle splitting,
  filesystem-aware Usage, preview caches) are unrelated to Layouts and stay
  deferred.

## Future considerations (low priority)

- **Duplicated code (code review, Standards):** `LayoutWorkspace` repeats
  some of `AlbumView`'s Slot interaction code:
  - the window listeners for Slot drags
  - the Slot-delete confirmation
  - Ctrl+B/I/U, the Delete key and font loading
  - the overlay and context-menu markup

  A shared hook or Slot-overlay component would keep the two modes in step.
  That refactor touches the large `AlbumView`, so it is left for 011, which
  reworks deletion confirmations anyway.
- **Judgement calls left (code review, Standards):**
  - `exactRecord` is duplicated across core modules.
  - `SnapGuides` takes four trim numbers, where one `Rectangle` would do.
  - `rotation === 90 || rotation === 270` recurs. An `isSideways` helper
    would replace it.
  - `setTextStyle` takes a full style, so callers merge partial styles.
  - `layoutAlbum` builds a fake Album with `schemaVersion: 2` to reuse the
    Slot operations.
- **Seeding (code review, Spec):** until the first edit, the predefined
  Layouts are rebuilt from the open Album's Page Format, including its
  Bleed for full bleed. Once anything is edited, the Library is stored and
  stays fixed.
- **Aspect-ratio notices:** the "Other aspect ratio" badge on cards and the
  banner above the canvas go slightly beyond the spec. They are kept
  because only A4 landscape exists today, so they rarely show.
- **Native check:** check Layout mode by eye in `tauri dev`, including the
  pane cards at the 200 px minimum width and Slot dragging in WebView2.
- **Undo:** each Layout has no undo history until 011.

