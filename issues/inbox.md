# Inbox

Raw feedback from using the app for real, such as making a print-ready Album of
our 2024 Photos. Add notes here quickly, without polish. These notes aren't
kept. Each one is later sorted into one of these:

- a new numbered issue (see the [issues index](README.md#new-issues));
- an addendum, only for small feedback on an issue that was just finished;
- a [backlog](backlog.md) item;
- discarded.

Group notes under a top-level point, such as an area of the app, with
sub-points under it. Sorting covers one top-level point at a time. Related
sub-points from other points can be brought into the same round. Delete each
note once it has been sorted. An empty inbox means everything has been sorted.

## Notes

- We should evenutally close the MVP phase. I think that I'd like to continue using issues in the code, but maybe closing a phase means we do the following:
    - Move them to a folder named for the phase (MVP/phase0)
    - Include at least a part of the readme, so some restructuring is probably needed here - the entire issue and addendum list
    - I have to consider addendums that are still open
    - We don't close a phase before it is tested, meaning this part is the last I'd want to do before creating the next phase
    - And overview of though of phases might also be handy - maybe have that as a new section in the issues/readme.
    - The backlog remains as a place to track things not directly connected to any phase. Whenever I promote something, they go into a phase.
    - I think there should be support for multiple active phases at any given time. Either that, or I'd always have two: one named something like fixes and tweaks so I have a location for bugs that are discovered without the need to reopen a phase. Closed phases should remain closed.
- Rescan
    - It seems to send the scroll position back to the top of the left pane - can this be avoided?
    - Might need some more visual loading feedback
    - Unless: can it run (sliently) whenever the user has tabbed out of the app and tabs back?
- The sort mode:
    - The compare/work pane should really just allow for "ever" expansion. Now it is limited to comparing four photos at the same time. I think it should just expand
    - Deleting folders should probably be a feature of the app after all
    - When having selected multiple photos, you should also be able to drag all in the left pane into a folder, instead of simply chosing "Send to folder".
    - Unsure if it is a dev mode thing, but when a move is done, nothing happens for a short while, and then the moved photo dissapears. Before that happens, the next photo is given selection and appears in the right pane. The "jumping" selection only happens if one photo is selected. On multiple, just the a bit janky wait happens. I think this needs some more loading feedback on the left pane - the right having the selected image immediately be gone is fine (maybe some soft short fade out or something though)
    - Sending to folder resets scroll position in the left pane - it should preserve it (best effort).
    - I realize that when scrolling far down you lose the opportunity to drag and drop (at least easily) photos in the left pane into folders, since the folders are at the top. It could be nice to get some different ideas here on possible solutions (I know we have the backup of right click, send to folder).
    - In sort mode, the webview's zoom controls actually makes sense. If that means ctrl+/- and ctrl+0 to go back to default. Should have command bar buttons for this as well, and mouse zoom/touch controls should probably also work.
    - There should be a "Clear selection" button.
    - Idea: When sorting through a lot of images, one might spend several nights doing this. A "checkpoint" feature would be handy. Maybe right click an image and add checkpoint with a small note?
- The top bar
    - It is a bit weird that the command bar is shifted all the way to the left (but not undo/redo for some reason). It's left most part should be "anchored" to be aligned with the right most side of the left pane
    - Undo/redo should be moved along side other commands, like slot commands, send to folder etc
- Curious things/possible bugs:
    - I saw 2 scan warnings for PNG files with "Invalid PNG signature". Paths:
        - ~\Documents\2024\Messenger_creation_eb3df000-1357-4298-8665-5351b21fe539.png: Format error decoding Png: Invalid PNG signature.
        - ~\Documents\2024\Messenger_creation_7724ae49-3f97-4dfb-ae5b-fed76a720d62.png


