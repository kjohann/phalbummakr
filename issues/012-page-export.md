# 012 – Page Export

Status: done · Depends on: 007, 009, 017

## What

Export every Page as a print-ready image to upload to a Print Provider as full-page photos.

## Acceptance criteria

- [x] Export renders each Page with the **same renderer** as the editor, at the Page Format's resolution and including the Bleed ([ADR 0002](../docs/adr/0002-tauri-with-ui-side-rendering.md)).
- [x] Originals, not previews, are decoded for export, with EXIF orientation respected.
- [x] The output is JPEG in sRGB at quality 95 or higher, with no chroma subsampling, written to `Exports/<Album name>/` as `001.jpg`, `002.jpg` and so on in Page order.
- [x] Photo scaling uses a high-quality resampling method when converting originals to Page resolution.
- [x] Inside Covers are never exported; output contains only the Album's Pages.
- [x] Guides, warnings and selection outlines never appear in exports.
- [x] A progress indicator is shown, and the UI stays responsive during export.
- [x] Before export, the tool warns about empty Photo Slots and Pages.
- [ ] Manual check: an exported Page matches the editor view by eye at 100% zoom.

## Decisions

- `<Album name>` is the Album file's name without its extension. The title is
  free text and need not be unique, while the file name is unique and safe as a
  folder name.
- Exporting again first removes earlier Page files (`NNN.jpg`, three or more
  digits) from `Exports/<Album name>/`, so an Album with fewer Pages leaves no
  stale files to upload. Other files in the folder are kept.
- Missing Photos stop the export before the folder is touched, so an earlier
  export is never lost to a failed one.

## Notes

- **Command:** *Export Pages…* in the command bar's right-hand group opens a
  dialog that names the destination and lists empty Pages (nothing that prints:
  no placed Photo and no text) and empty Photo Slots on the other Pages. During
  export it shows a progress bar, "Exporting Page N of M…" and Cancel, which
  stops before the next Page. The dialog exports the Album as it was when the
  command was chosen.
- **Core** (`core/pageExport.ts`): `exportPageSize` (trim plus Bleed at the
  Page Format's DPI, e.g. 3579 × 2551 px for A4 with 3 mm Bleed at 300 DPI),
  `exportWarnings` and `exportPlan` (file names in Page order and the pixel box
  each Placement fills, swapped for 90°/270° Slot rotation).
- **Renderer:** `SlotFrame` and `PhotoImage` moved into `ui/pageCanvas.tsx` and
  are shared by the editor, the strip previews and export, together with
  `TextContent` (placeholders off). `ui/pageExport.tsx` mounts the Page off
  screen on a white background with no guides, outlines or warnings, draws the
  layer once at pixel ratio 1 and reads its pixels.
- **Rust** (`exports.rs`): `export_photo` decodes the upright original
  (`photos::upright_original`, EXIF orientation applied), crops it and
  resamples it with Lanczos3 to the Slot's pixel box, returned as raw RGBA.
  `write_export_page` takes the Page's pixels as a raw IPC body and writes a
  quality 95, 4:4:4 JPEG with JFIF density set to the Page Format's DPI, via a
  temporary file. `missing_photos` and `prepare_export` back the decisions above.
- **Checked in the app:** an 8-Page Album exported to `Exports/Test004-1/`
  (3579 × 2551 px, 300 DPI, 4:4:4 sampling). Page 1 matched the editor's layout,
  crops, Fit and text placement at overview scale; the 100% zoom check is left
  to the user.
- **Related fix:** the "Saved Page N as a new Layout." notice is now also hidden
  during render when the Layout Library save has failed. Previously it was only
  cleared by an effect, and the extra rendering from this change made
  `AlbumWorkspace.test.tsx` see the stale notice next to the failure alert.

## Earlier future considerations

- **009, 009 addendum, 014 and 024 (missing-font warnings):** still deferred.
  Export renders on the machine that edits the Album, with the same fonts as the
  editor, so it cannot differ from what is shown. The warning belongs with Album
  portability, not export.
- **010 addendum (placeholders never printed):** resolved; export passes
  `showPlaceholder={false}`.
- **017 (Inside Covers never exported):** resolved by construction; only
  `album.pages` are exported.
- **029 (`plural` lives in `LayoutLibraryPane`):** still open; the export dialog
  now also uses it.

## Future considerations (low priority)

- **Colour management:** originals with an embedded non-sRGB profile (Display P3,
  Adobe RGB) are not converted to sRGB, in export or in editor previews. Convert
  in `upright_original` and the preview pipeline, e.g. with `lcms2`.
- **Speed:** a Page takes about 4–5 s in the dev build. A Photo used on several
  Pages is decoded again for each Placement, and `image`'s Lanczos3 resize is
  slow on 12 MP originals. Consider caching decoded originals during an export
  or a faster resizer.
- **Fit size in Rust (Standards review):** for Fit, Rust chooses the resampled
  size from the Photo's aspect ratio, a small copy of `fitPhotoRect`. Placement
  inside the Slot is still decided by `fitPhotoRect` in `PhotoImage`. Moving it
  to the core needs the Photo's size before export.
- **Binary formats (Standards review):** the photo (`u32` width, `u32` height,
  RGBA) and Page (`u32` header length, JSON header, RGBA) IPC layouts are
  written by hand on both sides; consider one documented module per side.
- **Module layout (Standards review):** `ui/pageExport.tsx` holds the ports
  interface, the export loop, the off-screen renderer and the Tauri adapter.
  Other ports put the interface in the core and the adapter in `tauri*Ports.ts`.
- **Duplicated sideways test (Standards review):** `rotation === 90 || 270`
  appears in `core/slots.ts`, `core/pageExport.ts` and `SlotFrame`; a core helper
  for a Slot's upright size would remove the copies.
- **Sub-pixel placement:** Slot edges are not snapped to whole pixels, so a
  resampled Photo drawn at a fractional offset is filtered once more by the
  canvas. This is invisible in print, but snapping the export box would keep
  originals crisper.
