# Issues

Local issue tracker until the repo is published. Each issue is one file. Vocabulary follows [GLOSSARY.md](../GLOSSARY.md); architecture follows [docs/adr](../docs/adr).

Status: `todo` · `doing` · `done`. Update the status here and in the issue file.

## MVP

Each issue is a thin vertical slice that leaves the app runnable.

| #   | Issue                                                        | Depends on | Status |
| --- | ------------------------------------------------------------ | ---------- | ------ |
| 001 | [Scaffold the app](001-scaffold.md)                          | –          | done   |
| 002 | [Open or create a Library](002-open-library.md)              | 001        | done   |
| 003 | [Browse Photos in the Library](003-browse-photos.md)         | 002        | done   |
| 004 | [Create and open an Album](004-create-album.md)              | 002        | done   |
| 005 | [Spread view and page operations](005-spreads-and-pages.md)  | 004        | todo   |
| 006 | [Photo Slots and placing Photos](006-photo-slots.md)         | 003, 005   | todo   |
| 007 | [Crop and Fit](007-crop-and-fit.md)                          | 006        | todo   |
| 008 | [Usage badges and duplicate warning](008-usage.md)           | 006        | todo   |
| 009 | [Text Slots](009-text-slots.md)                              | 005        | todo   |
| 010 | [Layouts and the Layout Library](010-layouts.md)             | 006, 009   | todo   |
| 011 | [Undo and redo](011-undo-redo.md)                            | 006        | todo   |
| 012 | [Page Export](012-page-export.md)                            | 007, 009   | todo   |

## After the MVP

See [backlog.md](backlog.md).
