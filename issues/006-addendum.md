# 006 addendum – Drop feedback, Slots on drop and faster previews

Status: todo · Addendum to: [006 – Photo Slots and placing Photos](006-photo-slots.md)

## Feedback after testing 006

- There's too little visual feedback while dragging a Photo over Slots.
- Dropping a Photo onto a Page should create a Slot when there isn't one.
- Placed Photos took a long time to appear, with no sign that anything was
  loading. This was seen in a dev build (`npm run tauri dev`) and only the first
  time a Photo was placed; cached previews were not noticeably slow.

## Additional acceptance criteria

### Feedback while dragging

- [ ] While a Photo is being dragged, every Photo Slot on the visible Spread is
  subtly highlighted.
- [ ] The Slot under the pointer gets a strong outline and tint.
- [ ] The Slot under the pointer is labelled **Place Photo** if it is empty, or
  **Replace Photo** if it already has a Placement.
- [ ] All drag highlights disappear when the drag ends, whether it's dropped or
  cancelled.

### Creating a Slot on drop

- [ ] Dropping a Photo anywhere on an editable Page outside existing Slots
  creates a new Photo Slot there and places the Photo in it.
- [ ] The new Slot has the Photo's aspect ratio, with its long side at 40% of
  the Page's matching dimension. It's centred on the drop point, clamped to the
  Bleed, and selected.
- [ ] Because the Slot matches the Photo's aspect ratio, its centred Crop shows
  the whole Photo. If clamping changes the Slot's shape, the usual centred,
  filling Crop applies.
- [ ] Dropping on the Inside cover, a **No Page** side, the Spread strip or the
  area around the Pages does nothing.

### Loading feedback

- [ ] When a Photo is placed, the Photo's grid thumbnail appears in the Slot
  immediately, drawn with the Placement's Crop. It's faded and shows a spinner
  until the full preview is ready.
- [ ] When the preview is ready, it replaces the thumbnail without any layout
  change.
- [ ] If the preview fails to load, the Slot shows **Couldn't load Photo** with
  a **Retry** action.
- [ ] The editor still never draws from original files (ADR 0002). Thumbnails
  and previews are both cached renditions.

### Speed

- [ ] Preview generation starts when a Photo drag starts, so the preview is
  often ready by the time it's dropped. Dragging the same Photo again, or
  several drags in a row, doesn't start duplicate work for the same Photo.
- [ ] The `image` crate and its decoders are built with optimisations in the
  dev profile (Cargo `profile.dev.package` overrides). The app's own code keeps
  fast dev builds.
- [ ] Targets, met in both dev and release builds:
  - the thumbnail placeholder appears immediately on drop;
  - an already cached preview appears in under 200 ms;
  - a new preview of a 24 MP JPEG appears within about 1 s of the drop, even
    when the drag was very short.
- [ ] The issue records how the targets were checked by hand, including the
  machine and the Photo used.

## Decisions

- No hint on empty Page areas while dragging. The highlighted Slots and the
  Slot label are enough.
- No background pre-generation of previews for the whole Library, because of
  the disk cost.

## Future considerations (low priority)

- Cache hits fully decode the cached file just to check it's valid
  (`cached_rendition` in `src-tauri/src/photos.rs`). A cheaper check, such as
  "exists and isn't empty", would speed up cached loads.
- Previews and thumbnails are sent to the UI as base64 data URLs
  (`src-tauri/src/lib.rs`). Serving them as files through Tauri's asset
  protocol, or as raw bytes, would avoid the encoding overhead.
