# Electron Reference UI Plan

## Approach

Port the requested reference behaviors into the static Electron renderer with local UI state only. Add a right-panel open/collapse class, local theme preference handling, local `showToolMessages` filtering, compact tool-card rendering, and placeholder skills controls in the existing settings panel.

## Tasks

- [x] Inspect relevant files
- [x] Make focused changes
- [x] Run validation
- [x] Update docs/status

## Validation

- `npm run electron:build && node --check electron/renderer/renderer.js` passed before and after final CSS polish.
- `npm run check` passed.
- Unit tests passed: 104 tests via the VS Code test runner.
- Editor diagnostics passed for `electron/renderer/index.html`, `electron/renderer/renderer.js`, and `electron/renderer/styles.css`.
- Focused browser smoke against `http://127.0.0.1:4187/index.html` passed with a stubbed desktop bridge: right panel close/reopen, panel `inert`, theme selection, tool-message hide/show, and UI-only skills controls.
- Browser console check after the smoke reported 0 errors and 0 warnings.

## Implementation Notes

- Reference source: `../agent-world/electron/renderer/src/app/shell/components/RightPanelShell.tsx`, `MainHeaderBar.tsx`, `features/settings/components/SettingsPanelContent.tsx`, `hooks/useThemeSettings.ts`, and chat message tool rendering notes in `features/chat/components/MessageListPanel.tsx`.
- Keep all new state inside `electron/renderer/renderer.js`.
- Keep the skills section UI-only with disabled or local-only controls and placeholder rows.
- Use `document.documentElement.dataset.theme` for explicit light/dark and no attribute for system, matching the reference theme behavior.
- Filter tool-related transcript rows during render, leaving stored `state.messages` untouched.
- Use existing static assets and inline SVGs; do not add dependencies.

## E2E Decision

This is a user-facing Electron shell interaction, so add a lightweight scenario spec in `.docs/tests/test-electron-reference-ui.md`. Execute it with build/syntax validation plus a focused DOM smoke check for static renderer behavior.

## Architecture Review

AR passed: no blocking architecture flaws. The plan keeps changes presentation-only and local to the static renderer, preserves existing IPC/runtime boundaries, and avoids implementing skills backend behavior before it is requested.

## Code Review

CR passed after diff review and validation. One dark-mode polish issue was found and fixed so system dark mode applies the same user-message card treatment as explicit dark mode.

## Verification Review

VR passed: all acceptance criteria are implemented in the static renderer and documented in the requirement, plan, and scenario spec. Skills remain UI-only and no IPC/runtime settings behavior was added.
