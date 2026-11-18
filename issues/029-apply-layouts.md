# 029 – Applying Layouts in Album mode

Status: done · Type: feature · Depends on: 010, 023

## What

Apply Layouts from the Layout Library to Pages, and save a Page as a new Layout, without leaving Album mode.

## Acceptance criteria

- [x] In Album mode, the Side pane has a Photos | Layouts tab (moved here from the closed [025](025-folder-tree.md)).
- [x] The Layouts tab of the Side pane lists the Layout Library with previews.
- [x] Dragging a Layout onto a Page applies it to that Page.
- [x] Right-clicking a Layout offers "Apply to left Page" and "Apply to right Page" for the current Spread. Only the option for the real Page is offered on Spreads that include an Inside Cover.
- [x] Applying uses the domain-core apply function from [010](010-layouts.md): Placements and text move into the new Slots in order, leftovers are dropped with a notice, and a different aspect ratio shows a warning.
- [x] "Save as Layout" in the command bar stores the current Page's Slots as a new Layout, keeping geometry, orientation and Text Slot styles but no Photos or text.
- [x] The Album embeds a copy of each Layout it uses. Later edits to the Layout Library never change existing Pages.
- [x] The "Photo pane" is renamed "Side pane" everywhere, including the persisted setting, which migrates from the old name.

## Notes

- **Embedding (decided with the user):** applying a Layout copies its Slots
  onto the Page, and the two are unlinked from then on. The copied Slots are
  the embedded copy. The Album file gets no separate list of Layouts. The core
  test "copies the Layout, so later edits to the Layout never change the Page"
  covers this.
- **Domain core:** `saveLayoutFromPage(library, album, pageId)` in
  [`layouts.ts`](../src/core/layouts.ts) appends a new `layout-<uuid>` with the
  Page's Slots stripped of content and the Album's aspect ratio.
- **Shared Layout Library:**
  [`useLayoutLibrary`](../src/ui/useLayoutLibrary.ts) holds what
  `LayoutWorkspace` used to own: loading, seeding, the 500 ms autosave,
  busy reporting, errors and retries. `DocumentWorkspace` calls it once and
  passes it to both modes, so a Layout saved in Album mode shows up in Layout
  mode right away.
  - It now loads when an Album opens, not the first time Layout mode opens,
    because Album mode also needs it. A seeded Library is still not written
    until something changes (ADR 0001).
- **Cards:** [`LayoutLibraryPane`](../src/ui/LayoutLibraryPane.tsx) renders
  the cards, previews, labels and the "Other aspect ratio" badge for both
  modes.
  - In Layout mode, clicking a card selects it.
  - In Album mode, cards can be dragged. Right-click opens the Apply menu, and
    so does a plain click, so the menu is reachable without a mouse.
- **Album mode** ([`AlbumView`](../src/ui/AlbumView.tsx)):
  - It portals the cards into the Layouts tab.
  - **Drag:** the drag carries only the Layout id
    (`application/x-phalbummakr-layout`, in [`photoDrag.ts`](../src/ui/photoDrag.ts)).
    Canvas Pages and their Slot overlays accept it, and the target Page gets a
    dashed outline. Page strip thumbnails do not accept it, by the user's
    choice.
  - **Apply menu:** portalled to the body. Rendered inside the workspace, it
    was painted under the Side pane.
  - **Notices:** applying selects the Page. What was dropped and any aspect
    ratio mismatch appear as a dismissible notice in `AlbumWorkspace`.
  - **Failed Library saves:** in Album mode they show an error with
    "Retry Layout Library save", and clear the "Saved … as a new Layout"
    notice.
- **Command bar:** Save as Layout sits with the Album commands (overflow 2).
  It is disabled until the Layout Library is loaded, and while it is saving or
  after a failed save.
- **Side pane rename:**
  - `PhotoPane.tsx` is now `SidePane.tsx`, with matching type, prop, CSS class
    and label names.
  - The Rust `SidePane` setting is stored as `sidePane`. It reads the old
    `photoPane` key through `#[serde(alias = "photoPane")]`.
  - The command is now `set_side_pane`.
- **Tests:**
  - core: Save as Layout.
  - Rust: `side_pane_keeps_the_layout_saved_under_its_old_photo_pane_name`.
  - `AlbumWorkspace.test.tsx`:
    - the Apply menu, including Inside Cover Spreads, with notices;
    - drag onto a Page and onto a Slot;
    - Save as Layout;
    - a failed Library save with retry.
  - `App.test.tsx`:
    - the Photos | Layouts tab;
    - one Library shared by both modes;
    - Save as Layout routing.
  - `LayoutWorkspace.test.tsx`: its harness now uses `useLayoutLibrary`, and
    all of its tests pass unchanged.
- **Browser check:** a temporary harness (since removed) checked these:
  - the tabs and cards;
  - the Apply menu, offering only the right Page on the first Spread;
  - a real `DragEvent` drop applying a Layout.

## Earlier considerations reviewed

- **"Photo pane" naming:** resolved by the full rename to "Side pane" with
  setting migration. The naming was raised in [010](010-layouts.md), the
  [023 addendum](023-addendum.md) and this issue.
- **[014](014-slot-rotation.md):** resolved. It asked to test Layout
  orientation and content transfer end to end.
  - Orientation transfer is covered in the core.
  - Album mode now applies Layouts end to end, moving Photos into the new
    Slots, as the `AlbumWorkspace` tests show.
- **[010](010-layouts.md):** these points are still deferred:
  - the duplicated Slot interaction code, which is left for 011;
  - seeding from the open Album's format;
  - aspect-ratio notices, now also shown when applying;
  - native checks;
  - undo.
- **[020](020-photo-pane.md):** the pane defaults are still defined in both
  Rust and TypeScript. The rename did not change that.
- **Native WebView2 drag checks** (005, 006, 015, 018): still deferred. Layout
  drags join them.
- Other open points (filesystem-aware Usage, preview caches, bundle splitting)
  are unrelated and stay deferred.

## Future considerations (low priority)

- **Undo:** applying a Layout removes leftover Photos and text with only a
  notice, and there is no undo until [011](011-undo-redo.md). 011 should cover
  Apply Layout.
- **Native check:** check Layout drags from the Side pane onto Pages in
  WebView2. Playwright's `dragTo` hung in the integrated browser, so only
  dispatched `DragEvent`s were checked.
- **Code review (Standards), judgement calls left:**
  - `applyLayoutTo` applies the Layout once to `savedAlbum` for the notice and
    again in `changeAlbum`. That follows the existing Photo-drop pattern
    (`placePhotoOnPage`).
  - `photoDrag.ts` now also holds the Layout drag helpers, so a name like
    `dragData.ts` would fit better.
  - `plural` is exported from the `LayoutLibraryPane` component file.
  - `App.tsx` grew the `PaneTabs` component and Layout Library readiness
    plumbing alongside the rename. `PaneTabs` could move into `SidePane.tsx`.
- **Code review (Spec):** a plain click on a Layout card also opens the Apply
  menu. The spec only mentions right-click. It is kept for keyboard and
  touch-pad access.
- **Menu font:** the Apply menu, like the existing canvas menus, uses the
  browser's default button font.
