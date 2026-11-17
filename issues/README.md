# Issues

Local issue tracker until the repo is published. Each issue is one file. Vocabulary follows [GLOSSARY.md](../GLOSSARY.md); architecture follows [docs/adr](../docs/adr).

Status: `todo` · `doing` · `done`. Update the status here and in the issue file.

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
| 010 | [Layouts, the Layout Library and Layout mode](010-layouts.md) | 006, 009, 013, 014, 023, 024 | todo   |
| 011 | [Undo and redo](011-undo-redo.md)                            | 006, 018, 019, 023 | todo   |
| 012 | [Page Export](012-page-export.md)                            | 007, 009, 017 | todo   |
| 013 | [Slot snapping](013-slot-snapping.md)                         | 006, 009   | done   |
| 014 | [Slot rotation](014-slot-rotation.md)                         | 006, 009   | done   |
| 015 | [Drag-to-swap Placements](015-drag-to-swap.md)                | 006, 007   | done   |
| 016 | [Open an Album file](016-album-file.md)                       | 004        | done   |
| 017 | [Book structure with Inside Covers](017-book-structure.md)    | 016        | done   |
| 018 | [Page strip](018-page-strip.md)                               | 017        | done   |
| 019 | [Slot toolbar and menus](019-slot-toolbar.md)                 | 018        | done   |
| 020 | [Resizable Photo pane](020-photo-pane.md)                     | 016        | done   |
| 021 | [Move a Slot between Pages in a Spread](021-move-slot-between-pages.md) | 013, 014, 015, 017 | todo   |
| 022 | [Effective Resolution warning](022-effective-resolution-warning.md) | 007, 012 | todo   |
| 023 | [Command bar and mode switch](023-command-bar.md)              | 016, 019, 020 | done   |
| 024 | [Slot tools in the command bar](024-slot-tools-in-command-bar.md) | 023     | todo   |
| 025 | [Folder tree in the Photo pane](025-folder-tree.md)            | 023        | todo   |
| 026 | [Sorting core: send Photos to a Folder](026-sorting-core.md)   | 025        | todo   |
| 027 | [Create and rename Folders](027-create-and-rename-folders.md)  | 026        | todo   |
| 028 | [Sort mode](028-sort-mode.md)                                  | 023, 026   | todo   |
| 029 | [Applying Layouts in Album mode](029-apply-layouts.md)         | 010, 025   | todo   |

Work order for the layout rework: 016, 017, 018, 019, 020, then 011.

Work order for modes: 023, then 024, the 016 addendum and 011; 025 → 026 → 027/028; 010 → 029.

## Addenda

| Addendum | Issue | Status |
| -------- | ----- | ------ |
| [004 addendum – Spread layout and Album settings](004-addendum.md) | 004 | done |
| [004 addendum – Hide the Albums folder](004-addendum.md#section-2--hide-the-albums-folder) | 004 | done |
| [004 addendum - Stable autosave status](004-addendum.md#section-3---stable-autosave-status) | 004 | done |
| [006 addendum – Drop feedback, Slots on drop and faster previews](006-addendum.md) | 006 | doing |
| [008 addendum – Filesystem-aware Photo Usage](008-addendum.md) | 008 | todo |
| [009 addendum - Auto-height text boxes and attached controls](009-addendum.md) | 009 | done |
| [009 addendum - Stable toolbar appearance](009-addendum.md#section-2---stable-toolbar-appearance) | 009 | done |
| [013 addendum - All aligned snap guides](013-addendum.md) | 013 | done |
| [014 addendum - Upright Photos on placement](014-addendum.md) | 014 | done |
| [015 addendum - Swap-only interaction and compact handle](015-addendum.md) | 015 | done |
| [016 addendum - Quiet saving and a native Save command](016-addendum.md) | 016 | todo |
| [016 addendum - Stable native menu during autosave](016-addendum.md#section-2---stable-native-menu-during-autosave) | 016 | done |
| [023 addendum - Photo pane controls inside the pane](023-addendum.md) | 023 | todo |

## After the MVP

See [backlog.md](backlog.md).
