# Issues

Local issue tracker until the repo is published. Each issue is one file. Vocabulary follows [GLOSSARY.md](../GLOSSARY.md); architecture follows [docs/adr](../docs/adr).

Status: `todo` · `doing` · `done` · `closed`. Update the status here and in the issue file.

An issue that is dropped without being finished gets the status `closed` and a
`## Close reason` section right after its header, explaining why and where any
remaining scope went. Its file, number and unchecked criteria stay as history.
Closed issues are never reopened: follow-up work goes in a new issue that links
back with "Follows closed [NNN](NNN-....md)".

Feedback given right after an issue is implemented goes in an addendum
(`NNN-addendum.md`) with extra acceptance criteria. Larger follow-up work gets a
new numbered issue. See [AGENTS.md](../AGENTS.md#changing-requirements). Add each
addendum to the Addenda table.

## New issues

Use the next available number and the existing `NNN-short-description.md` naming
pattern. Add the issue to the table below with its dependencies and status.
Choose a type of `feature`, `tweak`, `bug`, or `regression`; for bugs and
regressions, append the type in parentheses to the issue link text in the index
so they are easy to find. Existing issues do not need to be reclassified.

```markdown
# NNN – Issue title

Status: todo · Type: feature | tweak | bug | regression · Depends on: issue numbers or none

## What

Describe the change.

## Acceptance criteria

- [ ] Describe a verifiable outcome.
```

## MVP

Each issue is a thin vertical slice that leaves the app runnable.

| #   | Issue                                                        | Depends on | Status |
| --- | ------------------------------------------------------------ | ---------- | ------ |
| 001 | [Scaffold the app](001-scaffold.md)                          | –          | done   |
| 002 | [Open or create a Library](002-open-library.md)              | 001        | done   |
| 003 | [Browse Photos in the Library](003-browse-photos.md)         | 002        | done   |
| 004 | [Create and open an Album](004-create-album.md)              | 002        | done   |
| 005 | [Spread view and page operations](005-spreads-and-pages.md)  | 004        | done   |
| 006 | [Photo Slots and placing Photos](006-photo-slots.md)         | 003, 005   | done   |
| 007 | [Crop and Fit](007-crop-and-fit.md)                          | 006        | done   |
| 008 | [Usage badges and duplicate warning](008-usage.md)           | 006        | done   |
| 009 | [Text Slots](009-text-slots.md)                              | 005        | done   |
| 010 | [Layouts, the Layout Library and Layout mode](010-layouts.md) | 006, 009, 013, 014, 023, 024 | done   |
| 011 | [Undo and redo](011-undo-redo.md)                            | 006, 018, 019, 023 | done   |
| 012 | [Page Export](012-page-export.md)                            | 007, 009, 017 | done   |
| 013 | [Slot snapping](013-slot-snapping.md)                         | 006, 009   | done   |
| 014 | [Slot rotation](014-slot-rotation.md)                         | 006, 009   | done   |
| 015 | [Drag-to-swap Placements](015-drag-to-swap.md)                | 006, 007   | done   |
| 016 | [Open an Album file](016-album-file.md)                       | 004        | done   |
| 017 | [Book structure with Inside Covers](017-book-structure.md)    | 016        | done   |
| 018 | [Page strip](018-page-strip.md)                               | 017        | done   |
| 019 | [Slot toolbar and menus](019-slot-toolbar.md)                 | 018        | done   |
| 020 | [Resizable Photo pane](020-photo-pane.md)                     | 016        | done   |
| 021 | [Move a Slot between Pages in a Spread](021-move-slot-between-pages.md) | 013, 014, 015, 017 | closed |
| 022 | [Effective Resolution warning](022-effective-resolution-warning.md) | 007, 012 | done   |
| 023 | [Command bar and mode switch](023-command-bar.md)              | 016, 019, 020 | done   |
| 024 | [Slot tools in the command bar](024-slot-tools-in-command-bar.md) | 023     | done   |
| 025 | [Folder tree in the Photo pane](025-folder-tree.md)            | 023        | closed |
| 026 | [Sorting core: send Photos to a Folder](026-sorting-core.md)   | 023        | done   |
| 027 | [Folder interactions](027-create-and-rename-folders.md)        | 026        | done   |
| 028 | [Sort mode](028-sort-mode.md)                                  | 023, 026   | done   |
| 029 | [Applying Layouts in Album mode](029-apply-layouts.md)         | 010, 023   | done   |
| 030 | [Slot shortcuts and inline text formatting](030-slot-shortcuts-and-inline-format.md) | 024 | done   |
| 031 | [Native File menu does not switch Albums (bug)](031-file-menu-album-switching.md) | 016 | doing  |
| 032 | [Smooth moves in Sort mode (bug)](032-smooth-moves-in-sort-mode.md) | 028 | done   |
| 033 | [Folder area and a tidier Photo pane header](033-folder-area.md) | 027 | done   |
| 034 | [Drag Selected Photos to a Folder](034-drag-selected-photos.md) | 028, 033 | done   |
| 035 | [Unlimited Comparison, Clear Comparison and work-area zoom](035-unlimited-comparison-and-zoom.md) | 028 | done   |
| 036 | [Delete Folders](036-delete-folders.md)                        | 027        | todo   |
| 037 | [Reviewed Photos and remembered position](037-reviewed-photos.md) | 028     | done   |
| 038 | [Touchpad pinch does not zoom Sort mode in the app (bug)](038-touchpad-pinch-in-webview.md) | 035 | doing  |
| 039 | [Stop Photo-grid edge scrolling during drags](039-stop-photo-grid-drag-scrolling.md) | 033 | done |
| 040 | [Alt-drag to duplicate a Slot](040-alt-drag-duplicate-slot.md) | 006, 009, 010, 011, 013, 014 | done |
| 041 | [Content-aware Photo Usage](041-content-aware-photo-usage.md) | 008 | done |
| 042 | [Copy Photos to a Folder](042-copy-photos-to-folder.md) | 026, 028, 034, 037, 041 | done |
| 043 | [Default Photo drag action](043-default-photo-drag-action.md) | 042 | done |
| 044 | [Folder Photo counts](044-folder-photo-counts.md) | 033, 042 | done |
| 045 | [Quick grid layout tool](045-quick-grid-layout.md) | 010, 011, 029 | done |
| 046 | [Mosaic starter Layouts](046-mosaic-starter-layouts.md) | 045 | done |
| 047 | [Folder-specific Reviewed Photos](047-folder-specific-reviewed-photos.md) | 037, 042 | done |
| 048 | [Protect progress during incomplete scans (bug)](048-incomplete-rescan-safety.md) | 003, 037, 044 | todo |
| 049 | [Automatic Rescan and manual feedback](049-automatic-rescan.md) | 003, 048 | todo |
| 050 | [Copy and paste Slots in Album mode](050-copy-paste-slots.md) | 011, 018, 019, 030, 040, 041 | done |
| 051 | [Resize Slots from corners and sides](051-slot-resize-handles.md) | 006, 009, 011, 013, 014 | done |
| 052 | [Smart placement of new Photos](052-smart-photo-placement.md) | 006, 011, 013, 014 | done |
| 053 | [Apply grid around edge text](053-grid-around-edge-text.md) | 045 | done |
| 054 | [Move Selected Slots together](054-move-selected-slots-together.md) | 011, 013, 019, 024, 040, 051 | done |
| 055 | [Separate Bleed and Safe Zone per axis](055-per-axis-bleed-and-safe-zone.md) | 004, 012, 017 | done |
| 056 | [Keyboard nudging for Selected Slots](056-keyboard-nudging.md) | 011, 013, 014, 030, 051, 054 | done |
| 057 | [Built-in Page dimensions and controlled dimension changes](057-page-dimensions.md) | 004, 011, 012, 016, 022, 055 | doing |

Work order for the layout rework: 016, 017, 018, 019, 020, then 011.

Work order for modes: 023, then 024, the 016 addendum and 011; 026 → 027/028; 010 → 029.

Work order for Sort mode feedback: 032 → 033 → 034, then 035, 036 and 037 in any order; 037 → 034 addendum section 2.

Alt-drag design: 040 is independent; implement 041 together with the 008
addendum, then 042. File copying requires content-aware Usage before shipping.

Folder counts (044) are independent of the Layout changes. Implement 045 before
046 so removing starter grids does not remove the ability to make grids.

## Addenda

| Addendum | Issue | Status |
| -------- | ----- | ------ |
| [004 addendum – Spread layout and Album settings](004-addendum.md) | 004 | done |
| [004 addendum – Hide the Albums folder](004-addendum.md#section-2--hide-the-albums-folder) | 004 | done |
| [004 addendum - Stable autosave status](004-addendum.md#section-3---stable-autosave-status) | 004 | done |
| [006 addendum – Drop feedback, Slots on drop and faster previews](006-addendum.md) | 006 | doing |
| [008 addendum – Filesystem-aware Photo Usage](008-addendum.md) | 008 | done |
| [009 addendum - Auto-height text boxes and attached controls](009-addendum.md) | 009 | done |
| [009 addendum - Stable toolbar appearance](009-addendum.md#section-2---stable-toolbar-appearance) | 009 | done |
| [010 addendum - Better predefined Layouts and placeholder text](010-addendum.md) | 010 | done |
| [012 addendum - Open the Export folder](012-addendum.md) | 012 | done |
| [013 addendum - All aligned snap guides](013-addendum.md) | 013 | done |
| [014 addendum - Upright Photos on placement](014-addendum.md) | 014 | done |
| [015 addendum - Swap-only interaction and compact handle](015-addendum.md) | 015 | done |
| [016 addendum - Quiet saving and a native Save command](016-addendum.md) | 016 | todo |
| [016 addendum - Stable native menu during autosave](016-addendum.md#section-2---stable-native-menu-during-autosave) | 016 | done |
| [023 addendum - Photo pane controls inside the pane](023-addendum.md) | 023 | done |
| [023 addendum - Mode bar on the left pane](023-addendum.md#section-2---mode-bar-on-the-left-pane) | 023 | done |
| [028 addendum - Right-click sends the chosen Photos](028-addendum.md) | 028 | done |
| [034 addendum - Ctrl-click in the grid selects](034-addendum.md) | 034 | done |
| [034 addendum - Separate the Comparison from the Selected Photos](034-addendum.md#section-2---separate-the-comparison-from-the-selected-photos) | 034 | done |
| [045 addendum - Bound grid Page previews](045-addendum.md) | 045 | done |

## After the MVP

See [backlog.md](backlog.md).

## Inbox

Raw feedback from real use goes in [inbox.md](inbox.md) until it is sorted into
issues, addenda or the backlog, or discarded.
