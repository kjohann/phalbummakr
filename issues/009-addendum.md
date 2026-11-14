# 009 addendum - Auto-height text boxes and attached controls

Status: done · Addendum to: [009 - Text Slots](009-text-slots.md)

## Additional acceptance criteria

- [x] Text Slot height fits its content, growing and shrinking after text,
  font or width changes. Font size is never reduced automatically.
- [x] Width remains user-controlled. Text can grow beyond the Page, with a
  warning rather than a height cap.
- [x] Text controls follow the selected box in a compact floating toolbar,
  instead of occupying the Page menu bar. The broader menu redesign is deferred.
- [x] Font size offers a small set of presets and an optional exact point size.
- [x] Bold, italic and underline are available in a compact formatting dropdown.
- [x] Ctrl+B, Ctrl+I and Ctrl+U (and Command equivalents) toggle formatting
  for the whole selected Text Slot, including while editing.
- [x] Existing Albums remain readable; underline defaults to off. Changes,
  including fitted height, survive saving and reopening.

## Agreed behavior

- Height fits content in both directions, including after deleting text.
- Growth beyond the Page is allowed and warned about.
- Formatting applies to the whole Slot, not selected ranges; rich text is
  outside this addendum.
- Tests continue at the agreed Album/core and workspace seams.

## Implementation and verification

- Canvas text is measured in points, independent of editor zoom. The fitted
  height is saved after content, style or width edits and recalculated on opening
  an Album. Resizing Text Slots changes width only; Photo Slot behavior is
  unchanged.
- `TextSlotControls` holds the compact, box-attached controls. Both the toolbar
  and Format dropdown stay within the editor viewport, including narrow views.
- Underline is rendered in the canvas and in-place editor, with a default of
  off for older Albums. Shortcuts work in the editor, on a selected Slot and
  within its attached controls.
- Verification passed: 87 frontend tests, typecheck, lint and production build.
  The existing Vite chunk-size warning remains. No Rust code changed.
- Actual browser checks covered width-driven reflow, growing and shrinking,
  beyond-Page warnings, keyboard formatting, exact sizes, save/reopen and
  dropdown positioning in a 340 px workspace.
- Temporary browser validation files and the server were removed. The user's
  pre-existing development server was left running.

## Review

- **Standards:** direct diff review found no remaining blocking points.
  Shared point conversion, line height, font-style construction and Rectangle
  types keep measurements and rendering consistent.
- **Spec:** all additional criteria are implemented. Review/validation fixed
  a Format dropdown extending outside narrow views and preserved the previous
  save baseline if measuring an Album fails while opening it.

## Earlier considerations reviewed

- **002:** Library startup messages, marker duplication and port splitting
  remain unrelated.
- **003 and 006 addendum:** disk cache cleanup, decoder checks, preview
  transport/lifecycle maps and LRU factoring remain unrelated to text layout.
- **004:** external-edit conflict detection remains deferred; existing
  serialized autosaves continue to support typing during a write.
- **005, 006 and 007:** native WebView2 gesture checks remain manual. Extra
  resize handles and keyboard nudging remain deferred; the Text Slot's
  right-edge handle is intentional for auto-height boxes. Shared Rectangle
  types are reused; validator duplication and Photo orientation rules are
  unrelated. Existing Slots outside changed Bleed remain loadable.
- **008:** filesystem-aware Photo identity remains in its own addendum.
  Bundle splitting remains deferred; this work does not address that warning.
- **009:** extracting text controls is now resolved by `TextSlotControls`.
  Missing-font portability warnings remain deferred to Page Export work.

## Future considerations (low priority)

- Confirm floating controls, typography and shortcuts in the integrated
  WebView2 app. Browser verification does not substitute for that native check.
- Missing-font warnings remain open as recorded in the original issue.

## Section 2 - Stable toolbar appearance

Status: done

- [x] Text controls appear at their final position without sliding or popping
  between temporary positions, including on right-hand Pages.
- [x] Changes to toolbar dimensions keep the controls within the viewport
  without showing an intermediate position.

### Implementation, review and verification

- There was no CSS entrance animation: initial placement used zero toolbar
  dimensions until ResizeObserver delivered its first measurement. Measure
  dimensions in a layout effect before painting, including after controls change.
  ResizeObserver still handles external layout changes.
- A regression test withholds ResizeObserver notifications and checks the final
  right-Page position both on mounting and when custom-size controls wrap.
  It failed before the fix and passes afterwards.
- All 44 workspace tests, typecheck and lint passed. Direct review found no
  remaining blocking points; Photo behavior and viewport clamping are unchanged.
- Earlier low-priority considerations were reassessed. Native WebView2
  verification remains relevant but manual; missing-font warnings and the other
  previously recorded deferrals are outside this positioning fix.
- No temporary servers or instrumentation were started. Cleanup checks found
  no running task shells and no listeners on ports 1420 or 1421.

### Future considerations (low priority)

- Confirm the initial toolbar appearance in the integrated WebView2 app; the
  regression test verifies pre-paint positioning without a native smoke check.
