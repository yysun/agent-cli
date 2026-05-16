## Summary

- Upgraded Agent CLI from `llm-runtime` `^0.4.0` to exact `0.5.0` in both `package.json` and `package-lock.json`.
- Replaced the deleted `createLLMEnvironment(...)` and `respondWithTools(...)` integration in `core/runtime-client.ts` with `createRuntime(...)` plus `runCompletionLoop(...)`.
- Preserved Agent CLI-owned approval gating and persistence by keeping the host-managed turn state, and added an explicit runtime-backed tool-execution fallback using exported `executeToolCall(...)` helpers because raw `runCompletionLoop(...)` does not guarantee a bound `toolExecutor`.
- Kept prompt layering order intact while collapsing the ordered layers into a single runtime system message so the live model still obeys both AGENTS.md instructions and skill-driven routing after the 0.5.0 migration.
- Updated `tests/unit/runtime-client.test.js` to the new API surface and added coverage for the runtime-backed tool-executor fallback.

## Verification

- Ran `npm install llm-runtime@0.5.0`.
- Ran `npm install llm-runtime@0.5.0 --save-exact`.
- Ran `npm run build:ts` multiple times after each focused repair; final build passed.
- Ran focused unit tests for `tests/unit/runtime-client.test.js`; final pass succeeded.
- Ran focused unit tests for `tests/unit/agent-cli.test.js`; passed.
- Ran focused live E2E for `tests/e2e/agent-cli.e2e.test.js`; passed.
- Ran the full repo test suite; all tests passed.

## Notes

- The migration originally targeted `complete(...)`, but live validation showed Agent CLI needed the raw `runCompletionLoop(...)` path to avoid package-owned system prompt injection and keep prompt ownership local.
- The raw loop path exposed a secondary integration gap: unlike `complete(...)`, it may omit a bound `toolExecutor` in `onToolCallsResponse(...)`. The final implementation binds runtime tool execution explicitly instead of relying on that callback parameter.
- No remote or relay behavior changes were required.
