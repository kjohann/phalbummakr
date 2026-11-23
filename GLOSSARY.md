# phalbummakr

A local-first tool for designing printed photo albums from photos on disk, without uploading them anywhere. Finished pages are exported as images and assembled into a book with a Print Provider's own album product.

## Language

### Library

**Library**:
The folder an Album lives in. Every Photo under it can be placed in the Albums stored there, and its contents on disk are the source of truth for which Photos exist. It is never opened on its own: opening an Album brings its Library with it.
_Avoid_: Workspace, collection, catalog, solution

**Photo**:
An image file anywhere under the Library root. It is referenced where it lives, never uploaded or imported, and every Photo can be used on any Page.
_Avoid_: Image, picture, asset, media

**Folder**:
A directory under the Library root that the user sorts Photos into, such as "grandparents". Folders on disk are the only way Photos are organised.
_Avoid_: Tag, category, label, keyword, collection

**Sorting**:
Moving or copying Photos between Folders in the Library. Moving a placed Photo keeps every Album that uses it pointing at the Photo's new location; copying leaves the original Photo and its Placements unchanged.
_Avoid_: Culling, filing, importing

**Folder Photo count**:
The number of Photos in a Folder and all its subfolders, regardless of Usage or reviewed state. Identical Photos count separately because they are separate files.
_Avoid_: Usage, unique Photo count

**Comparison**:
Any number of Photos shown side by side while Sorting. Photos are added to it from the Photo grid, such as by Ctrl-click, and are marked there as part of it. Sending one of them from the grid to a Folder sends the whole Comparison. Photos start out unselected in the Comparison. A single Photo shown on its own counts as selected.
_Avoid_: Lightbox, stack

**Selected Photos**:
A subset of a Comparison picked in the Comparison itself, so that only those Photos are sent to a Folder. They are always part of the Comparison, and clearing the Comparison clears them too.
_Avoid_: Chosen Photos

**Reviewed Photo**:
A Photo the user has looked at while Sorting, either shown in a Comparison or marked by hand. Its Reviewed state belongs to the Photo in its current Folder. Moving or copying it to another Folder starts it unreviewed there; a copy leaves the original's state unchanged.
_Avoid_: Seen, checked, bookmark

**Usage**:
The number of Placements in an Album that use a Photo or any of its Identical Photos.
_Avoid_: Occurrence, reference count

**Identical Photos**:
Separate Photo files with exactly the same contents. They share Usage, but each has its own location and can be moved or deleted independently.
_Avoid_: Linked copies

**Missing Photo**:
A placed Photo whose file no longer exists at its recorded path in the Library. It stays missing until it is relinked to another file.
_Avoid_: Broken link, orphan

### Album design

**Album**:
One book being designed, such as the Christmas album for a given year. It is made up of an ordered sequence of Pages, and is opened, moved and shared as a single file, like a document. Its title is free text and is independent of the file's name.
_Avoid_: Book, project, photobook, solution

**Page**:
One printed side of a leaf in an Album, and the unit that gets designed and exported. It always has a white background.
_Avoid_: Sheet, side

**Selected Page**:
The Page chosen as the current target for editing in Album mode. A Spread can show two Pages, but only one Page is selected at a time.

**Page Format**:
The page size, bleed, safe-zone margin, export resolution and Effective Resolution threshold shared by every Page in an Album. It is chosen when the Album is created and adjusted to match the Print Provider.
_Avoid_: Page size, paper size

**Page Format Preset**:
A named, reusable Page Format stored in the Library, together with the Print Provider's page-count rules.
_Avoid_: Profile, product

**Bleed**:
Extra image area beyond the trim edge of a Page, which the Print Provider cuts away.

**Safe Zone**:
The inner area of a Page that is guaranteed to survive trimming.
_Avoid_: Margin, safe area

**Reflow**:
The explicit step of changing an Album's Page Format and adapting every existing Page to it.
_Avoid_: Resize

**Spread**:
Two facing sides viewed together. A middle Spread has two Pages; the first pairs the front Inside Cover with Page 1, and the last pairs the final Page with the back Inside Cover.
_Avoid_: Double page

**Inside Cover**:
The inside of the front or back cover, facing the first or last Page. It is shown in its Spread for context, but it is never designed or exported.
_Avoid_: Endpaper, blank page

**Spread sibling**:
The Page facing another Page in the same Spread. The first and last Pages face an Inside Cover instead and have no Spread sibling.

**Layout**:
A reusable arrangement of Slots on a single Page. Applying a Layout copies it onto the Page, and the two are unlinked from then on.
_Avoid_: Template, design, arrangement

**Grid Layout**:
A Layout made of equal-sized Photo Slots arranged in rows and columns, including a single row or column.
_Avoid_: Table, contact sheet

**Mosaic Layout**:
A Layout made of differently sized, non-overlapping Photo Slots, mixing larger and smaller regions on a Page.
_Avoid_: Collage

**Layout Library**:
The Library's collection of Layouts, shared by every Album stored there. An Album keeps its own copy of every Layout it uses.
_Avoid_: Template gallery

**Slot**:
A rectangular region in a Layout or Page that holds content. It is either a Photo Slot or a Text Slot. Rotating a Slot rotates its content with it.
_Avoid_: Frame, cell, placeholder, box

**Slot rotation**:
The orientation of a Slot and its content, changed in 90° turns.

**Photo Slot**:
A Slot that shows one Photo.

**Placement**:
A Photo put into a Photo Slot on a Page, together with how it is shown there: Crop or Fit. Usage counts Placements.
_Avoid_: Instance, occurrence

**Effective Resolution**:
The print resolution a Placement actually gets, given the Photo's pixels, its Crop and the Slot's printed size. Placements below the Page Format's threshold are flagged.
_Avoid_: DPI, quality

**Text Slot**:
A Slot that shows text, such as a caption or title.

**Placeholder text**:
The hint an empty Text Slot shows greyed out on the canvas, "Text" by default. It is only edited in Layout mode, travels with the Slot when a Layout is applied, and is never printed.
_Avoid_: Sample text, hint

**Crop**:
The part of a Photo visible in a Photo Slot when the Photo fills the Slot, chosen by panning and zooming.
_Avoid_: Cut, trim

**Fit**:
Showing the whole Photo inside its Photo Slot without cropping, leaving white space where the aspect ratios differ.
_Avoid_: Letterbox, contain

### Output

**Page Export**:
A finished Page rendered as a single image file, ready to be placed as a full-page image in a Print Provider's album product.
_Avoid_: Render, output, print file

**Print Provider**:
An external photo company whose album product is used to order the printed book.
_Avoid_: Printer, photo company, vendor
