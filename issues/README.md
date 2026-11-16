# Issues

Local issue tracker until the repo is published. Each issue is one file. Vocabulary follows [GLOSSARY.md](../GLOSSARY.md); architecture follows [docs/adr](../docs/adr).

Status: `todo` · `doing` · `done`. Update the status here and in the issue file.

Feedback on a completed issue goes in an addendum (`NNN-addendum.md`) with extra
acceptance criteria; see [AGENTS.md](../AGENTS.md#changing-requirements). Add each
addendum to the Addenda table.

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
| 010 | [Layouts and the Layout Library](010-layouts.md)             | 006, 009, 013, 014 | todo   |
| 011 | [Undo and redo](011-undo-redo.md)                            | 006        | todo   |
| 012 | [Page Export](012-page-export.md)                            | 007, 009   | todo   |
| 013 | [Slot snapping](013-slot-snapping.md)                         | 006, 009   | done   |
| 014 | [Slot rotation](014-slot-rotation.md)                         | 006, 009   | todo   |
| 015 | [Drag-to-swap Placements](015-drag-to-swap.md)                | 006, 007   | todo   |

## Addenda

| Addendum | Issue | Status |
| -------- | ----- | ------ |
| [004 addendum – Spread layout and Album settings](004-addendum.md) | 004 | done |
| [004 addendum – Hide the Albums folder](004-addendum.md#section-2--hide-the-albums-folder) | 004 | done |
| [006 addendum – Drop feedback, Slots on drop and faster previews](006-addendum.md) | 006 | doing |
| [008 addendum – Filesystem-aware Photo Usage](008-addendum.md) | 008 | todo |
| [009 addendum - Auto-height text boxes and attached controls](009-addendum.md) | 009 | done |
| [009 addendum - Stable toolbar appearance](009-addendum.md#section-2---stable-toolbar-appearance) | 009 | done |
| [013 addendum - All aligned snap guides](013-addendum.md) | 013 | done |

## After the MVP

See [backlog.md](backlog.md).
