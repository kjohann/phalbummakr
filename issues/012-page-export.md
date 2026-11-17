# 012 – Page Export

Status: todo · Depends on: 007, 009, 017

## What

Export every Page as a print-ready image to upload to a Print Provider as full-page photos.

## Acceptance criteria

- [ ] Export renders each Page with the **same renderer** as the editor, at the Page Format's resolution and including the Bleed ([ADR 0002](../docs/adr/0002-tauri-with-ui-side-rendering.md)).
- [ ] Originals, not previews, are decoded for export, with EXIF orientation respected.
- [ ] The output is JPEG in sRGB at quality 95 or higher, with no chroma subsampling, written to `Exports/<Album name>/` as `001.jpg`, `002.jpg` and so on in Page order.
- [ ] Photo scaling uses a high-quality resampling method when converting originals to Page resolution.
- [ ] Inside Covers are never exported; output contains only the Album's Pages.
- [ ] Guides, warnings and selection outlines never appear in exports.
- [ ] A progress indicator is shown, and the UI stays responsive during export.
- [ ] Before export, the tool warns about empty Photo Slots and Pages.
- [ ] Manual check: an exported Page matches the editor view by eye at 100% zoom.
