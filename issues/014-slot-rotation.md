# 014 – Slot rotation

Status: todo · Depends on: 006, 009

## What

Rotate a Slot together with the content it holds.

## Acceptance criteria

- [ ] Photo Slots and Text Slots can be rotated in 90° turns in either direction.
- [ ] Rotating a Slot rotates its content with it. For Text Slots, the text rotates with the Slot; vertical text with normally oriented letters can be made with a narrow, tall Text Slot.
- [ ] Rotation preserves the Slot's center and swaps its page-space width and height. Rotation does not automatically clamp the Slot to the Bleed.
- [ ] Slot orientation belongs to the Slot, not its content. A photo in a Slot is oriented by that Slot.
- [ ] Saving and applying a Layout preserves each Slot's orientation. When existing content is transferred into a rotated Slot, it follows the Slot's orientation.
