# 006 addendum – Drop feedback, Slots on drop and faster previews

Status: doing · Addendum to: [006 – Photo Slots and placing Photos](006-photo-slots.md)

## Feedback after testing 006

- There's too little visual feedback while dragging a Photo over Slots.
- Dropping a Photo onto a Page should create a Slot when there isn't one.
- Placed Photos took a long time to appear, with no sign that anything was
  loading. This was seen in a dev build (`npm run tauri dev`) and only the first
  time a Photo was placed; cached previews were not noticeably slow.

## Additional acceptance criteria

### Feedback while dragging

- [x] While a Photo is being dragged, every Photo Slot on the visible Spread is
  subtly highlighted.
- [x] The Slot under the pointer gets a strong outline and tint.
- [x] The Slot under the pointer is labelled **Place Photo** if it is empty, or
  **Replace Photo** if it already has a Placement.
- [x] All drag highlights disappear when the drag ends, whether it's dropped or
  cancelled.

### Creating a Slot on drop

- [x] Dropping a Photo anywhere on an editable Page outside existing Slots
  creates a new Photo Slot there and places the Photo in it.
- [x] The new Slot has the Photo's aspect ratio, with its long side at 40% of
  the Page's matching dimension. It's centred on the drop point, clamped to the
  Bleed, and selected.
- [x] Because the Slot matches the Photo's aspect ratio, its centred Crop shows
  the whole Photo. If clamping changes the Slot's shape, the usual centred,
  filling Crop applies.
- [x] Dropping on the Inside cover, a **No Page** side, the Spread strip or the
  area around the Pages does nothing.

### Loading feedback

- [x] When a Photo is placed, the Photo's grid thumbnail appears in the Slot
  immediately, drawn with the Placement's Crop. It's faded and shows a spinner
  until the full preview is ready.
- [x] When the preview is ready, it replaces the thumbnail without any layout
  change.
- [x] If the preview fails to load, the Slot shows **Couldn't load Photo** with
  a **Retry** action.
- [x] The editor still never draws from original files (ADR 0002). Thumbnails
  and previews are both cached renditions.

### Speed

- [x] Preview generation starts when a Photo drag starts, so the preview is
  often ready by the time it's dropped. Dragging the same Photo again, or
  several drags in a row, doesn't start duplicate work for the same Photo.
- [x] The `image` crate and its decoders are built with optimisations in the
  dev profile (Cargo `profile.dev.package` overrides). The app's own code keeps
  fast dev builds.
- [x] Targets, met in both dev and release builds:
  - the thumbnail placeholder appears immediately on drop;
  - an already cached preview appears in under 200 ms;
  - a new preview of a 24 MP JPEG appears within about 1 s of the drop, even
    when the drag was very short.
- [ ] The issue records how the targets were checked by hand, including the
  machine and the Photo used.

## Implementation and verification

- `src/core/slots.ts` creates a Photo Slot from the drop point, clips it to the
  Bleed, and computes a centred filling Crop for the resulting shape.
- `src/ui/AlbumView.tsx` provides drag feedback, accepts drops only on editable
  Pages/Slots, selects newly created Slots, and shows thumbnail/preview status.
- `src/ui/PhotoBrowser.tsx` sends the cached grid thumbnail with the drag and
  starts a revision-aware preview request. `src/ui/tauriPhotoPorts.ts` dedupes
  in-flight and recent preview requests.
- Rust editor previews are capped at 1024 px on the long edge. This lower cap is
  specific to editor renditions; Page Export still uses the original Photo.
  The dev profile optimizes `image`, `png`, `moxcms`, `pxfm`, `zune-core` and
  `zune-jpeg`, while leaving the app crate unoptimized.
- Automated timing probe on an Intel Core Ultra 9 285H, using a generated
  `synthetic-24mp.jpg` (6000 x 4000): dev new preview 1.10 s, cached 31 ms;
  release new preview 944 ms, cached 32 ms. The probe called the Rust preview
  function directly, not the full Tauri drag/drop flow.
- A manual integrated Tauri/WebView2 check with a real Library Photo remains
  outstanding. The automated test harness cannot verify native drag events or
  supply the real Photo required by the hand-check criterion.

## Decisions

- No hint on empty Page areas while dragging. The highlighted Slots and the
  Slot label are enough.
- No background pre-generation of previews for the whole Library, because of
  the disk cost.
- Editor preview renditions use a 1024 px long-edge cap to keep a short-drag
  24 MP preview near the one-second target in dev and release builds.

## Earlier considerations reviewed

- **002:** startup messaging, marker-name duplication and Library port size are
  unrelated; still deferred.
- **003:** pruning old on-disk thumbnail/preview renditions remains deferred;
  the bounded UI preview request cache does not address disk cleanup.
- **004:** detecting external edits before autosave is unrelated; still deferred.
- **005:** native WebView2 mouse/HTML drag smoke testing is now directly relevant
  and remains outstanding with the manual Tauri check above.
- **006:** existing Album validation intentionally permits Slots outside a
  changed Bleed; new drop-created Slots are clamped. Resize handles, a shared
  rectangle type, `exactRecord` sharing, and duplicated orientation rules are
  unrelated and remain deferred.

## Future considerations (low priority)

- Cache hits fully decode the cached file just to check it's valid
  (`cached_rendition` in `src-tauri/src/photos.rs`). A cheaper check, such as
  "exists and isn't empty", would speed up cached loads.
- Previews and thumbnails are sent to the UI as base64 data URLs
  (`src-tauri/src/lib.rs`). Serving them as files through Tauri's asset
  protocol, or as raw bytes, would avoid the encoding overhead.
- `AlbumView` keeps per-Slot thumbnails and preview status in separate maps;
  consider combining them if the preview lifecycle grows.
- The preview request cache promotes entries with repeated delete/set pairs;
  consider a small LRU helper if that cache grows.
