# 004 – Create and open an Album

Status: todo · Depends on: 002

## What

Create a new Album and persist it as `Albums/<name>.album.json` in the Library. The Album saves itself automatically after every change.

## Acceptance criteria

- [ ] "New Album" asks for:
  - a name
  - a Page Format, entered by hand: page width and height in mm, Bleed in mm, Safe Zone margin in mm, and export resolution in DPI
  - the starting side (Page 1 on the right by default, or the left)
  - the page count (default 24)
- [ ] The Album is created with that many empty, white Pages.
- [ ] Existing Albums in `Albums/` are listed and can be opened.
- [ ] The Album model and its JSON (de)serialisation live in the domain core, with a schema version field and unit tests for the round trip.
- [ ] Autosave writes after every change, debounced, and never leaves a half-written file (write to a temp file, then rename).
