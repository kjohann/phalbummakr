# 017 – Book structure with Inside Covers

Status: done · Depends on: 016

## What

Every Album has the shape of a bound book: the first Spread pairs the front Inside Cover with Page 1, the last Spread pairs the final Page with the back Inside Cover, and every Spread in between holds two Pages.

## Acceptance criteria

- [x] The first Spread shows the front Inside Cover on the left and Page 1 on the right.
- [x] The last Spread shows the final Page on the left and the back Inside Cover on the right.
- [x] Inside Covers are shown greyed out. They cannot be selected, hold no Slots, accept no dropped Photos and are never exported.
- [x] An Album always has an even number of Pages, at least 2. New Albums start with 2 Pages unless a larger even count is chosen.
- [x] Opening an Album with an odd Page count fails with a clear message.
- [x] The Page 1 side setting is removed from New Album and Album Settings, and `startingSide` is removed from the file format.
- [x] The existing add control inserts two empty Pages after the selected Spread, or before the last Spread when it is selected.
- [x] Existing Duplicate Page inserts a new Spread at the same position, with a copy on the original Page's side and an empty sibling.
- [x] Deleting a Page in a middle Spread deletes it and its Spread sibling; deleting the first or last Page clears its Slots instead of removing the Page. Confirm destructive deletion with the affected Page numbers.

## Converting existing Albums by hand

For each Album converted in [016](016-album-file.md):

1. Remove the `startingSide` field and apply any other format change made in this issue.
2. If the Album has an odd number of Pages, add an empty Page to the end of `pages`, for example `{ "id": "page-99", "background": "#ffffff", "slots": [] }` with an unused id.

Page sides may change for Albums that used a left starting side. Check those Albums after converting.

## Implementation and review

- Inside Covers are display-only placeholders, not stored Pages. Page Export is
  not implemented yet; [012](012-page-export.md) explicitly excludes Covers.
- Existing controls insert and duplicate into new Spreads, confirm deletion of
  both middle Pages, and clear rather than remove the end Pages.
- Direct standards and spec review against `2b5431b` found one error-reporting
  gap for odd, unconverted Albums; validation now reports the Page count.
- Core and workspace tests cover pairing, count validation, file opening, both
  Cover interactions, Spread operations, confirmation and persistence.

## Earlier considerations reviewed

- 002's Library restoration and marker concerns remain resolved by 016.
- The native WebView2 checks from 005–016 remain relevant but deferred: automated
  tests exercise both Covers and the confirmation, not native drag or dialogs.
- The old workspace mock branch (016), toolbar wrapping/redesign (014/019),
  and extraction of editor controls (009) remain deferred to their respective
  workflow or UI work; the current controls remain until 018.
- External edit conflicts (004), rendition caching and transport (003/006),
  Slot bounds, handles and shared helpers (006), dense-Page profiling (013),
  Photo identity casing (008), missing fonts (009), Layout orientation (014),
  and bundle splitting (008) do not change with book structure and remain open.

## Future considerations (low priority)

- The editor and core each derive the insertion position for Spread controls.
  Reassess selection and shared positioning when replacing these controls in 018.
- Smoke-test the Covers and deletion confirmation in the native WebView2 app.
