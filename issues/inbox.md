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
- Album mode
    - More placement snapping lines, like aligning to the middle of a page, and also when free placing a slot that lines up with another, it would be nice to get help to place it at the same distance from for example the right edge as the aligned slot is from the left (or top/bottom), as well as distances from other slots. Basically snapp help to free place grid like layouts.
        - Related: [052 - Smart placement](052-smart-photo-placement.md) plans equal spacing when adding a Photo to a row or column. The broader snapping request remains here; that work is not implemented or resolved by recording 052.
    - Z-index: move slots back, or forwards. Also with "Send to back" and "Bring to front" options.
    - Ctrl to mark several slots and move them togheter, preserving spacing and such.

- The top bar
    - It is a bit weird that the command bar is shifted all the way to the left (but not undo/redo for some reason). It's left most part should be "anchored" to be aligned with the right most side of the left pane
    - Undo/redo should be moved along side other commands, like slot commands etc
- Image optimization
    - Is this a feasible feature? I noticed one of the photo book vendors we use has this. Described (in Norwegian) like this: Automatisk bildeforbedring prøver å justere bilder ved å f.eks. lyse opp skygger, øke kontrast og fargemetning for at motivet skal bli klarere og komme bedre fram på kortet.
    - It continues to say that if you have profesionally edited photographs you should probably leave the feature off, but I don't see any way of doing it on only some images. 
- Curious things/possible bugs:
    - I saw 2 scan warnings for PNG files with "Invalid PNG signature". Paths:
        - ~\Documents\2024\Messenger_creation_eb3df000-1357-4298-8665-5351b21fe539.png: Format error decoding Png: Invalid PNG signature.
        - ~\Documents\2024\Messenger_creation_7724ae49-3f97-4dfb-ae5b-fed76a720d62.png


