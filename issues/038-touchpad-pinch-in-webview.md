# 038 – Touchpad pinch does not zoom Sort mode in the app

Status: doing · Type: bug · Depends on: 035

## What

In the built app, pinching on a touchpad does not zoom Sort mode's work area,
though it works when the UI runs in MS Edge. See
[035](035-unlimited-comparison-and-zoom.md).

Chromium sends a touchpad pinch to the page as Ctrl+wheel events only when pinch
zoom is enabled. Tauri leaves the window's `zoomHotkeysEnabled` off by default,
and wry then turns off WebView2's `IsPinchZoomEnabled` and
`IsZoomControlEnabled`. So the page never gets the pinch.

## Acceptance criteria

- [ ] In the built app, a touchpad pinch over Sort mode's work area zooms the
      work area, keeping the point under the pointer in place.
- [ ] A touchpad pinch zooms the work area as far as the fingers move: spreading
      them to twice the distance doubles the zoom. A mouse Ctrl+wheel notch still
      zooms about 13%.
- [ ] The app itself still never zooms. That covers Ctrl+wheel, touchpad pinch,
      Ctrl+Plus, Ctrl+Minus and Ctrl+0 in every mode, and a touchscreen pinch,
      also over context menus and dialogs.

## Implementation notes

- `tauri.conf.json` sets `zoomHotkeysEnabled: true` on the main window. WebView2
  then forwards touchpad pinches as Ctrl+wheel, which `useViewZoom` already
  handles.
- This also turns on WebView2's own page zoom. The existing handlers in `App`
  cancel it:
  - the window-level Ctrl+wheel listener;
  - the Ctrl+Plus, Ctrl+Minus and Ctrl+0 handlers in each mode.
- `touch-action: pan-x pan-y` moved from `.app-shell` to `body`. Context menus
  and dialogs are portaled to `body`, outside `.app-shell`, so a touchscreen
  pinch over them would otherwise zoom the page now.
- **Pinch speed:** a pinch zoomed only about 9% for twice the finger distance,
  because pinch and wheel shared `exp(-Δpx/800)`. Chromium sends a pinch as
  `deltaY = -100 × ln(scale)`, in steps far smaller than a mouse notch of
  100 px or more. `wheelZoomFactor` in `workAreaZoom.ts` uses `exp(-Δpx/100)`
  below 50 px, so the zoom follows the fingers, and keeps `/800` for wheel
  notches.
- **Checks so far:**
  - `cargo check` accepts the config;
  - the App tests pass.

  A real touchpad pinch can't be simulated here, so the acceptance criteria wait
  for a check in a built app.

## Earlier considerations reviewed

- **035, Native check:** this issue is a result of that check. The rest of it,
  for keys and Escape, is covered by the second acceptance criterion above.
- **035, Touchscreen pinch:** still untested on a touch device. `touch-action`
  now applies to the whole page.
- **Inbox:** no notes are resolved by this change. The backlog's pinch zoom of a
  Photo's Crop is unrelated.
