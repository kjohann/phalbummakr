# 022 – Effective Resolution warning

Status: todo · Depends on: 007, 012

## What

Warn when a Photo's cropped area does not have enough pixels for its size on
the Page.

## Acceptance criteria

- [ ] Calculate each placed Photo's effective resolution from its original pixel dimensions, Crop and physical Photo Slot size on the Page.
- [ ] The Page Format has an Effective Resolution threshold, defaulting to 150 DPI; warn when a Photo Slot is below it.
- [ ] Recalculate the warning when the Photo, Crop, Slot size, or Page Format changes.
- [ ] Show the warning in the editor and before export; it does not block editing or exporting.
- [ ] Warnings never appear in exported Pages.
