# 017 – Book structure with Inside Covers

Status: todo · Depends on: 016

## What

Every Album has the shape of a bound book: the first Spread pairs the front Inside Cover with Page 1, the last Spread pairs the final Page with the back Inside Cover, and every Spread in between holds two Pages.

## Acceptance criteria

- [ ] The first Spread shows the front Inside Cover on the left and Page 1 on the right.
- [ ] The last Spread shows the final Page on the left and the back Inside Cover on the right.
- [ ] Inside Covers are shown greyed out. They cannot be selected, hold no Slots, accept no dropped Photos and are never exported.
- [ ] An Album always has an even number of Pages, at least 2. New Albums start with 2 Pages unless a larger even count is chosen.
- [ ] Opening an Album with an odd Page count fails with a clear message.
- [ ] The Page 1 side setting is removed from New Album and Album Settings, and `startingSide` is removed from the file format.

## Converting existing Albums by hand

For each Album converted in [016](016-album-file.md):

1. Remove the `startingSide` field and apply any other format change made in this issue.
2. If the Album has an odd number of Pages, add an empty Page to the end of `pages`, for example `{ "id": "page-99", "background": "#ffffff", "slots": [] }` with an unused id.

Page sides may change for Albums that used a left starting side. Check those Albums after converting.
