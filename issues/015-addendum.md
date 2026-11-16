# 015 addendum - Swap-only interaction and compact handle

Status: done

Original issue: [015 - Drag-to-swap Placements](015-drag-to-swap.md).

## Acceptance criteria

- [x] Remove the post-swap message and Replace instead action; dropping onto an occupied Photo Slot simply swaps Placements.
- [x] Swapping does not add toolbar content or change the Spread size.
- [x] Replace the Drag Photo text handle with a hand icon and a Drag to swap tooltip.
- [x] Preserve Library replacement, empty-Slot moves, Crop/Fit transfer and drag behavior during autosave.

This supersedes the original issue's explicit post-swap Replace command.

## Implementation and verification

- Removed post-swap toolbar state, the Replace command and its unused core helper.
  The compact hand icon retains the existing accessible drag-source name.
- The updated workspace test failed against the old post-swap UI and now passes.
  All 127 frontend tests, typecheck, production build and lint pass.
- Browser checks with an in-memory Album and HTML drag events verified swaps
  and identical Page dimensions before and after each swap at viewport widths
  of 800, 1000 and 1200 px. The icon was visually checked.

## Earlier considerations reviewed

- **014/015:** the new post-swap toolbar growth is removed. The broader
  selection-dependent toolbar wrapping from 014 remains deferred: this change
  removes swap-only controls rather than redesigning all editor toolbars.
  The obsolete native Replace instead check from 015 no longer applies.
- **005-007, 009, 013-015 and addenda:** native WebView2 gesture checks remain
  deferred; browser HTML events are not native mouse-drag validation.
- **006/009:** shared validation/geometry helpers, preview state restructuring
  and control extraction remain deferred; this change removes interaction state.
- **002-004, 006 addendum, 008/009 addenda and 013:** Library restoration,
  caching, external edits, filesystem-aware Usage, fonts, bundle size and dense
  snapping performance are unrelated and remain deferred.

## Review

- Standards: no remaining findings.
- Spec: the explicit replacement interaction is removed as requested, while
  Library Photo replacement and the existing Placement transfer paths remain.

## Future considerations (low priority)

- Check the compact handle and real drags in the native WebView2 app.
- The existing production bundle-size warning remains unrelated.
