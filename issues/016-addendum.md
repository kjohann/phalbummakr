# 016 addendum - Quiet saving and a native Save command

Status: todo · Addendum to: [016 - Open an Album file](016-album-file.md)

## Feedback

The status-width change in [004 addendum, section 3](004-addendum.md#section-3---stable-autosave-status)
did not resolve the reported jitter. Remove the indicator altogether. The native
File menu belongs to completed issue 016, not issue 017.

## Additional acceptance criteria

- [x] Remove the workspace's Saved, Saving... and Not saved indicator and its
  reserved space. Keep autosave, save-error messages and Retry save.
- [ ] Add a **Save** item to the native File menu that saves the current Album
  to its existing file. Autosave remains enabled.
- [ ] Save is unavailable when no Album is open.
- [ ] Manual Save gives no visual saving or saved feedback: no indicator,
  success notification or confirmation dialog. Failures remain explicitly
  reported and recoverable.

## Implementation status

- Removed the status element entirely, including the previous sizing CSS.
  Autosave state, debounce, navigation/close protection, errors and retry are
  unchanged. Existing tests now wait for navigation to unlock instead of
  looking for Saved.
- Added a document-workflow regression test covering the absence of the
  indicator before editing, during the debounce and in-flight write, and after
  completion, while confirming that edits persist. It failed with the old
  indicator and passes after removal.
- All 66 workspace tests pass. Type checking, the production build and lint
  pass; the pre-existing bundle-size warning remains.
- The native Save command is recorded here for subsequent implementation.

## Earlier considerations reviewed

- The status-width approach in 004 is superseded, not retained as another
  attempted layout fix. The separate selection-driven Page toolbar wrapping
  from 014 remains deferred: removing save feedback does not redesign controls.
- External-edit conflicts, cache/rendition optimization, Slot geometry and
  handles, dense-Page profiling, Photo identity casing, font warnings, Layout
  coverage, editor/test-scaffolding extraction and bundle splitting remain
  deferred because indicator removal changes none of those behaviors.

## Future considerations (low priority)

- Direct review found no remaining non-blocking findings in the removal.
- Native autosave/viewport checks are now covered by section 2 below. Native
  dialog and future manual-Save smoke checks remain deferred.

## Section 2 - Stable native menu during autosave

Status: done

### Additional acceptance criteria

- [x] Editing a Photo or Slot and finishing autosave do not replace the native
  File menu or change the native WebView's dimensions.
- [x] New Album, Open Album, Open Recent and Close Album retain their existing
  enabled/disabled behavior while saves are pending, complete or failed.
- [x] Menu update errors remain explicitly reported, and native resources are
  released when their handles are no longer needed.

### Diagnosis

The indicator was not the underlying cause of the whole-app jitter. Every edit
toggles the workspace busy state twice (pending, then saved), and the File menu
effect rebuilt and reinstalled the native menu each time. On Windows, swapping
the menu bar briefly removes it, so the window client area grows by the menu
height and shrinks back. The whole WebView jumps. The earlier browser-only check
did not exercise the native menu.

A native trace of the debug build on a temporary Album polled the window's
client rect, WebView child size and menu handle (`GetClientRect`/`GetMenu`). With
the previous `App.tsx` loaded, one Add Photo Slot click produced:

```
28609ms client=1200x780 webview=1200x781 menu=0
28612ms client=1200x800 webview=1200x781 menu=0
28628ms client=1200x780 webview=1200x781 menu=1116211773
29125ms client=1200x780 webview=1200x781 menu=0
29142ms client=1200x780 webview=1200x781 menu=1119883491
```

The menu was removed and replaced on each busy change, and the client area
briefly grew from 780 to 800 px.

### Implementation, review and verification

- The File menu is reused while its recent-Album entries are unchanged. Busy,
  restore and document-state changes update the existing items with setEnabled
  instead of reinstalling the menu. Structural changes to recent entries still
  rebuild it through the existing serialized menu queue.
- Retrieved item/submenu resource handles are released in finally blocks.
  Update failures are shown as errors, without silently reinstalling the menu.
- The native-menu regression failed before the fix: the first pending edit
  increased menu installs from 2 to 3. It now covers three edit/save cycles with
  no additional installations and correct enabled states. A second test covers
  update failures and handle release.
- Repeated the same native trace with the fixed `App.tsx`: three Add Photo Slot
  clicks and one Slot drag. The moved Slot was autosaved to disk. The trace
  logged no client, WebView or menu-handle changes; the menu handle stayed the
  same through all edits and completed autosaves.
- All 75 App/workspace tests, TypeScript checking, production build and lint
  pass. Temporary native tracing was removed. The existing bundle-size warning
  is unchanged.
- Direct code review found no remaining non-blocking findings in this fix.

### Earlier considerations reviewed

- The previously deferred native WebView2 check from 016 is now resolved for
  edit/autosave viewport stability. Other native gesture and dialog scenarios
  still need their own checks; this targeted verification does not claim them.
- Selection-driven toolbar wrapping from 014 remains separate and deferred.
  This fix removes the native viewport resize even without changing selection
  or toolbar dimensions.
- External-edit conflicts, cache/rendition optimization, Slot geometry/handles,
  dense-Page profiling, Photo identity casing, font warnings, Layout coverage,
  editor/test-scaffolding extraction and bundle splitting remain deferred:
  native menu state updates do not alter those behaviors.

### Future considerations (low priority)

- The manual Save command in the first section remains todo, with no visual
  saved feedback. It is not implemented as part of this jitter fix.
- Native file-dialog and unrelated gesture smoke checks remain deferred.
