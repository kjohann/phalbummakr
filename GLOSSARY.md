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

**Tag**:
A user-defined label, such as "grandparents", attached to Photos for rough sorting before and during design.
_Avoid_: Category, label, keyword

**Usage**:
The number of times a Photo has been placed in an Album.
_Avoid_: Occurrence, reference count

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

**Page Format**:
The page size, bleed, safe-zone margin and export resolution shared by every Page in an Album. It is chosen when the Album is created and adjusted to match the Print Provider.
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

**Layout Library**:
The personal collection of Layouts reused across Albums. An Album keeps its own copy of every Layout it uses.
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
