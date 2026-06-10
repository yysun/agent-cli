# Incomplete Tool Calls

## Summary

- Added `assertCompletedChatTurn` in `core/agent-runtime.ts` to reject unresolved `status: "tool_calls"` results with named unresolved tools.
- Wired the guard into CLI and Electron before `persistCompletedChat`, so neither host saves a partial assistant tool-call transcript as a completed turn.
- Preserved `runChatTurn` semantics for lower-level consumers; it can still return `tool_calls`.
- Added CLI regression coverage proving unresolved host-owned calls fail and leave the chat messages file empty.

## Verification

- `npx vitest run tests/unit/agent-runtime.test.js tests/unit/agent-cli.test.js` passed: 2 files, 60 tests.
- `npm run build` passed.
- `npm run check` passed.
- `npm run electron:main:build` passed.

## Notes

- No E2E spec was added; the changed behavior is an internal host-contract failure path covered deterministically by unit tests.
- `npm run build` regenerated `bin/agent-cli.js`.
