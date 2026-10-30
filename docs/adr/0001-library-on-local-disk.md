# Photos live in a Library folder on local disk, with no cloud photo integration

Every Album works against a **Library**: a root folder on local disk that holds the Photos, the Albums and the Layout Library. Photos are referenced by paths relative to the Library root and are never imported, copied or uploaded. The file system is the source of truth for which Photos exist, so moving to another machine is just copying or zipping the Library folder.

We chose this because the problems we wanted to solve all come from photos living in someone else's cloud. Commercial album makers force an upload, and their Google Photos integrations can't read albums shared with you. Since March 2025 the Google Photos Library API only lets third-party apps read media they created themselves, or media the user picks through the Picker API. Integrating directly with shared albums is therefore not possible, and getting Photos onto disk is out of scope.

## Considered Options

- **Google Photos integration**: rejected, because the API can no longer read shared albums.
- **Per-machine Photo Sources** (named roots mapped to different absolute paths on each device): rejected in favour of one self-contained folder that can be zipped and moved.
- **Importing Photos into an app-managed store**: rejected, because it duplicates files and repeats the upload problem locally.

## Consequences

- Renaming, moving or deleting a Photo on disk breaks its placements, which then have to be relinked.
- Data derived from Photos, such as thumbnails, is kept per machine outside the Library and can always be rebuilt.
