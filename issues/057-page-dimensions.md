# 057 - Built-in Page dimensions and controlled dimension changes

Status: todo · Type: feature · Depends on: 004, 011, 012, 016, 022, 055

## What

Offer built-in physical Page dimensions when creating an Album, and two explicit
ways to change an existing Album's dimensions without general Reflow:

- **Proportional scaling**: linked width and height preserve the aspect ratio.
  Slots and text scale together, preserving the design's appearance and Photo
  framing. Effective Resolution changes with the physical size.
- **Page boundary adjustment**: independent width and height change the trim
  boundary without changing Slots' physical size or position, text size or Photo
  framing. The user must prepare every Page to fit before applying the change.

Dimensions describe one trimmed Page, not a Spread, and are written width by
height. New Album offers only these built-in choices:

| Choice | Width (cm) | Height (cm) |
| ------ | ---------- | ----------- |
| A4 landscape | 29.7 | 21 |
| A4 portrait | 21 | 29.7 |
| 16 x 16 | 16 | 16 |
| 20 x 20 | 20 | 20 |
| 28 x 28 | 28 | 28 |
| 21 x 28 | 21 | 28 |
| 28 x 21 | 28 | 21 |

Existing Album settings allow numeric dimensions through the two operations
above. There is no percentage limit or shape/orientation restriction on a
boundary adjustment: eligibility depends on the actual geometry. This can allow
a manually prepared rectangle-to-square change, but never adapts content
automatically.

Bleed, Safe Zone margins, export resolution and the Effective Resolution warning
threshold remain independently specified. Scaling does not scale the margins.

This follows [004](004-create-album.md) and its
[settings addendum](004-addendum.md), retaining the per-axis margins introduced
in [055](055-per-axis-bleed-and-safe-zone.md). The general Reflow and provider
Page Format Preset ideas in the [backlog](backlog.md) remain separate work.

## Acceptance criteria

- [ ] Both New Album entry points offer all seven choices with clear centimetre
  dimensions and orientation labels for A4. A4 landscape remains the default;
  custom numeric dimensions are not offered during creation.
- [ ] Existing Albums retain their saved format until explicitly changed.
  Existing A4 landscape files continue to open without migration of their design.
- [ ] All choices produce the correct physical Page dimensions in Album mode,
  Spread and Page previews, Layout mode, and Page Export. Export pixel dimensions
  derive from the selected dimensions, per-axis Bleed and export resolution.
- [ ] Creating an Album retains the existing initial Bleed, Safe Zone, export
  resolution and Effective Resolution threshold defaults regardless of size.
- [ ] Album settings distinguish "Scale proportionally" with linked dimensions
  from "Adjust page boundary" with independent dimensions, explaining what each
  operation preserves.
- [ ] Proportional scaling preserves the current aspect ratio and scales every
  Slot's physical position and dimensions, including text size, by the same
  factor. Photo framing, Fit behaviour, rotations and the design's relative
  appearance are preserved; no Crop is reset.
- [ ] Proportional scaling is not subject to the boundary-adjustment Slot-bounds
  gate. Intentional Bleed placements do not require manual repositioning merely
  to scale the design.
- [ ] Page boundary adjustment preserves every Slot's physical size and distance
  from the Page's top-left trim edge, text size and Photo framing. It does not
  reposition Slots, reshape them, rewrap text through a changed physical width,
  or automatically fix the design.
- [ ] Before any boundary adjustment, the current Safe Zone rectangle must fit
  entirely within the proposed trim boundary. The check uses the current margins,
  not a smaller Safe Zone introduced only in the pending adjustment. Users can
  first apply margin changes and prepare their Pages, then try again.
- [ ] Before any boundary adjustment, every Slot on every Page must fit entirely
  within the proposed trim boundary, including rotated corners. Bleed is not an
  allowance for this check; intentional bleeding Slots also block the change.
  Slots need not be inside the Safe Zone.
- [ ] A blocked boundary adjustment explains the failed constraint and identifies
  affected Page numbers for Slot failures, telling users to fix those Pages.
  No Page or format change is partially applied.
- [ ] Dimension and margin inputs have explicit units and reject invalid values
  with clear feedback. Proposed margins must leave a usable Safe Zone; they are
  never silently reduced to fit a new Page size.
- [ ] Other Page Format settings remain unchanged by a dimension operation unless
  independently edited by the user. Effective Resolution warnings update for the
  new physical Slot sizes; low resolution warns but does not block scaling.
- [ ] Selecting or entering dimensions changes only the settings draft. Applying
  a dimension change requires confirmation describing its effects and advising
  the user to check Pages. Cancellation leaves the Album untouched; completion
  gives a review reminder without adding persistent per-Page review state.
- [ ] Each dimension operation, including its accompanying design changes, is one
  undoable operation. Undo/redo restores the format and design together. Normal
  autosave persists the result, and reopening retains it without persisting
  session-only undo history.
- [ ] Shared saved Layouts are not rewritten when an Album changes dimensions.
  Layout mode uses the Album's current format, and existing cross-ratio warnings
  and proportional Layout application behaviour remain available.

## Boundary-adjustment example

An A4 landscape Page is 297 x 210 mm. To change it to 280 x 210 mm, the
current right Safe Zone edge must be at or before 280 mm, requiring a horizontal
Safe Zone margin of at least 17 mm. An edge at 27.9 cm (279 mm) corresponds to
an 18 mm horizontal margin. All Slots, including their rotated corners, must
also fit inside the proposed 280 x 210 mm trim boundary.

Increasing the margin alone does not fix Slots: the user must adjust any
out-of-bounds content on every affected Page before applying the dimension
change.

## Future considerations (low priority)

- General Reflow that adapts a design to a different shape is deferred. Earlier
  interview proposals to keep proportional Slot geometry, refit Crops and
  remeasure text for arbitrary shape changes were superseded by the two
  controlled operations above.
- Tools to create another Album and import Photos/Slots from another Album's
  Pages, page by page, are deferred as an alternative to drastic in-place
  changes. Their detailed design is outside this issue.
- Automatic redistribution of Slots within a Page's new Safe Zone, or another
  "fix all" tool after dimension changes, is deferred. This issue deliberately
  requires manual preparation for boundary adjustments.
- Persistent Page review badges and acknowledgement tracking are deferred.
  Confirmation and completion reminders are sufficient for this feature.
- Provider-specific reusable Page Format Presets, including page-count rules,
  remain deferred. The seven built-in dimension choices are not provider presets.
