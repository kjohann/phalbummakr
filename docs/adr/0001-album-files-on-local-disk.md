# An Album is a file on local disk, and its folder is the Library

An **Album** is one file, opened like a document in an IDE: you open `Christmas 2026.phalbum` the way you would open a solution in Rider. The folder that holds the file is its **Library**. Every Photo under that folder can be placed in the Album and is referenced by a path relative to it. Photos are never imported, copied or uploaded. The file system is the source of truth for which Photos exist, so moving to another machine is just copying or zipping the folder.

Several Albums can live in the same folder and share its Photos. What they share beyond Photos, such as the Layout Library, Tags and Page Format Presets, lives in a `.phalbummakr/` folder next to them, in the same way as `.idea/` or `.vscode/`. It is only created when something first needs to be stored there, and an Album file never depends on it, so an Album copied elsewhere still opens. Only the Album's own folder is checked for `.phalbummakr/`. Parent folders are never searched.

We chose local disk because the problems we wanted to solve all come from photos living in someone else's cloud. Commercial album makers force an upload, and their Google Photos integrations can't read albums shared with you. Since March 2025 the Google Photos Library API only lets third-party apps read media they created themselves, or media the user picks through the Picker API. Integrating directly with shared albums is therefore not possible, and getting Photos onto disk is out of scope.

We chose the Album file as the thing you open because the app should not take charge of every Album on the computer, or every Album in a folder. You open one Album, as you open one document.

## Considered Options

- **Google Photos integration**: rejected, because the API can no longer read shared albums.
- **Per-machine Photo Sources** (named roots mapped to different absolute paths on each device): rejected in favour of one self-contained folder that can be zipped and moved.
- **Importing Photos into an app-managed store**: rejected, because it duplicates files and repeats the upload problem locally.
- **Opening a Library folder and choosing an Album from its `Albums/` folder**: built first, then replaced. It made the app a manager of Albums rather than an editor of one.
- **Searching parent folders for `.phalbummakr/`**: rejected because it is hard to predict which shared Layouts and Tags an Album would get.

## Consequences

- Renaming, moving or deleting a Photo on disk breaks its Placements, which then have to be relinked.
- Moving an Album file to another folder changes its Library, so its Photo paths break unless the Photos move with it.
- Data derived from Photos, such as thumbnails, is kept per machine outside the Library and can always be rebuilt.
