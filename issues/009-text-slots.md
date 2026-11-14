# 009 – Text Slots

Status: done · Depends on: 005

Follow-up: [Auto-height text boxes and attached controls](009-addendum.md).

## What

Add Text Slots for captions and titles.

## Acceptance criteria

- [x] Text Slots can be added, moved, resized and deleted, like Photo Slots.
- [x] The text is edited in place.
- [x] Styling options:
  - font family, from the system fonts
  - size
  - colour
  - bold and italic
  - left, centre or right alignment
- [x] Text that doesn't fit keeps its size, and the Slot shows an overflow warning.
- [x] The text content belongs to the Page. The style is stored on the Slot, so a Layout can carry it as a default (see 010).

## Implementation and verification

- Text Slots are saved with their Page content and a separate style object;
  existing Photo-only Albums remain compatible. Sizes are in points.
- Windows font families are enumerated by GDI. Errors are visible and retryable.
- Konva renders and measures wrapped text, clips it to the Slot and flags
  overflow. A positioned editor allows in-place typing, including during an
  in-flight autosave; later changes are serialized into the next write.
- Domain and workspace tests cover editing, persistence, duplicate Pages,
  styling, overflow, gestures, Photo drag isolation, retries and save races.
  A Windows native test checks installed font enumeration. A browser check
  exercised actual Konva overflow, clearing it, and keyboard re-entry.
- Final verification: 79 frontend tests, 22 Rust tests, frontend build,
  typecheck and lint passed. Vite retained the existing large-chunk warning;
  Cargo reported an incremental-cache access warning without failing tests.

## Review

- **Standards:** no blocking findings. `AlbumView` continues to grow; the
  potential extraction is recorded below.
- **Spec:** review found and fixed interrupted typing during autosave and an
  old text editor remaining active when a Photo Slot was added. No remaining
  blocking findings.

## Earlier considerations reviewed

- **002:** startup messaging, marker duplication and Library port size remain
  unrelated to Text Slots.
- **003 and 006 addendum:** thumbnail/preview cache pruning, decoding, transport,
  lifecycle maps and LRU factoring are unrelated to text rendering.
- **004:** external-edit detection remains deferred; autosave serialization here
  concerns edits in this app, not concurrent external writers.
- **005, 006 and 007:** native WebView2 mouse/drag checks remain useful and
  outstanding. Additional resize handles and keyboard nudging remain deferred;
  Text Slots use the same bottom-right handle as Photo Slots. The shared
  rectangle type already exists; record-helper and orientation duplication are
  unrelated. Slots outside a subsequently reduced Bleed remain loadable.
- **008:** bundle splitting is unrelated, and filesystem-aware Photo identity
  remains tracked by the 008 addendum.

## Future considerations (low priority)

- Check in-place editing, system font rendering and Slot gestures in the
  integrated WebView2 application; the browser check used an in-memory Album.
- On another machine an Album's selected font may be unavailable and the system
  will substitute a font. Consider an explicit missing-font warning when font
  portability and Page Export are implemented.
- `AlbumView` now handles both text and Photo Slot interactions; consider
  extracting editor controls if further Slot features make it harder to change.
