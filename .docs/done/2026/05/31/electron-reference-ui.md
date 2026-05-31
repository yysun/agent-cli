# DD: electron-reference-ui

## Summary

- Matched the static Electron renderer more closely to `../agent-world/electron` for right-panel open/collapse behavior.
- Added a local settings panel theme selector with system, light, and dark modes.
- Added local `Show tool messages` filtering without changing persisted chat messages or runtime behavior.
- Upgraded tool-related transcript rows to compact tool cards with tool names and status labels.
- Added skills settings UI placeholders while intentionally leaving discovery, install, edit, save, and runtime enablement unimplemented.
- Kept the changes local to the static renderer and RPD docs.

## Verification

- `npm run electron:build && node --check electron/renderer/renderer.js`
- `npm run check`
- Unit tests: 104 passed via the VS Code test runner
- Editor diagnostics for edited renderer files: no errors
- Focused browser smoke at `http://127.0.0.1:4187/index.html` with a stubbed desktop bridge
- Browser console check after smoke: 0 errors, 0 warnings

## Notes

- Skills controls are UI-only by design and do not call IPC or change runtime settings.
- Theme and tool-message visibility are local renderer state only; there is no backend settings persistence in this change.
- Plain browser smoke uses a stubbed desktop bridge because Electron preload IPC is unavailable outside Electron.
