# Done: Agent World CLI Stream Display

## Summary

- `agent-world-cli` interactive sends now stream assistant text as chunks arrive.
- Interactive sends render tool calls and tool results through the shared CLI trace formatter.
- Non-interactive `agent-world-cli send` remains JSON-first and parseable.
- `core/agent-world-runtime.ts` now exposes per-send stream/tool callbacks, avoiding global event subscription leaks into queued follow-up work.
- Renamed `cli/src/agent-runtime.ts` to `cli/src/turn-executor.ts` to distinguish the CLI turn boundary from `core/agent-runtime.ts`.

## Verification

- `npm run test:unit -- tests/unit/agent-world-cli.test.js`
- `npm run build && vitest run tests/e2e/agent-world-cli.e2e.test.js tests/e2e/agent-world-cli-interactive.e2e.test.js` failed after build because `vitest` was not on the direct shell PATH.
- `npx vitest run tests/e2e/agent-world-cli.e2e.test.js tests/e2e/agent-world-cli-interactive.e2e.test.js` as a deterministic binary regression harness, not E2E coverage for the new streaming path.
- `tmpdir=$(mktemp -d); printf '/help\n/exit\n' | node ./bin/agent-world-cli.js --workspace "$tmpdir"`

## Notes

- Streaming/tool display is covered by mocked runtime unit tests. Provider-free binary checks are treated as targeted regression smoke checks, not E2E.
- The generated `bin/agent-cli.js` and `bin/agent-world-cli.js` were rebuilt from TypeScript sources.
