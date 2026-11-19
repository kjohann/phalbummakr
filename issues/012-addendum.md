# 012 addendum – Open the Export folder

Status: done · Addendum to [012 – Page Export](012-page-export.md)

## What

When an export has finished, let the user open the Export folder in the system
file manager straight from the export dialog, ready to upload the Pages to the
Print Provider.

## Acceptance criteria

- [x] When an export finishes, the export dialog shows an *Open Export folder* button next to *Close*.
- [x] The button opens `Exports/<Album name>/` in the system file manager (File Explorer on Windows).
- [x] It can only open the Album's own Export folder, never another path.
- [x] If the folder cannot be opened, the dialog says why and stays open.

## Notes

- The Rust command `open_export_folder(root, name)` resolves the folder with the
  same validation as the export (`exports::existing_export_folder`) and opens it
  with `tauri_plugin_opener::open_path`. The opener plugin is used only from
  Rust and is not registered for the webview, so no file-path permissions are
  granted to the UI.
- The button is shown only after a finished export, not after a cancelled or
  failed one.
- Checked in the app by the user: File Explorer opened the Export folder.

## Earlier future considerations

- None of the open points in earlier issues concern opening folders. The 012
  points (colour management, speed, module layout) are unaffected and stay open.
