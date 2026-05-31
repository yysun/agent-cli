# Electron Sidebar Collapse Plan

## Approach

Port the reference app's shell interaction into the static Electron renderer: use the same macOS hidden-inset titlebar posture, keep the expanded control in the sidebar titlebar strip, add a restore control in the titlebar/header for collapsed state, and use a shell-level collapsed class to animate sidebar width, opacity, and header padding.

## Tasks

- [x] Inspect relevant files
- [x] Make focused changes
- [x] Run validation
- [x] Update docs/status

## Validation

- `npm run electron:build && node --check electron/renderer/renderer.js` passed.
- `npm run electron:dev` built successfully and stayed running until manually stopped, confirming the Electron app starts with the hidden-inset titlebar configuration.
- Focused browser smoke at `http://127.0.0.1:4179/index.html` passed: collapse hides the sidebar to `0px`, removes the sidebar border and padding, shows the restore button, applies the `96px` titlebar/header left inset, and restore returns the sidebar to its expanded state.
- Focused browser smoke confirmed the sidebar titlebar strip and main header use `-webkit-app-region: drag`, while the collapse and restore buttons use `-webkit-app-region: no-drag`.
- Follow-up browser smoke confirmed the open and collapsed titlebar buttons have matching top positions: both measured at `8px` from the viewport top.
- Browser console check passed with 0 errors and 0 warnings after the smoke check.
- Editor diagnostics passed for `electron/main.ts`, `electron/renderer/index.html`, `electron/renderer/renderer.js`, and `electron/renderer/styles.css`.
- Unit tests passed: 104 tests.

## Implementation Notes

- Reference source: `../agent-world/electron/renderer/src/app/shell/components/LeftSidebarPanel.tsx`, `SidebarToggleButton.tsx`, and `MainHeaderBar.tsx`.
- Match `../agent-world/electron/main.ts` by using `titleBarStyle: 'hiddenInset'` on macOS.
- Add renderer state for `sidebarCollapsed` without persisting it, matching the simple local shell behavior needed here.
- Use the same inline SVG icon shape for expanded and collapsed controls, changing only the arrow direction.
- Keep workspace/chat/message state untouched; collapse only affects layout classes and ARIA labels.

## E2E Decision

This is a user-facing shell interaction, so add a lightweight scenario spec in `.docs/tests/test-electron-sidebar-collapse.md`. Execute it with build/syntax validation plus a focused browser or DOM smoke check when available.

## Architecture Review

AR passed: no blocking architecture flaws. The change is presentation-only, preserves the renderer's current IPC boundary, and can be validated without live provider calls.

## Code Review

CR passed after diff review and validation. A collapsed-state 1px border leftover was found during smoke testing and fixed by matching the reference app's borderless, padding-free collapsed sidebar state.