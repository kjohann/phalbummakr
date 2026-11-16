# phalbummakr

## Requirements

- Node.js and npm
- Rust and Cargo
- Microsoft C++ Build Tools and the WebView2 Runtime on Windows

## Run

Install dependencies with `npm install`, then start the desktop app with `npm run tauri dev`. On start the app reopens the last Library, or asks you to open a folder as a Library. A folder is a Library if it contains a `.phalbummakr/` folder, and the app offers to create one if it is missing. The last opened Library is remembered in `settings.json` in the per-machine app data folder (`%LOCALAPPDATA%\com.phalbummakr.app` on Windows), never inside the Library. The status in the top bar comes from the Rust `greet` command and shows whether the desktop bridge answers. To run the UI in a browser instead, use `npm run dev`. Opening a Library needs the desktop app.

## Browse Photos

Opening a Library scans its folders for JPEG and PNG Photos, excluding
`.phalbummakr/`, `Exports/` and symbolic links. The photo browser sits beside the
Album workspace and starts at the Library root. Open folder tiles to browse
subfolders, including empty folders; use the breadcrumbs to return to any ancestor
or the Library root. Each view shows only its immediate folders (alphabetically
first) and Photos, with Photos sorted by capture date (oldest first, then relative
path for ties). The Photo count is for the current folder, not its descendants.
Dates come from EXIF's original/digitized date, falling back to the file's modified
time. EXIF wall-clock dates are treated as UTC so sorting and display do not change
with the machine's timezone. Pixel sizes describe the original file; thumbnails
respect all eight EXIF orientations, including mirrored ones.

The grid is virtualised and requests only nearby thumbnails, with at most four
requests running at once. Rust generates thumbnails up to 256 pixels on the longest
edge and caches them under `thumbnails/` in per-machine app data. Cache keys include
the Library root, relative Photo path, file size, modification time and thumbnail
format version. Originals stay untouched; cached thumbnails can be deleted and
rebuilt. Use **Rescan** after adding, removing or editing files. Scan warnings and
thumbnail errors are shown in the photo browser; a failed rescan keeps the previous
folder and grid available. A successful rescan keeps the current folder if it still
exists; otherwise, it returns to the nearest available ancestor and shows a notice.
Opening a folder resets the grid to the top. Folders and Photos are referenced
where they live on disk; browsing never moves or copies originals.

## Albums

Use **New Album** to choose a name, Page Format and print settings. Initially the
only Page Format is **A4 landscape (297 x 210 mm)**; width and height are not
entered manually. Defaults are 24 empty white Pages, Page 1 on the right, 3 mm
Bleed, 5 mm Safe Zone and 300 DPI. Page counts from 1 to 10,000 are supported.
Names must be valid Windows filenames (up to 100 characters).

Albums live in `Albums/<name>.album.json` under the Library, with a versioned JSON
model owned by the TypeScript domain core. Use the Album list to open an existing
Album and **Refresh Albums** to pick up disk changes. Unsupported schema versions or content are rejected rather than
silently discarded. Creating an Album never overwrites an existing file.

The editor shows facing Pages, with a horizontally scrollable Spread strip below
it. Select a Page from the strip, the Page selector, or the editor itself. Page 1
is alone on its chosen side; the opposite side is blocked out as **Inside cover**.
Remaining Pages pair in order, with **No Page** marking an unmatched final side.
These placeholders are not editable Pages and are not saved in the Album.

**Add Page** and **Duplicate Page** insert after the selected Page and select the
result. **Delete Page** selects the next Page, or the previous one at the end;
the last Page cannot be deleted. Drag a Page thumbnail onto another to move it to
that position, or use **Earlier** / **Later** with the keyboard. Page numbers and
Spreads update from the new order, while Page identities remain stable. The
selected thumbnail scrolls into view. The editor keeps the trim edge at A4
proportions, with Bleed outside it and a dashed Safe Zone inside it.

**Album settings** contains **Page 1 side** and the print settings. Starting-side
changes apply immediately; use **Apply print settings** for Bleed, Safe Zone and
DPI changes. The Page Format remains A4 landscape. All applied edits autosave
after 500 ms without another change. Album and
Library switching are blocked until saving finishes; save failures keep the
changes in memory and offer **Retry save**. Closing the desktop window is also
blocked during an Album operation or while changes remain unsaved. Each write
uses a unique temporary file in `Albums/`, flushes it, then atomically replaces
the destination. This keeps the previous file intact if replacement fails.
Page operations pause during a write or after a save failure, but Page selection
remains available. Text editing can continue during a write; subsequent changes
are saved in the next write. Album and Library switching also wait for an
in-progress Crop gesture to finish and save.

## Photo Slots, Crop and Usage

Use **Add Photo Slot** to add a Slot to the selected Page. Drag a Slot to move it,
use its bottom-right handle to resize it, and select **Delete Slot** to remove it.
Drag a Photo from the grid onto a Slot to place or replace it, or onto an empty
part of a Page to create a Slot. The editor uses cached thumbnails and previews,
not original files.

To move a placed Photo, drag its hand-icon handle (**Drag to swap**) onto another
Photo Slot. An empty target receives the Placement; an occupied target swaps the
two Placements. The Slots keep their geometry and rotation. Fit follows the Photo;
if Slot shapes differ, the Crop is refit around its center, preserving relative
zoom where the Photo edges allow it. Dropping a Photo from the Library still
replaces an occupied Slot.

Select either kind of Slot and use **Rotate left** or **Rotate right** to turn
it and its content by 90 degrees. Rotation keeps the Slot's centre fixed and
may extend it beyond the Bleed. Newly placed or replacement Photos keep their
original upright orientation (including EXIF orientation), without changing the
Slot's position or dimensions. Rotating an occupied Slot still turns its current
content, and that orientation is saved with the Album.

Select a filled Slot and enable **Crop photo** to pan by dragging the Photo. Use
the mouse wheel over the selected Placement or the zoom buttons to adjust its
Crop; the Photo always covers the Slot. **Fit** instead shows the whole Photo
with white space as needed, and turning Fit off restores the Crop. Resizing a
Slot preserves its zoom relative to the minimum cover and retains the Crop
centre where possible.

The Photo grid shows how many times each Photo is used in the open Album. Enable
**Unused in this Album** to filter out used Photos. Placing an already-used Photo
shows a dismissible warning but does not prevent the Placement.

Tauri's native file-drop interception is disabled so HTML Page drag reordering
can work on Windows. The app does not currently accept file drops from Explorer.

## Text Slots

Use **Add Text Slot** to place a caption or title on the selected Page. Type in
place; double-click a Text Slot or select it and press Enter to edit it again.
Escape finishes editing. Drag its outline (or the **Move** handle while editing)
and use the edge handle to change its writing width (the bottom edge for a
sideways Slot). Height automatically fits
the content, growing and shrinking as text, font or width changes.
**Delete Slot** removes it.

When moving or resizing either kind of Slot, nearby Page edges, Safe Zone edges,
other Slot edges and centers, and equal gaps on the same Page attract the Slot
within six screen pixels. Guides show every matching edge and center on both
axes or mark the equal gaps. For example, equal-height Slots aligned at the top
also have a guide along their matching bottom edges.
Hold **Alt** at any point during the gesture to bypass snapping and place or
resize freely; releasing it restores snapping. Text Slot height still fits its
content automatically.

A compact toolbar follows the selected Text Slot. It offers installed Windows
fonts, size presets (12, 18, 24, 36, 48 and 72 pt), **Custom...** for an exact point
size, colour and alignment. **Format** groups bold, italic and underline.
Ctrl+B, Ctrl+I and Ctrl+U (Command on macOS) toggle formatting for the whole box,
including while editing. Text is never automatically reduced in size.

Text can grow beyond the Page; a warning appears when it does. A character wider
than the box also shows a warning. Text, style and fitted height autosave with
the Page, and duplicating a Page creates an independent copy. Existing Text Slots
are fitted to their content when an Album opens; old Albums default underline
to off. A Layout can later reuse the Slot's style without copying its Page text.
If font discovery fails, the existing font remains selected and **Retry fonts**
is available.

## Test and build

- `npm test` runs Vitest for the pure TypeScript domain core and React UI (with a mocked desktop bridge).
- `npm run typecheck` checks the TypeScript project, and `npm run lint` enforces the domain core's import boundary.
- `cargo test` in `src-tauri/` runs the Rust unit tests.
- `npm run build` builds the frontend; `npm run tauri build` builds the desktop app.