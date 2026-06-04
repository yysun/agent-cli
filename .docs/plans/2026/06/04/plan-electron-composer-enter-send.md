# Electron Composer Enter Send Plan

## Goal

The Electron composer must match normal chat ergonomics: Enter sends short one-line prompts, while multi-line drafts require Cmd/Ctrl+Enter so plain Enter remains useful for editing.

## Current Context

- `electron/renderer/src/features/chat/ChatComposer.tsx` owns the textarea, submit form, edit/resend mode, and runtime option controls.
- The form submit path already trims content, blocks empty submissions, respects `busy`, calls `onSubmitMessage`, and clears the composer.
- `ChatComposer.tsx` has no textarea key handler today, so Enter always follows textarea defaults.
- The repo uses a Node Vitest environment and currently has no React DOM testing setup. Existing renderer logic tests cover pure helpers imported from TypeScript source via `.js` import paths.
- `npm run electron:renderer:check` is the narrow renderer typecheck command. A helper-level unit test can run with `npx vitest run tests/unit/electron-composer-keybinding.test.js`.

## Decisions

- Add a small pure helper that determines whether an Enter key event should submit based on key, modifier state, busy state, and whether the current draft contains a newline.
- Wire the helper from `ChatComposer.tsx` through `onKeyDown` on the textarea.
- For single-line Enter, prevent the textarea default and submit through the same shared submit function used by the form.
- For multi-line plain Enter, do not prevent default; this preserves newline editing.
- For multi-line Cmd/Ctrl+Enter, prevent default and submit through the same shared submit function.
- During browser IME text composition, do not submit on Enter because the user may still be choosing composed text.
- Reject a global shortcut because the behavior belongs to the focused composer textarea.
- Reject a setting, feature flag, or compatibility mode because the requested behavior is the product contract.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Inspect `electron/renderer/src/features/chat/ChatComposer.tsx` to confirm the existing submit path, textarea ownership, edit/resend behavior, and absence of key handling.
- [x] Inspect `package.json`, `vitest.config.js`, and existing `tests/unit` renderer helper tests to confirm targeted validation commands.
- [x] Record that global shortcuts, configurable keybindings, and chat runtime IPC changes are non-goals for this story.

### Phase 2 - Foundation changes

- [x] Add `electron/renderer/src/features/chat/composer-keybinding.ts` with a typed pure helper for composer submit key decisions.
- [x] Update `electron/renderer/src/features/chat/ChatComposer.tsx` to use a shared submit function that can be called by both form submit and textarea key handling.
- [x] Preserve the existing trim, empty-input guard, busy guard, edit/resend clearing, and button submit behavior.

### Phase 3 - Feature implementation

- [x] Wire `onKeyDown` on `#message-input` so single-line Enter prevents default and sends.
- [x] Wire multi-line Cmd/Ctrl+Enter so it prevents default and sends.
- [x] Leave multi-line plain Enter unhandled so the textarea can insert or preserve newlines normally.
- [x] Confirm no settings, IPC changes, or broader composer redesign were introduced.

### Phase 4 - Tests and verification wiring

- [x] Add `tests/unit/electron-composer-keybinding.test.js` covering single-line Enter, multi-line plain Enter, multi-line modified Enter, non-Enter keys, empty input, busy state, and IME composition.
- [x] Run `npx vitest run tests/unit/electron-composer-keybinding.test.js` and record passing output.
- [x] Run `npm run electron:renderer:check` and record passing output.

### Phase 5 - Documentation and status

- [x] Update this plan's task statuses after each completed code or verification step.
- [x] Record final evidence showing the Electron composer keybinding requirement is satisfied.

## Verification Evidence

- `npx vitest run tests/unit/electron-composer-keybinding.test.js`: passed, 1 file and 4 tests.
- `npm run electron:renderer:check`: passed, renderer TypeScript no-emit check.

## Validation

- `npx vitest run tests/unit/electron-composer-keybinding.test.js` must pass, proving the keybinding decision table.
- `npm run electron:renderer:check` must pass, proving the React/TypeScript wiring.

## Rollback / Risk

Risk is concentrated in textarea editing semantics. The helper must only prevent default when it is actually submitting; otherwise multi-line editing becomes worse. Rollback is limited to removing the helper, test, import, and `onKeyDown` wiring from `ChatComposer.tsx`.

## Architecture Review

AR passed: no blocking architecture flaws. The plan covers every acceptance criterion with a localized helper, shared submit path, and targeted validation. It correctly rejects global shortcuts, settings, IPC changes, and a new DOM test stack because they add surface area without improving this behavior.
