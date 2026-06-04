# Electron Verbose Mode Done

## Summary

- Renamed the Electron diagnostics toggle from "Show tool messages" to "Verbose mode" and made it opt-in by default.
- Verbose mode now gates reasoning/thinking, tool call, tool result, and model-response runtime cards together; warnings and errors still surface outside verbose mode.
- Electron main now emits current-turn runtime events over a preload-safe IPC subscription while still returning the complete `turnEvents` list in the final response.
- The renderer clears stale turn events at send/edit start, appends live events as they arrive, and replaces them with the final authoritative event list when the turn completes.
- Expanded verbose tool call/result card bodies now preserve raw argument/output text instead of truncating whitespace-heavy payloads.

## Verification

- `npm run electron:build` passed on 2026-06-04.
- `npx vitest run tests/unit/electron-transcript-events.test.js` passed on 2026-06-04 with 6 tests.
- `npm run test:unit` passed on 2026-06-04 with 12 files and 118 tests.
- CR passed with no blocking issues: no storage schema change, no CLI verbose formatting change, no extra setting, and no unrelated build output changes.
- VR passed: all acceptance criteria in `.docs/reqs/2026/06/04/req-electron-verbose-mode.md` are complete.

## Notes

- No E2E spec was added because live reasoning/tool streaming depends on provider behavior; the stable contract is covered through Electron build/typecheck and renderer helper tests.
- Internal state names such as `showToolMessages` were left in place to avoid cosmetic churn; the user-facing contract is now Verbose mode.
