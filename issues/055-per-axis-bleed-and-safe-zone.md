# 055 – Separate Bleed and Safe Zone for left/right and top/bottom

Status: done · Type: tweak · Depends on: 004, 012, 017

## What

Let the user set the Bleed and the Safe Zone separately for the left and right
edges and for the top and bottom edges of a Page. Print Providers do not always
use the same margins on both axes: an export tested in a Print Provider's editor
with a 7 mm Safe Zone barely fitted the width but had plenty of room at the top
and bottom.

## Acceptance criteria

- [x] The Page Format stores the Bleed and the Safe Zone as two values each:
  left/right and top/bottom.
- [x] The New Album form (in both places it appears) and Album settings have
  separate left/right and top/bottom fields for Bleed and Safe Zone, with the
  current defaults (3 mm Bleed, 5 mm Safe Zone) on both axes.
- [x] The left/right Safe Zone must be less than half the Page width
  (148.5 mm) and the top/bottom Safe Zone less than half the Page height
  (105 mm).
- [x] Existing Album files with a single Bleed and Safe Zone open with that
  value on both axes.
- [x] The Album and Layout canvases, the legend, Slot Bleed limits, snapping to
  the Safe Zone, smart placement, grid Layouts and Page Export all use the
  value for the matching axis.
- [x] Focused tests cover the migration, validation, per-axis Bleed limits and
  per-axis Page Export size.

## Implementation

- `PageFormat.bleedMm` and `safeZoneMm` in [album.ts](../src/core/album.ts)
  are `EdgeMargins` (`{ x, y }`; `x` is left/right, `y` is top/bottom).
  `deserializeAlbum` turns an older single number into the same value on both
  axes. The schema version is unchanged, as with the earlier
  `minEffectiveDpi` migration.
- [MarginFields](../src/ui/MarginFields.tsx) holds the four inputs and
  `readMargins` parses them; the two New Album forms and Album settings use it.
- The canvas legend shows one value when both axes match, otherwise
  "7 mm left/right, 4 mm top/bottom".
- Verification: `tsc --noEmit`, `eslint src` and `vitest run` (all pass).
  Code review found no issues.

## Earlier follow-ups and inbox

- [022](022-effective-resolution-warning.md)'s "Print settings fields" point is
  partly resolved: Bleed and Safe Zone inputs and parsing are now shared.
  Export resolution and the threshold are still repeated in the three forms;
  left deferred as unrelated to this change.
- Flagging Slots outside a reduced Bleed ([006](006-photo-slots.md)) remains
  deferred. Per-axis Bleed does not change that behaviour.
- Starter Layouts still use the default 3 mm / 5 mm margins on both axes
  ([046](046-mosaic-starter-layouts.md)); quick grids use the per-axis Safe Zone.
- No inbox notes are resolved by this change.

## Future considerations (low priority)

- Check the new fields and the per-axis guides in the native app.

