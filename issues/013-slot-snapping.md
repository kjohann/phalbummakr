# 013 – Slot snapping

Status: doing · Depends on: 006, 009

## What

Make it easier to align Photo and Text Slots while preserving free placement.

## Acceptance criteria

- [ ] Moving or resizing a Photo Slot or Text Slot snaps it to Page edges, the Safe Zone, other Slots, and equal gaps between Slots when it is near an alignment target.
- [ ] Snapping is optional proximity assistance: a Slot can be placed anywhere, including the first Slot on an empty Page; no target is mandatory.
- [ ] Alignment guides show which target is being snapped to.
- [ ] A temporary modifier-key bypass allows free placement even while a Slot is within snap distance.

## Implementation and verification

- Moving and resizing use the nearest eligible target within six screen pixels
  on each axis: trim edges, Safe Zone edges, other Slot edges or centers, and
  equal gaps between neighboring Slots on the same Page. Gap guides mark both
  distances; other guides identify their target.
- Hold Alt to bypass snapping, including when pressed or released mid-gesture.
  The editor displays this hint. Guides are transient HTML/SVG overlays, not
  part of the Page rendering or saved Album.
- Targets respect existing Bleed and minimum-size constraints. Proximity is
  measured before those constraints, so dragging well past the trim edge can
  still reach the Bleed. Text Slot resizing remains width-only and checks gap
  targets against the fitted height after reflow.
- Focused geometry and workspace tests cover proximity, both Slot types,
  movement, resizing, gaps, constraint handling, text reflow and Alt.
- A browser check with an in-memory Album exercised actual mouse and Alt
  gestures, equal-gap guides, Page and Safe Zone guides, and saved geometry.
  It did not exercise the integrated native WebView2 application.

## Earlier considerations reviewed

- **002-004:** Library startup messages, marker and port duplication, thumbnail
  cache pruning and external-edit detection are unrelated to Slot snapping.
- **005-007:** Native WebView2 gesture checks remain useful. Bleed-setting
  warnings, additional resize handles, keyboard nudging, validator sharing,
  Photo orientation duplication and Crop behavior are outside this issue.
  The shared Rectangle type already introduced for text layout is reused.
- **006 addendum:** Preview transport, cache validation, preview-state maps
  and LRU factoring are unrelated to alignment.
- **008:** Filesystem-aware Photo identity remains in its addendum; bundle
  splitting is unrelated to snapping.
- **009 and its addendum:** Text controls remain extracted and attached.
  Missing-font warnings and native checks of text controls remain deferred.
