# DD: electron-sidebar-collapse

## Summary

- Matched the Electron renderer's left sidebar collapse/restore placement to `../agent-world/electron`.
- Matched the reference macOS window posture by using a hidden-inset titlebar for the Electron app.
- Replaced the text chevron with the same panel/sidebar SVG icon shape and next-state arrow treatment used by the reference app.
- Added shell state so collapsing hides the sidebar without changing workspace, chat, message, or composer data.
- Added the collapsed restore control in the app titlebar/header with the reference-style `96px` inset.
- Aligned the collapsed restore button to the same top position as the open-mode collapse button.
- Kept the change local to the static Electron renderer and RPD docs.

## Verification

- `npm run electron:build && node --check electron/renderer/renderer.js`
- `npm run electron:dev` startup smoke, stopped after launch
- Focused browser smoke at `http://127.0.0.1:4179/index.html`, including titlebar `drag`, button `no-drag`, and matching `8px` top-position checks
- Browser console check: 0 errors, 0 warnings
- Editor diagnostics for edited Electron files: no errors
- Unit tests: 104 passed

## Notes

- Plain browser smoke intentionally reports `Bridge unavailable` because Electron preload IPC is not present outside Electron; the sidebar interaction is shell-only and still works there.
- No right-panel behavior, runtime IPC, workspace storage, or chat persistence changes were made.