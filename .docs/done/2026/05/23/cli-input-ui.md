# Done: CLI Pending And Ask-User Input UI

## Summary

- Added a TTY-only three-dot pending animation for streamed Agent CLI turns.
- Added terminal handling for `ask_user_input`, `human_intervention_request`, and `ask_user_question` tool calls.
- Added a runtime tool-call handler hook so CLI-owned tools can return results without moving terminal UI into core runtime code.
- Passed interactive prompts through one-shot and interactive local turns.
- Added unit coverage for pending display, local input collection, and runtime handler persistence.

## Verification

- `npm run build`
- `npx vitest run tests/unit/agent-cli.test.js tests/unit/runtime-client.test.js`
- `npm run test:syntax`
- `npm run test:unit`
- `git diff --check`

## Notes

- `npm run build:ts` is listed in repo instructions but does not exist in `package.json`; used the real build command instead.
- Existing `.wiki` changes were present before this work and were left untouched.
- RPD GC is blocked by unrelated pre-existing `.wiki` changes unless the user wants a scoped commit that excludes them.
