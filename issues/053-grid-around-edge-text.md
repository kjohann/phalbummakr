# 053 - Apply grid around edge text

Status: todo · Type: feature · Depends on: 045

## What

Extend [045 - Quick grid layout tool](045-quick-grid-layout.md) so Apply grid in
Album mode can preserve existing edge-aligned Text Slots and fill the remaining
rectangle with a Grid Layout.

Today the command is available on Pages containing only text, but applying a
grid replaces their Slots and removes the text. The new behavior preserves
eligible Text Slots automatically, on Pages with or without existing Photos.
Unsupported text arrangements get an explicit choice to remove text and apply
an ordinary grid, or cancel.

Reserve whole edge strips rather than shrinking or omitting individual Photo
Slots. This retains the glossary's meaning of Grid Layout: equal-sized Photo
Slots arranged in rows and columns. Users can adjust individual Slots manually
afterwards.

## Acceptance criteria

### Recognising edge text

- [ ] Start from the normal grid area: the Page inset by the greater of 15 mm
      and the Safe Zone margin on each side.
- [ ] Recognise horizontal Text Slots at the top or bottom, and vertical Text
      Slots at the left or right. Both directions along an edge qualify:
      rotations of 0 or 180 degrees for top/bottom, and 90 or 270 degrees for
      left/right.
- [ ] Determine eligibility using the entire visible, rotation-aware Text Slot
      rectangle, not the bounds of its letters. Include empty Text Slots.
- [ ] A Text Slot qualifies when its visible bounds lie within an edge's outer
      quarter of the normal grid area, allowing extension outward beyond that
      area's edge. In particular:
      - Top: its bottom is at or above the top-quarter boundary.
      - Bottom: its top is at or below the bottom-quarter boundary.
      - Left: its right is at or left of the left-quarter boundary.
      - Right: its left is at or right of the right-quarter boundary.
      Boundaries are inclusive; measure the quarter before reserving any strips
      and without adding the text-to-grid gap to the eligibility test.
- [ ] Text Slots may occupy multiple edges, and multiple Text Slots may qualify
      for the same edge. Recognition is automatic; no edge selector is added.

### Building and applying the grid

- [ ] Preserve every qualifying Text Slot exactly, including its identity,
      content, formatting, position, dimensions and rotation.
- [ ] Reserve a full strip at each qualifying edge. Move that edge of the grid
      area inward only as far as necessary to leave a 6 mm gap from every
      qualifying Text Slot on that edge. The deepest Text Slot sets the
      boundary. Never expand the grid beyond its normal area.
- [ ] Text already outside the normal grid area with sufficient separation is
      preserved without needlessly reducing that area.
- [ ] Use the shared remaining rectangle for the selected rows and columns.
      Fill that rectangle rather than forcing it to be square. Keep Photo Slots
      equal-sized, unrotated, and separated by the existing 6 mm gaps.
- [ ] Do not shrink or omit individual Photo Slots, change the selected row or
      column counts, or silently reduce gaps to accommodate text.
- [ ] Support Pages containing only text and Pages containing both text and
      Photos. Transfer existing Photos in the current order, retaining the
      existing fitting and overflow-notice behavior.
- [ ] Apply is one undoable Album change. Undo restores the original Page,
      including all text and Photo content; redo restores the applied result.
- [ ] Subsequent text edits or moves do not automatically reflow the grid.
      Applying the grid again recalculates the available rectangle.

### Explicit replacement fallback

- [ ] If any Text Slot fails recognition, explain that the grid cannot preserve
      the current text arrangement and offer **Remove text and apply full-page
      grid** or **Cancel**. Do not delete, move or overlap text without this
      explicit choice.
- [ ] Offer the same choice when eligible text leaves insufficient room for the
      selected rows, columns and gaps, explaining that the selected grid does
      not fit around the text. The user can cancel and choose different grid
      dimensions.
- [ ] The replacement choice removes all Text Slots, including qualifying edge
      text and empty Text Slots, and applies the ordinary grid within its normal
      inset. It is not a partial-preservation strategy.
- [ ] Cancel is the safe default and leaves the Page unchanged.
- [ ] Validate that resulting Photo Slot width and height are positive, using
      the existing grid validity rules rather than introducing a new minimum
      size. If even the ordinary grid cannot fit, applying it remains unavailable.
- [ ] Removing text through the fallback is part of the same undoable operation
      as applying the grid.

### Dialog and unchanged behavior

- [ ] Retain the schematic row/column picker; a new live destination-Page
      preview is not required.
- [ ] Clearly indicate which edges reserve space for preserved text, for
      example, "Text preserved - space reserved at top and left". Clearly label
      the destructive fallback and its reason when preservation is unavailable.
- [ ] Text-free Pages retain their existing Apply grid behavior.
- [ ] Applying saved Layouts, generating grids in Layout mode, and Layout
      Library persistence remain unchanged. Applied grids remain ordinary,
      editable arrangements with no live link to text.

## Verification scenarios

Cover these cases with focused tests when implementing:

- A horizontal title at the top of an otherwise empty Page is preserved, with a
  uniform grid below it. Equivalent bottom, left and right cases work, including
  reversed text directions.
- A short title still reserves a whole strip, not just space beneath its letters.
- Several titles on one edge and text on two different edges produce the correct
  single remaining rectangle.
- A Text Slot exactly on the outer-quarter boundary qualifies; one just beyond
  it does not. Rotation-aware bounds and empty Text Slots follow the same rules.
- Text in the outer inset with an existing sufficient gap does not move the
  normal grid boundary.
- A Page containing both text and Photos preserves the text and transfers Photos;
  excess Photos retain the current overflow behavior.
- A central caption, or a mixture of supported and unsupported text, triggers the
  explicit all-text-removal fallback. Cancellation leaves everything untouched.
- A selected grid that cannot fit around text offers replacement or cancellation;
  a grid that cannot fit even without text cannot be applied.
- Undo and redo cover both the preserving path and destructive fallback, without
  separate intermediate changes.

## Scope boundaries

Per-Photo-Slot collision handling, shrinking or omitting individual Photo Slots,
live text-driven reflow, and a new Page preview are intentionally outside this
issue. [052 - Smart placement](052-smart-photo-placement.md) concerns adding a
new Photo beside existing Photo Slots and is not a prerequisite.
