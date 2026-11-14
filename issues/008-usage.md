# 008 – Usage badges and duplicate warning

Status: done · Depends on: 006 · Addendum: [008-addendum](008-addendum.md)

## What

Make it impossible to miss that a Photo is already in the Album. This is a key feature: reusing photos by accident was a real problem.

## Acceptance criteria

- [x] Every thumbnail in the grid shows its Usage count in the current Album when it's above 0.
- [x] Placing a Photo that's already used shows a warning that doesn't block. The Placement still happens.
- [x] The grid can be filtered to "unused in this Album".
- [x] Usage is computed in the domain core from the Album, not stored separately, and is unit-tested.
- [x] AlbumWorkspace retains ownership of the Album and reports changes to the Photo browser through a callback.
- [x] Duplicate warnings cover both Slot drops and Page drops without changing Placement rendering, Crop or Slot gestures.

## Implementation and verification

- Usage counts Placements by Library-relative Photo path across all Pages. It is derived in a separate core module and does not change the Album save format.
- The Photo browser shows counts, filters unused Photos, and retains folder navigation. AlbumWorkspace displays a dismissible warning for valid duplicate drops.
- `npm test` passed 55 tests, including core, browser, drop and sibling-integration tests. `npm run lint` and `npm run build` passed; the build reports a bundle-size warning.
- No development server or native app was started for this issue.

## Manual checks

To be performed in the native app by the user:

1. Open a Library and Album; verify the unused filter is unavailable until an Album is open and used Photos show accurate counts in each folder.
2. Drop an unused Photo on a Slot, then drop it on another Slot and on a blank Page. Confirm both duplicate warnings appear, can be dismissed, and neither prevents placement.
3. Enable the unused filter and navigate folders. Verify used Photos disappear, unused Photos remain and folders stay accessible. Replace or delete a Placement and verify counts and filtering update.
4. Duplicate and delete a Page containing Photos, reopen the Album, and switch Albums and Libraries. Verify counts reflect only the current Album and remain correct after saving and reopening.
5. Scroll a large Photo grid and toggle the filter; confirm badges, navigation and drag-and-drop remain usable.

## Earlier considerations reviewed

- 001 and the 004 addendum have no open future considerations.
- 002: remembered-Library notifications, shared marker text and splitting the Library port remain deferred; Usage changes none of those operations.
- 003: thumbnail and preview cache pruning remains deferred; Usage does not change cache storage or lifetime.
- 004: external-edit detection remains deferred because Usage adds no writer or persistence changes.
- 005: native WebView2 drag-and-drop verification remains useful and is included in the manual checks above.
- 006: Slot and Crop considerations are left to issue 007 as requested.
- 006 addendum: cached image validation, base64 transport, preview state maps and the preview LRU helper remain deferred; Usage does not change preview loading or caching.

## Review

Reviewed the implementation against the acceptance criteria and repository conventions. No blocking findings; native interaction and visual checks remain for the user.

## Integration review with 007

The merged workspace tests verify that Usage badges and duplicate warnings stay
in sync when a Crop gesture overlaps a Photo drop. Crop commits and autosaves
are coordinated so they do not discard later Placement changes.

## Future considerations (low priority)

- The production build warns that a JavaScript chunk exceeds 500 kB. Investigate code splitting when bundle size becomes a priority; this does not block Usage.
- On a case-insensitive filesystem, a case-only Photo rename can leave a
  Placement resolving to the same file while its Usage badge, unused filter and
  duplicate warning use the old path casing. Resolve identity using filesystem
  semantics without conflating distinct files on case-sensitive volumes. This
  broader change was deferred during the 007/008 merge and is tracked in the
  [008 addendum](008-addendum.md).
