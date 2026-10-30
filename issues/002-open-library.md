# 002 – Open or create a Library

Status: todo · Depends on: 001

## What

On start, the user opens a folder as a **Library**. A folder is a Library if it contains a `.phalbummakr/` folder. Opening a folder that isn't a Library yet offers to make it one. The tool reopens the last Library on the next start.

## Acceptance criteria

- [ ] A folder picker opens a folder.
- [ ] If `.phalbummakr/` is missing, the user is asked and the folder is created on confirmation.
- [ ] The last opened Library is remembered in per-machine app data, not in the Library.
- [ ] The Library root path is the only absolute path the tool keeps. Everything else is relative to it ([ADR 0001](../docs/adr/0001-library-on-local-disk.md)).
