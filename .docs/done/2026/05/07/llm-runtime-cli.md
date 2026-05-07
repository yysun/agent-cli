# DD: llm-runtime-cli

- Story slug: `llm-runtime-cli`
- Completed: `2026-05-07`
- Status: Done
- Related requirement: `./.docs/reqs/2026/05/07/req-llm-runtime-cli.md`
- Related plan: `./.docs/plans/2026/05/07/plan-llm-runtime-cli.md`

## Outcome

Implemented a working Node.js CLI that sends terminal messages through `llm-runtime`, persists chat sessions under `./agent/sessions`, loads runtime prompt/skills from `./agent`, and supports both current-chat reuse and explicit `--new-chat` flows.

## Delivered

1. CLI runtime entrypoint and argument handling
   - Added executable CLI in `./bin/agent-cli.js` with usage/help output.
   - Supports message input, `--new-chat`, `--verbose`, `--stream-off`, and runtime override flags.
   - Prints assistant text to stdout and routes diagnostics to stderr.

2. Runtime config loading and normalization
   - Added `./lib/agent-config.js` to load optional `./agent/config.json`.
   - Normalizes aliases and validates supported values for provider/model/runtime settings.

3. Prompt/skills loading
   - Added `./lib/agent-files.js` to load `./agent/system.md` and inventory recursive skill files under `./agent/skills/**/SKILL.md` in deterministic lexical order.
   - Builds a system-visible skill inventory message for `load_skill` usage.

4. Session persistence
   - Added `./lib/session-store.js` with file-backed persistence for chat messages and current-chat pointer.
   - Uses atomic JSON writes (temp-file + rename) to reduce corruption risk in single-process operation.
   - Persists completed turns only after a successful assistant response.
   - Stores per-chat message history under `./agent/sessions/chats/<chat-id>/messages.json` and stream trace events in `events.json` when enabled.

5. LLM orchestration with tool execution
   - Added `./lib/runtime-client.js` to validate provider environment variables, create/dispose `llm-runtime` environment, and execute turn loops with `respondWithTools(...)`.
   - Enables built-in `load_skill` and executes tool calls during the turn.
   - Keeps system prompt out of persisted chat history while preserving user/assistant/tool messages.

6. Package wiring and test coverage
   - Updated `package.json` with executable wiring (`bin.agent-cli`), ESM package mode (`type: module`), runtime dependency (`llm-runtime`), and test scripts.
   - Added and updated unit/e2e coverage across CLI parsing, config normalization, file loading, session persistence, runtime orchestration, and end-to-end chat behavior.

## Verification

Executed in repository root on `2026-05-07`:

1. `npm test`
2. `npm run test:syntax`
3. `npm run test:unit`
4. `npm run test:e2e`

Observed result:

- Unit: 6 files passed, 48 tests passed.
- E2E: 1 file passed, 4 tests passed.
- Overall: full green run.

## Notes On Current Behavior

1. Current-chat fallback
   - When current chat metadata or file is missing, the current implementation creates a new chat instead of exiting with an error.
   - This is covered by the E2E scenario `starts a new chat when the current chat is missing`.

2. System prompt and skills availability
   - Current implementation provides default behavior when `./agent/system.md` or `./agent/skills/` is absent (default system prompt, empty skill inventory) rather than hard-failing.

3. Persisted chat shape
   - Chat persistence is directory-based (`messages.json` and optional `events.json`) under each chat ID, rather than a single flat `<chat-id>.json` file.

## Follow-Up Candidates

1. Align runtime behavior with strict REQ failure semantics for missing prompt/skills/current chat, or update REQ/AP to match the now-shipped fallback behavior.
2. Add explicit migration note if both legacy flat chat files and directory-based chat storage will continue to be supported.