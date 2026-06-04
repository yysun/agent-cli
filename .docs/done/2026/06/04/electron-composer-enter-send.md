# Electron Composer Enter Send Done

## Summary

- Added Electron composer keyboard submission rules so plain Enter sends non-empty single-line drafts.
- Preserved normal multi-line editing: plain Enter does not submit once the draft contains a newline.
- Added Cmd+Enter and Ctrl+Enter as explicit send gestures for non-empty drafts, including multi-line input.
- Kept Shift/Alt+Enter available for newline editing and blocked Enter submission during IME text composition.
- Reused the existing form submit path so trimming, empty-input blocking, busy-state blocking, edit/resend clearing, tool permission, and reasoning effort behavior stay intact.
- Isolated the keybinding decision in a small renderer helper with focused unit coverage.

## Verification

- `npx vitest run tests/unit/electron-composer-keybinding.test.js` passed on 2026-06-04 with 1 file and 4 tests.
- `npm run electron:renderer:check` passed on 2026-06-04.
- AR passed with no blocking architecture flaws.
- CR passed with no blocking issues after adding the `.js` local ESM import suffix and IME composition guard.

## Notes

- No E2E spec was added; the behavior is a localized textarea keybinding decision covered by a unit decision table plus renderer typecheck.
- No backend IPC, CLI input behavior, composer layout, or configurable keybinding setting was changed.
