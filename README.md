# phalbummakr

## Requirements

- Node.js and npm
- Rust and Cargo
- Microsoft C++ Build Tools and the WebView2 Runtime on Windows

## Run

Install dependencies with `npm install`, then start the desktop app with `npm run tauri dev`. On start the app reopens the last Album, or shows a start screen to create or open one. The last and recent Albums are remembered in `settings.json` in per-machine app data (`%LOCALAPPDATA%\com.phalbummakr.app` on Windows), never inside the Library. Album dialogs require the desktop app.

## Browse Photos

Opening an Album scans its folder (the Library) for JPEG and PNG Photos, excluding
`.phalbummakr/`, `Exports/` and symbolic links. The photo browser sits beside the
Album workspace and starts at the Library root. Open folder tiles to browse
subfolders, including empty folders; use the breadcrumbs to return to any ancestor
or the Library root. `Albums/` is browsed like any other folder. Each view shows only its immediate folders (alphabetically
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

## Sorting and copying Photos

Choose **Move** or **Copy** in the Photo pane to set the default for dragging
Photos to Folder tiles or breadcrumbs. The app starts with Move and keeps your
choice across modes, Albums and Libraries for this session only.
**Hold Alt at drop to use the opposite action**; releasing Alt restores the
default without changing the toggle. Modifier changes update the live drag badge
(including single Photos) and Folder highlight. The badge adds Move/Copy while
over a valid Folder target. Unlike Slot duplication, this choice is not latched
at drag start. Drops on Pages and Photo Slots still place normally, even with Alt.

Right-click a Photo for **Move to Folder...** or **Copy to Folder...**, including
**New Folder…**. These explicit menu actions ignore the drag default.
In Sort mode, a grid Comparison member acts on the whole
Comparison; a Selected member in the Comparison acts on the Selected Photos.
Otherwise, the Photo acts alone. Copies keep originals, Comparison selection and
Placement paths unchanged, and share Usage once their content is indexed.

Protected Folders and same-Folder duplication are forbidden. Mixed batches skip
Photos already in the destination and report the skips. Name collisions get
case-insensitive suffixes such as `holiday (2).jpg`; copies never overwrite files,
even if a destination appears after planning. A failed copy batch rolls back
new copies, with operation and rollback failures shown explicitly.

App-created copies initially inherit their original's Reviewed mark; after that
the marks are independent. Identical files found by scanning do not inherit it.
File moves and copies are outside Album undo and need no ordinary confirmation.

Drag the Side pane's inner edge to resize it (200–640 px, at most 60% of the
window; with the separator
focused, the arrow keys resize it too). The ‹ tab on its edge collapses it and the
› tab at the window edge opens it again. **View → Toggle Photos** (Ctrl+B) does the
same, unless a Text Slot uses Ctrl+B for Bold, a text field has focus or a dialog
is open. **View →
Compact Photos** shows smaller thumbnails without file names; Usage badges stay.
The width, collapsed state and Compact setting are stored per computer in
`settings.json`, not in the Album.

## Albums

Use **File > New Album** to choose a `.phalbum` file, then a title, Page Format and print settings. Initially the
only Page Format is **A4 landscape (297 x 210 mm)**; width and height are not
entered manually. Defaults are 2 empty white Pages, 3 mm
Bleed, 5 mm Safe Zone and 300 DPI. Even Page counts from 2 to 10,000 are supported.
The title is free text and is independent of the filename.

Each Album is a `.phalbum` file containing versioned JSON. Its folder is the
Library; Photo paths are relative to that folder. Use **File > Open Album** or
**Open Recent** to open one. Unsupported schema versions or content are rejected
rather than silently discarded. Creating an Album never overwrites an existing file.
Existing `Albums/*.album.json` files are not migrated automatically: move each
file to the Library root, rename it to `.phalbum`, rename its JSON `name` field
to `title`, and change `schemaVersion` from `1` to `2`. Remove `startingSide`
and, if needed, append an empty Page with a unique ID to make the count even.
Page sides may change for Albums that started on the left.

The editor shows facing Pages, with a horizontally scrollable Spread strip below
it. Select a Page from the strip, the Page selector, or the editor itself. Page 1
is on the right facing the front **Inside cover**; the final Page is on the left
facing the back Inside Cover. Remaining Pages pair in order. Inside Covers cannot
be selected, hold Slots, receive Photos or be exported, and are not saved in the Album.

Hover between Spreads and choose **+** to insert two empty Pages, or hover a
middle Spread and choose **×** to delete it. Right-click a Page for insertion,
deletion and duplication options, or right-click empty strip space to add a
Spread before the last one. Duplicating copies the Page onto the same side of a
new Spread, except that a copy of the last Page is placed on the left before it.
Deleting a Spread happens straight away; use **Undo** if it was a mistake. The
first and last Spreads cannot
be deleted. Drag a Page thumbnail onto another to move it to that position, or
focus it and use Alt+Left/Right to move it one position.
Page numbers and Spreads update from the new order, while Page identities remain
stable. The selected thumbnail scrolls into view. The editor keeps the trim edge
at A4 proportions, with Bleed outside it and a dashed Safe Zone inside it.

**Undo** and **Redo** at the right of the command bar, or Ctrl+Z and Ctrl+Y
(or Ctrl+Shift+Z), step through every Album change made since the Album was
opened: Slots, Placements, Crops, text and Pages. A drag, a pan, or one session
of typing in a Text Slot counts as one step. Undo jumps to the Page where the
change happened. The history lasts for the session only; autosave always writes
the current state. In Layout mode, each Layout has its own history. Creating,
duplicating and deleting Layouts, and moving or copying Photos between Folders, are not
undone.

**Album settings** contains the title and print settings. Use **Apply print settings** for the title, Bleed,
Safe Zone and DPI changes. The Page Format remains A4 landscape. All applied edits
autosave after 500 ms without another change. Album switching is blocked until
saving finishes; save failures keep the
changes in memory and offer **Retry save**. Closing the desktop window is also
blocked during an Album operation or while changes remain unsaved. Each write
uses a unique temporary file beside the Album, flushes it, then atomically replaces
the destination. This keeps the previous file intact if replacement fails.
Page operations pause during a write or after a save failure, but Page selection
remains available. Text editing can continue during a write; subsequent changes
are saved in the next write. Album switching also waits for an
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

Select either kind of Slot and use **Rotate left** or **Rotate right** (Ctrl+Left
and Ctrl+Right) to turn
it and its content by 90 degrees. Rotation keeps the Slot's centre fixed and
may extend it beyond the Bleed. Newly placed or replacement Photos keep their
original upright orientation (including EXIF orientation), without changing the
Slot's position or dimensions. Rotating an occupied Slot still turns its current
content, and that orientation is saved with the Album.

Select a filled Slot and drag its ✥ handle to pan the Photo. Use the zoom
buttons, or Ctrl+Plus and Ctrl+Minus, to adjust its
Crop; the Photo always covers the Slot. **Fit** instead shows the whole Photo
with white space as needed, and turning Fit off restores the Crop. Resizing a
Slot preserves its zoom relative to the minimum cover and retains the Crop
centre where possible.

The Photo grid shows Usage in the open Album. Byte-identical Photos share the
total number of their Placements, even in different Folders. They remain
independent files and Placements keep their particular paths. Slot rotation and
Crop/Fit do not change identity; different bytes (including EXIF edits or
recompression) do.

Complete-file SHA-256 hashes are indexed in the background and cached in
`.phalbummakr/content-index.json` for unchanged files. Browsing and placement
remain available while badges say **Checking...**. **Unused** excludes
unresolved checks and shows an indexing notice. Failures are visible and offer
**Retry Usage check**. **Album settings → Diagnostics** keeps content-index
statistics collapsed until requested: hashing bytes, cache hits and backend
indexing time are diagnostic information, not everyday browser chrome. Rescan
rechecks files.

Placing an already-used Photo shows the ordinary dismissible warning without
preventing the Placement. An unresolved check instead explicitly says the
duplicate check is pending. Established Missing Photo identities still count;
an unknown Missing identity leaves duplicate checking visibly incomplete.

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
Hold **Ctrl** at any point during the gesture to bypass snapping and place or
resize freely; releasing it restores snapping. Text Slot height still fits its
content automatically.

**Alt-drag** a Slot in Album or Layout mode to duplicate it, leaving the original
in place. Hold Alt when the drag starts; changing Alt later does not change the
gesture. The duplicate keeps all content, formatting, rotation and Crop/Fit,
stays on the same Page and is selected on drop. No Photo file is copied.
Alt+Ctrl duplicates without snapping. Escape or focus loss cancels the duplicate
preview; a click without movement creates nothing. Album duplication is one
undoable edit. Alt during resizing has no special effect.

The selected Text Slot's tools are in the command bar. They offer installed Windows
fonts, size presets (12, 18, 24, 36, 48 and 72 pt), **Custom...** for an exact point
size, colour, **B**, **I** and **U** buttons and left, centre and right alignment
buttons. In a narrow window, the formatting and alignment buttons fold into a
**Format** menu and an alignment list.
Ctrl+B, Ctrl+I and Ctrl+U (Command on macOS) toggle formatting for the whole box,
including while editing. Text is never automatically reduced in size.

Text can grow beyond the Page; a warning appears when it does. A character wider
than the box also shows a warning. Text, style and fitted height autosave with
the Page, and duplicating a Page creates an independent copy. Existing Text Slots
are fitted to their content when an Album opens; old Albums default underline
to off. A Layout can later reuse the Slot's style without copying its Page text.
If font discovery fails, the existing font remains selected and **Retry fonts**
is available.

## Layouts

A Layout is a reusable arrangement of Slots on one Page. The Library's Layout
Library is stored in `.phalbummakr/layouts.json` and is shared by every Album in
that folder. A new Library starts with predefined Layouts. The file is only
written once something changes. Edit Layouts in **Layouts** mode.

In Album mode, the **Layouts** tab of the Side pane lists the Layout Library.
Drag a Layout onto a Page, or onto one of its Slots, to apply it to that Page.
You can also right-click or click a Layout and choose **Apply to left Page** or
**Apply to right Page** for the current Spread. On a Spread with an Inside
Cover, only the real Page is offered.

Applying replaces the Page's Slots with a copy of the Layout's. Photos and text
move into the new Slots in Page order, and each Photo is refitted to its new
Slot. Anything that does not fit is removed, and a notice says what was removed.
A notice also warns when the Layout was made for Pages with a different aspect
ratio. The Page and the Layout are unlinked from then on, so editing or
deleting the Layout later never changes the Page.

**Save as Layout** in the command bar adds the selected Page's Slots to the end
of the Layout Library as a new Layout. It keeps their geometry, rotation and
Text Slot styles, but not their Photos or text.

## Test and build

- `npm test` runs Vitest for the pure TypeScript domain core and React UI (with a mocked desktop bridge).
- `npm run typecheck` checks the TypeScript project, and `npm run lint` enforces the domain core's import boundary.
- `cargo test` in `src-tauri/` runs the Rust unit tests.
- `npm run build` builds the frontend; `npm run tauri build` builds the desktop app.