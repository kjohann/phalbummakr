# 031 – Native File menu does not switch Albums

Status: doing · Type: bug · Depends on: 016

## What

The native File menu hardly works. Open Recent is the only command that seems
to do anything, and as it lists only the current Album, reopening it proves
nothing. New Album, Open Album and Close Album must work from the native menu,
so Albums can be created, switched between and closed.

Closing an Album shows an empty state that offers the same commands as the File
menu (except Close Album), with the most recent Albums in their own section.

## Acceptance criteria

- [x] File > New Album… asks for a file, shows Album settings and, once created,
  opens the new Album in place of the one that was open.
- [x] File > Open Album… opens the chosen Album in place of the open one.
- [x] File > Open Recent lists up to ten recently opened Albums, most recent
  first, and opens the chosen one in place of the open one.
- [x] File > Close Album closes the Album and shows the empty state. Close Album
  is disabled while no Album is open.
- [x] The empty state offers New Album…, Open Album… and a Recent Albums section
  listing the five most recent Albums by name and folder.
- [ ] The File menu commands work from the native menu in the desktop app, not
  only in tests. Needs a manual click-through in `npm run tauri dev`.

## Diagnosis

Tauri routes a native menu click to its JavaScript `action` through a handler
map keyed by the item's id (`MenuChannels` in `tauri/src/menu/plugin.rs`), and
an item's `Drop` removes the handler for its id. The File menu gave its items
fixed ids (`new-album`, `open-album`, `close-album`) and is rebuilt whenever the
recent-Album list changes, which already happens during startup. Each rebuild
registered the new items' handlers and then closed the previous menu, whose
dropped items removed the handlers for the same ids: the new menu's handlers.
New Album, Open Album and Close Album then did nothing. Open Recent entries and
Exit have generated ids, so they kept working.

## Implementation and verification

- Every File menu build gets its own item ids (`new-album#3`), from a counter
  that never reuses a number, so releasing an old or discarded menu only drops
  its own handlers. Enabled-state updates look items up by the installed
  build's ids.
- The start screen is now an empty state headed "No Album open", with New
  Album… and Open Album… side by side and a separate Recent Albums section
  listing the five most recent Albums by file name, with the folder below and
  the full path as a tooltip. The native Open Recent submenu is capped at ten.
- The App test mock of the native menu now models Tauri's id-keyed handler map,
  and File menu tests click through that map. With the old fixed ids, six tests
  fail with "no longer reaches the app", matching the reported behavior. A new
  test opens, reopens from Open Recent, creates and closes Albums through the
  menu after rebuilds; another covers the five-item Recent Albums section.
- All 296 tests, type checking and lint pass.
- The native menu could not be driven by UI automation (Windows menus reject
  UIA expand and the keyboard menu loop blocked the automation server), so a
  manual native click-through is still open.

## Earlier considerations reviewed

- The manual Save command from the [016 addendum](016-addendum.md) remains
  todo: it adds a command rather than repairing the existing ones.
- The native dialog smoke checks deferred in the 016 addendum are covered by
  the open manual click-through above.
- Other deferred points (external-edit conflicts, rendition caching, Slot
  geometry, toolbar wrapping, bundle splitting) are unaffected by menu ids and
  the empty state, and stay deferred.

## Future considerations (low priority)

- The recent-Album list in `settings.json` is unbounded; only the menu and the
  empty state limit what they show.
