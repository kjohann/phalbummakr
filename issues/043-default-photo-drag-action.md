# 043 - Default Photo drag action

Status: done · Type: feature · Depends on: 042

## What

Follow up [042 - Copy Photos to a Folder](042-copy-photos-to-folder.md):
choose Move or Copy as the default Photo-to-Folder drag action, so a stage of
Sorting does not require holding Alt for every drag. Alt temporarily reverses
the chosen default rather than always choosing Copy.

## Acceptance criteria

- [x] Show a visible Move / Copy toggle in the Photo pane in Album and Sort
  modes, with the chosen default clearly indicated.
- [x] Start with Move. Keep the choice across mode, Album and Library changes
  within this app session, but do not persist it across app restarts or write
  it into an Album, Library or settings file.
- [x] Without Alt, a Photo-to-Folder drop uses the chosen default. With Alt
  held at drop, use the opposite action. Modifier changes update the badge,
  cursor effect and Folder highlight live without changing the toggle.
- [x] Apply this behaviour to grid and Comparison drags, Folder tiles and
  breadcrumbs, preserving existing batches, skips and destination protections.
- [x] Explicit Move to Folder / Copy to Folder menu commands retain their
  named actions regardless of the toggle. Page/Slot placement and Alt-drag
  Slot duplication remain unchanged.
- [x] Focused regressions cover both defaults, live Alt inversion and
  operation-at-drop, mode/document transitions and unchanged menu commands.
- [x] Typecheck, lint and the frontend suite pass; review against the starting
  commit and verify the toggle and modifier feedback in the rebuilt native app.

## Scope boundaries

No persistent preference, per-Library setting, new file operation, changed batch
selection rules or changes to Slot gestures. Existing Move and Copy operations
remain the source of truth for file and Album updates.

## Implementation and verification

App owns the session-only default above the document workspace, so switching
Albums or Libraries does not reset it. The Photo pane presents grouped Move and
Copy buttons with pressed-state feedback. The tools wrap at narrow pane widths.
Drag state tracks Alt separately from the default; feedback derives their
combination, and the drop handler reads the actual drop event's modifier state.
Explicit menu commands retain their existing operation arguments.

The agreed test seams are Photo browser drag/menu actions and App document
switching. Red tracers failed on the missing session callback and toggle.
Regressions now cover live inversion without changing the default, modifier
changes at drop, both defaults across all four existing copy batches, a
Comparison-to-breadcrumb move, unchanged menus, mode/Library transitions and
reset on a new app session without settings or Album writes.

All 382 frontend tests, typecheck, lint and the native release build pass.
Rust and filesystem operations are unchanged. Existing JavaScript chunk-size
and macOS bundle-identifier warnings remain non-blocking.
The user passed the rebuilt native app checkpoint: default/inverted actions,
live feedback, grid/Comparison and breadcrumb drags, session lifetime,
narrow/Compact presentation and drop/cancel cleanup.

## Code review

### Standards

Direct review of this bounded worktree diff against `9c1428b` checked repository
instructions, glossary/ADR consistency and the Fowler smell baseline. No
significant findings; existing state, callback, button and styling patterns
are preserved.

### Spec

Direct review against this issue found no missing implementation requirements
or unrelated behaviour changes. The separate native verification gate passed.

## Future considerations (low priority)

No remaining non-blocking review findings.

## Earlier considerations and inbox

- Reviewed the earlier issue and addendum consideration sections. No deferred
  implementation change fits this session-only UI scope.
- Native pane-header checks from [023 addendum](023-addendum.md), counted
  Comparison drags from [034](034-drag-selected-photos.md), and drop/cancel
  cleanup from [039](039-stop-photo-grid-drag-scrolling.md) passed in
  this issue's checkpoint. Their unrelated controls and broader gesture checks
  are not claimed as resolved here.
- The document-keyed state helper suggestion in
  [035](035-unlimited-comparison-and-zoom.md) stays deferred: this preference
  deliberately survives document changes and is not another document-keyed
  state. Shared index fixtures from [041](041-content-aware-photo-usage.md)
  stay deferred because no new indexing test suite is needed.
- Move transaction races, Album serialization, Folder rename behaviour, preview
  size/cache/transport, broader grid keyboard/scroll support, Reviewed quit
  saving, editor/toolbar refactoring, dense-Page performance, fonts, colour,
  export and external-edit coordination are unchanged and remain deferred.
- No inbox notes are resolved; Rescan feedback, command-bar alignment, invalid
  PNG files and issue-phase organisation remain untouched.
