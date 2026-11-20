# 035 – Unlimited Comparison, Clear Comparison and work-area zoom

Status: done · Type: feature · Depends on: 028

## What

A Comparison is limited to four Photos. Remove the limit, add a way to clear the Comparison, and let the user zoom the work area so details stay visible with many Photos shown. "Chosen" Photos are renamed to Selected Photos (see [GLOSSARY.md](../GLOSSARY.md)).

Comes from real use (inbox, Sort mode).

## Acceptance criteria

- [x] Any number of Photos can be added to a Comparison. The work area lays them out in a grid that fits automatically (2×2, 3×2, 3×3 and so on), and tiles shrink down to a minimum size. Past that, the work area scrolls.
- [x] "Choose"/"Unchoose" become "Select"/"Unselect" in menus and labels, and "chosen" becomes "selected" in code and tests.
- [x] "Clear Comparison" in the command bar empties the Comparison, along with the Selected Photos. Escape does the same when no menu or dialog is open. It's disabled when the Comparison is empty.
- [x] In Sort mode, Ctrl+Plus, Ctrl+Minus and Ctrl+0, command bar buttons (− 100% +), and Ctrl+wheel and pinch zoom the work area only. The Photo pane and command bar keep their size. The work area scrolls to show any part of the zoomed Comparison.
- [x] The zoom level is kept while in Sort mode. Clearing the Comparison resets it to 100%.
- [x] Album mode and Layout mode keep using Ctrl+Plus and Ctrl+Minus for a Photo's Crop. The app itself never zooms.

## Notes

- `App.tsx` blocks page zoom keys app-wide. Sort mode has to handle them itself.
- Zoomed in, the 1024 px preview may look soft. See "Preview size" in [028](028-sort-mode.md).

## Implementation notes

- **Core:**
  - `src/core/comparison.ts` drops `MAX_COMPARED` and `canAddToComparison`.
    `chosen`, `toggleChosen` and `chosenPhotos` become `selected`,
    `toggleSelected` and `selectedPhotos`.
  - `comparisonGrid(count)` picks the near-square grid: `ceil(√n)` columns,
    then as many rows as needed.
  - The new `src/core/workAreaZoom.ts` covers the zoom maths:
    - `stepZoom` moves through browser-like preset levels from 25% to 400%,
      and also steps on from a level between presets, such as after a pinch.
    - `zoomBy` scales smoothly and clamps.
    - `zoomLabel` formats the level as a percentage.
    - `anchoredScroll` keeps a point in place while zooming. It also allows for
      a grid that was centred because it was smaller than the work area.
- **UI:**
  - `SortLink.command` now carries a name: `send-to-folder` or
    `clear-comparison`.
  - `onChosenChange(count)` became `onComparisonChange({ shown, selected })`.
    App needs the shown count to enable "Clear Comparison".
  - App owns the zoom, keyed by document like the mode. It is kept while
    switching modes and resets for each Album opened.
  - Clearing, from the command bar or with Escape, sends `clear-comparison` to
    `PhotoBrowser` and resets the zoom to 100%.
  - Escape is ignored in these cases:
    - a menu (`[role='menu']`) or dialog is open;
    - the key event was already handled;
    - focus is in a text field.
  - In Sort mode, App turns Ctrl+Plus, Ctrl+Minus and Ctrl+0 into zoom steps.
    `slotShortcuts.ts` gained `pageZoomStep` and `isPageZoomResetKey`, and
    exports `keyboardTaken`.
  - Album and Layout mode also block Ctrl+0 now, as well as Ctrl+Plus and
    Ctrl+Minus, which still zoom the Crop.
  - A window-level, non-passive wheel listener cancels Ctrl+wheel everywhere,
    so the webview never zooms. `.app-shell` has `touch-action: pan-x pan-y`,
    so a touchscreen pinch never zooms the page.
  - `SortZoomTools` (− 100% +) is rendered into the command bar's tools slot
    in Sort mode. The percentage resets the zoom to 100%. The buttons are
    disabled under the same conditions as the zoom keys.
  - `SortView` renders a scrollable `.sort-view` around a `.sort-view-grid`
    with `--columns`, `--rows` and `--zoom`. The grid size is
    `max(100% × zoom, zoom × the minimum tile size)` per axis. Tiles are at
    least 180 × 150 px at 100%.
  - `margin: auto` centres a grid smaller than the work area. A larger grid
    starts at the top-left, so it can be scrolled fully. A single shown Photo
    always fills the work area at 100%.
  - `useViewZoom` handles Ctrl+wheel (`exp(-Δpx/800)`, about 13% per notch)
    and a two-finger touch pinch over the work area. Both keep the point
    under the pointer, or between the fingers, in place. Keyboard and button
    zooms keep the centre in place.
- **Browser check:** a temporary harness, since removed, ran `SortView` and
  `SortZoomTools` with mocked Tauri calls on port 1530. It checked:
  - 12 Photos fit as 4×3 without scrolling in a 1200×800 window;
  - 30 Photos scroll;
  - Ctrl+wheel keeps the Photo under the pointer, from 100% and from 50%;
  - button zoom keeps the centre;
  - one Photo fills the work area.

  It found and fixed these problems:
  - one wheel notch zoomed far too much at high display scaling;
  - the anchor was wrong for a centred grid below 100% (code review);
  - a wheel at the zoom limit left a stale anchor (code review).

## Earlier considerations reviewed

- **028, Preview size:** still deferred. Zooming in on the 1024 px preview
  can look soft, as this issue's notes expected. A larger rendition needs a
  new cached size in `photos.rs`.
- **028, Grid scrolling and Keyboard; 032, 033 and 034 native checks and
  Standards notes:** unrelated to this change, and left deferred. The 032
  note about the duplicated class-name builder still applies to `SortView`.
- **Inbox:** no notes are resolved by this change.

## Future considerations (low priority)

- **Native check:** in `tauri dev` (WebView2), check these with a real
  Library:
  - Ctrl+wheel and touchpad pinch zoom only the work area;
  - Ctrl+Plus, Ctrl+Minus and Ctrl+0 never zoom the app;
  - Escape clears the Comparison but only closes an open context menu.
- **Touchscreen pinch:** only unit-tested with synthetic touch events; check
  it on a touch device.
- **Fixed gaps:** the 14 px gaps don't scale with the zoom, so the anchored
  point drifts slightly over large zoom changes.
- **Code review (Standards), judgement calls left:**
  - `slotShortcuts.ts` now also holds page-zoom and keyboard-ownership
    helpers used by Sort mode (Divergent Change). Move them to their own
    module if more appear.
  - The "state for the current document" pattern (`modeState`,
    `sortZoomState`) is repeated in App. A small helper would do if a third
    one appears.
- **Code review (Spec):** the zoom is kept when leaving and coming back to
  Sort mode, not only while in it. Ctrl+0 is now blocked in every mode. Both
  were judged in the spirit of "The app itself never zooms".