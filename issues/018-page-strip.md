# 018 – Page strip

Status: done · Depends on: 017

## What

Manage Pages and Spreads from the strip at the bottom of the editor, and give the editor the space the old page buttons used.

## Acceptance criteria

### Strip

- [x] The strip shows one thumbnail per Page. Facing Pages sit close together, with a wider gap between Spreads. Inside Covers are shown as greyed-out placeholders.
- [x] Clicking a Page thumbnail shows its Spread in the editor and selects the Page.
- [x] The Add Spread, Duplicate Page, Delete Spread / Clear Page, Earlier and Later buttons are removed.

### Adding and deleting Spreads

- [x] Hovering between two Spreads, or just before the last Spread, shows a "+" that inserts a new Spread of two empty Pages there. No "+" appears before the first or after the last Spread.
- [x] Hovering a middle Spread shows a × that deletes the Spread. The first and last Spreads have no ×.
- [x] A Spread with two empty Pages is deleted straight away. If either Page has content, the app asks "Discard Spread and its content?" with a "Never ask again" checkbox.

### Right-click menu

- [x] Right-clicking a Page thumbnail shows Insert Spread Before, Insert Spread After, Delete Spread and Duplicate Page onto New Spread. Items that don't apply, such as Insert Spread Before on the first Spread, are disabled.
- [x] Right-clicking an empty part of the strip shows Add Spread, which inserts before the last Spread.
- [x] **Duplicate Page onto New Spread** inserts a new Spread right after the original's Spread, with a copy of the Page on the same side and an empty Page on the other side. For a Page in the last Spread, the new Spread goes just before it, with the copy on the left.

### Reordering

- [x] Dragging a Page thumbnail to another position moves that single Page. Every Page between the old and new position shifts by one, so they may change side.
- [x] A drop indicator shows where the Page will land. Pages cannot be dropped onto an Inside Cover.

### Preferences

- [x] File → Preferences… opens a dialog with a "Confirm Spread deletion" checkbox, stored in the per-computer `settings.json`.
- [x] Checking "Never ask again" clears that checkbox. Checking it again in Preferences brings the question back.

## Implementation and review

- The strip uses the Page renderer with visible-only, bounded 256-pixel Photo
  renditions; the existing core operations retain Page identities and order.
- Review against `4fa8a40` found no standards findings. The spec review's
  thumbnail concurrency, keyboard reordering, modal focus and stale drop
  indicator findings were addressed and covered by focused tests.
- Preferences default to confirming deletion for existing settings files and are
  saved independently of Album content. Alt+Left/Right retains keyboard Page
  reordering after removal of the old buttons.

## Earlier considerations reviewed

- 017's insertion concern is addressed by using the existing core insertion
  operation; the strip calculates only the UI selection after insertion.
- Native WebView2 smoke checks for the strip, Covers, menus, dialogs and gestures
  remain deferred because automated tests cannot exercise the integrated app.
- 002's Library restoration/marker concerns remain resolved by 016; 016's
  mock-only workspace scaffolding and manual Save addendum remain separate work.
- Cache pruning and rendition transport/validation (003/006), external edits
  (004), Slot bounds/handles/helpers (006), Photo identity casing (008),
  missing fonts and controls extraction (009), dense-Page profiling (013),
  toolbar redesign and Layout orientation (014/019/010), and bundle splitting
  (008) remain deferred: the strip does not change those underlying concerns.

## Future considerations (low priority)

- Smoke-test the strip's real drags, keyboard shortcuts, menus and modal focus in
  the native WebView2 app; the automated checks do not replace this.
