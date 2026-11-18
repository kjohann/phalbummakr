# 010 addendum

Addendum to [010 – Layouts, the Layout Library and Layout mode](010-layouts.md).

## Section 1 - Better predefined Layouts and placeholder text

Status: done

### Feedback

The predefined three-column Layout has tall Slots that fill the Page height.
It should have three equal landscape Slots instead. Portrait variants would
be useful too. Layout mode shows "Sample text" in Text Slots. Text Slots
should have their own placeholder text instead, which also helps in Album
mode.

### Additional acceptance criteria

- [x] The predefined three-column Layout has three equal landscape (3:2) Photo
  Slots in a row, centred vertically.
- [x] Two more predefined Layouts: a 2×2 grid of portrait (2:3) Photo Slots,
  and a row of three portrait (2:3) Photo Slots, both centred on the Page.
- [x] Every Text Slot has placeholder text, "Text" by default. Layouts and
  Pages store it, applying a Layout copies it, and Albums saved before this
  change open with the default.
- [x] An empty Text Slot shows its placeholder on the canvas, in the Slot's
  font and size but greyed out. It disappears once the Slot has text. It is
  never shown in Page previews in the strip or in Page Export.
- [x] In Layout mode, Text Slots show their placeholder instead of
  "Sample text". Double-clicking a Text Slot, or pressing Enter on it, edits
  its placeholder. Placeholders can only be edited in Layout mode.

### Notes

- Predefined Layouts are seeded once, so a Library whose Layout Library was
  already saved keeps its Layouts. Only Libraries without one get the new
  set.
- `TextSlot` has a `placeholder` field: `DEFAULT_PLACEHOLDER` ("Text"),
  `setSlotPlaceholder`.
  - Album and Layout Library files saved without it open with the default.
    A non-string placeholder is rejected.
  - `validateSlots` now checks required and optional keys, instead of
    listing every exact key combination.
- **Predefined set** (11 Layouts), in order:
  - full bleed, two side by side, one large with two stacked
  - three landscape, three portrait
  - 2×2, 2×2 portrait, 2×3, 3×3
  - caption, title

  `centredGrid` sizes equal 3:2 or 2:3 Slots as large as they fit, centred
  on the Page.
- **Showing placeholders:** `TextContent` takes `showPlaceholder`. The Album
  and Layout canvases pass it; strip previews pass `false`, and Page Export
  (012) must too. The placeholder is drawn at 40% opacity.
- **Measuring:** Album mode measures only the real text, so an empty Text
  Slot keeps one line and never warns about overflow because of its
  placeholder. Layout mode measures the placeholder, as it is the text
  shown (`fitTextSlots`/`applySlotDrag` `measurePlaceholders`). A code
  review found the first version measured placeholders everywhere.
- **Editing:** in Layout mode, double-click or Enter edits the placeholder
  in a text editor styled like the Slot. Escape, or selecting another Slot,
  ends editing. Album mode's text editor also shows the placeholder as its
  native placeholder while it is empty.
- The glossary gains **Placeholder text** (the review flagged that
  "placeholder" was only on the Slot _Avoid_ list).
- **Tests:**
  - core: geometry, default and legacy placeholders, copying on apply
  - Album: greyed on the canvas, absent from the strip, sizing by real text
  - Layout: placeholder shown, edited and sized
- **Browser check:** a temporary harness (removed) showed the new cards and
  the greyed "Text" placeholder.

### Earlier considerations reviewed

- 010's "Duplicated code" point stays deferred and has grown: the
  placeholder editor repeats Album mode's text editor (rotation, styling,
  event handling). It belongs with the shared Slot-overlay refactor noted
  in 010.
- 010's "Seeding" point is unchanged. The new predefined Layouts only reach
  Libraries without a saved Layout Library.
- The other open points in earlier issues are unrelated to predefined
  Layouts or placeholders.

### Future considerations (low priority)

- **Code review (Standards):**
  - The placeholder editor and Album mode's text editor should share a
    `TextSlotEditor`.
  - `rotation === 90 || rotation === 270` keeps recurring.
  - The tests address predefined Layouts by position (`[9]`,
    `predefined-10`), so inserting a Layout shifts them.
- **Code review (Spec):** the Layout-mode tooltip "Double-click to edit the
  placeholder", and the native placeholder in Album mode's editor, go
  slightly beyond the addendum. They are kept because they make the
  feature discoverable.
- In Album mode, a placeholder longer than one line is clipped to the
  Slot's one-line height.

