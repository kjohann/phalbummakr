# 012 – Page Export

Status: todo · Depends on: 007, 009

## What

Export every Page as a print-ready image to upload to a Print Provider as full-page photos.

## Acceptance criteria

- [ ] Export renders each Page with the **same renderer** as the editor, at the Page Format's resolution and including the Bleed ([ADR 0002](../docs/adr/0002-tauri-with-ui-side-rendering.md)).
- [ ] Originals, not previews, are decoded for export, with EXIF orientation respected.
- [ ] The output is JPEG in sRGB at high quality, written to `Exports/<Album name>/` as `001.jpg`, `002.jpg` and so on in Page order.
- [ ] Guides, warnings and selection outlines never appear in exports.
- [ ] A progress indicator is shown, and the UI stays responsive during export.
- [ ] Before export, the tool warns about empty Photo Slots and Pages.
- [ ] Manual check: an exported Page matches the editor view by eye at 100% zoom.
