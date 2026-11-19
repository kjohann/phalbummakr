# 022 – Effective Resolution warning

Status: done · Depends on: 007, 012

## What

Warn when a Photo's cropped area does not have enough pixels for its size on
the Page.

## Acceptance criteria

- [x] Calculate each placed Photo's effective resolution from its original pixel dimensions, Crop and physical Photo Slot size on the Page.
- [x] The Page Format has an Effective Resolution threshold, defaulting to 150 DPI; warn when a Photo Slot is below it.
- [x] Recalculate the warning when the Photo, Crop, Slot size, or Page Format changes.
- [x] Show the warning in the editor and before export; it does not block editing or exporting.
- [x] Warnings never appear in exported Pages.

## Decisions

- **Photo sizes come from the Library scan**, not the Album file. The Photo
  pane reports every scanned Photo's pixel size and EXIF orientation to the
  open document, so the Album schema keeps only the Photo path. Until the first
  scan has finished, and for Photos the scan doesn't know (such as Missing
  Photos), no warning is shown.
- **Threshold:** `PageFormat.minEffectiveDpi`, default 150. It is set in both
  the New Album form and Album settings ("Effective Resolution warning below
  (DPI)"). Albums saved before this field load with 150; `schemaVersion` stays
  2, like Placement `fit` in 007. A threshold of 0 or less is rejected.
- **Exactly at the threshold is not flagged**; only below it. Shown values
  are rounded down, so a flagged Photo never reads as "150 DPI, below 150 DPI".
- **Editor:** a small "!" badge in the top-right corner of the Photo Slot, with
  "Low Effective Resolution: N DPI, below T DPI" as its tooltip and accessible
  name.

## Notes

- **Core** (`core/effectiveResolution.ts`): `effectiveResolution(format, slot,
  photo)` divides the displayed Crop's pixels by the inches they cover on the
  Page, in the Slot's upright orientation. With Fit, the whole Photo covers only
  the part of the Slot given by `fitPhotoRect`. The lower of the horizontal and
  vertical values is used. `lowResolutionPlacements(album, photoSizes)` lists
  the flagged Placements with Page number and Effective Resolution.
- **Shared helpers** (`core/slots.ts`): `slotContentSizeMm` (a Slot's printed
  size, swapped for 90°/270° Slot rotation) is now used by `slotAspect`,
  `exportPlan` and Effective Resolution. `uprightPhotoSize` holds the "EXIF
  orientations 5–8 swap width and height" rule for TypeScript.
- **Recalculation:** `AlbumView` computes the warnings from the Album it shows,
  which includes in-progress Crop pans, wheel zooms and Slot resizes, so the
  badge updates during a gesture. Photo replacement, swaps, rotation and Page
  Format changes go through the same path.
- **Before export:** the Export dialog adds one line per Page, e.g. "Page 1 has
  a Photo at 60 DPI, below 150 DPI." or "Page 4 has 2 Photos below 150 DPI, the
  lowest at 97 DPI." Export stays enabled.
- **Never exported:** the badge is part of the DOM Slot overlay, not the Konva
  Page, and the off-screen export renderer (`ui/pageExport.tsx`) draws only the
  Page, so it cannot appear in an export.
- **Plumbing:** `PhotoBrowser` → `onPhotosChange` → `DocumentWorkspace`
  (`photoSizes` map) → `AlbumWorkspace` → `AlbumView` and `ExportDialog`.

## Manual check (not run)

In `tauri dev`, place a small Photo in a large Slot and check that the badge
and its tooltip look right next to the drag handle, then zoom and resize to see
it appear and disappear.

## Earlier future considerations

- **012 (duplicated sideways test):** partly resolved. `slotContentSizeMm` now
  serves `slotAspect`, `exportPlan` and Effective Resolution. `SlotFrame`,
  `rotateSlot`, `moveSlot` and the editor overlays still test
  `rotation === 90 || 270` themselves (also noted in 010 and the 010 addendum).
- **006 (orientation rule in TypeScript and Rust):** the TypeScript side now has
  one copy, `uprightPhotoSize`. Rust still has its own.
- **012 (Fit size in Rust):** still deferred. The UI now has scanned Photo
  sizes, but moving the Fit size into `exportPlan` changes the export port and
  is unrelated to this warning.
- **029 (`plural` lives in `LayoutLibraryPane`):** still open; untouched here.
- Other open points (native checks, caching, Layout duplication, flaky tests)
  are unrelated and stay deferred.

## Review

- **Spec:** no missing requirements. Fixed: the shown value was rounded while
  the check used the exact value, so 149.6 DPI read "150 DPI, below 150 DPI";
  it is now rounded down.
- **Standards:** fixed the field name `dpi` on `LowResolutionPlacement` (the
  glossary says to avoid "DPI" for Effective Resolution; it is now
  `effectiveResolution`), the second `MM_PER_INCH` (now exported once from
  `core/album.ts`), and moved `PhotoSize` to `core/photos.ts` next to `Photo`.
- **Verification:** `npm test` (294 tests), `npm run lint`, `npm run typecheck`.

## Future considerations (low priority)

- **Print settings fields (Shotgun Surgery):** the Bleed, Safe Zone, export
  resolution and threshold inputs and their `Number(form.get(...))` parsing are
  repeated in App's New Album form, AlbumWorkspace's New Album form and Album
  settings. A shared fields component and parser would make the next Page
  Format field a single edit.
- **Validation table:** `validateAlbum` decides which values must be positive
  by comparing labels; a "must be positive" column in the tuple table would be
  clearer.
- **Two migration styles:** `deserializeAlbum` fills in `minEffectiveDpi`
  before validation (validation requires it) and Placement `fit` after. Fine
  for now; worth unifying if more defaults arrive.
- **Per-Page aggregation in the UI:** `lowResolutionByPage` in `ExportDialog`
  counts flagged Photos per Page. It could join `exportWarnings` in the core,
  which would need the Photo sizes passed in.
- **Slot key string:** `AlbumView` keys warnings by `` `${pageId}:${slotId}` ``,
  matching the overlay's existing `targetId` by convention only.
- **`slotContentSizeMm` and `pageDimensions`** both return
  `{ widthMm, heightMm }` without a named type.