# DD: conversation-prompt-order

- Story slug: `conversation-prompt-order`
- Completed: `2026-05-11`
- Status: Done
- Related requirement: `./.docs/reqs/2026/05/11/req-conversation-prompt-order.md`
- Related plan: `./.docs/plans/2026/05/11/plan-conversation-prompt-order.md`
- Related test spec: `./.docs/tests/test-conversation-prompt-order.md`

## Outcome

Made Agent CLI prompt assembly deterministic:
- the built-in system prompt is always included first
- `AGENTS.md` content is added next when present and non-empty
- tools/skills guidance is added after prompt content
- the current user input is sent after all system-role prompt context
- persisted chat history continues to exclude system prompt material

## Delivered

1. Prompt-source split
- Added a dedicated built-in prompt accessor in `lib/agent-files.js`.
- Changed `AGENTS.md` loading to return optional workspace prompt content instead of replacing the built-in prompt.
- Preserved missing and empty `AGENTS.md` behavior without failing runtime startup.

2. Runtime message ordering
- Updated `lib/runtime-client.js` to assemble base system messages in explicit order: built-in prompt, workspace prompt, then combined skill inventory guidance.
- Kept conversation history and persisted messages unchanged outside prompt assembly.

3. CLI integration
- Updated `bin/agent-cli.js` to pass both prompt sources into the runtime turn builder.
- Preserved existing CLI runtime overrides, streaming behavior, verbose diagnostics, and stream-trace persistence.

4. Verification coverage
- Expanded `tests/unit/agent-files.test.js` to cover built-in prompt access plus missing, empty, and present `AGENTS.md` cases.
- Expanded `tests/unit/runtime-client.test.js` to assert exact system-message ordering before the user message.
- Revalidated `tests/unit/agent-cli.test.js` after restoring the full entrypoint behavior during implementation review.

5. Documentation
- Updated `README.md` to describe the layered prompt behavior instead of fallback replacement semantics.
- Marked the REQ, AP, and AT docs as implemented with recorded verification results.

## Requirement Coverage (REQ)

1. Built-in prompt inclusion
- REQ 1 and 7 satisfied by always injecting the built-in prompt and continuing when `AGENTS.md` is missing or empty.

2. `AGENTS.md` layering
- REQ 2 and 3 satisfied by loading workspace prompt content separately and appending it after the built-in prompt when present.

3. Tools/skills placement
- REQ 4 and 5 satisfied by appending the combined tools/skills guidance after prompt content as `system` role context.

4. User-message ordering
- REQ 6 satisfied by keeping the current user message after all base system messages.

5. Persistence stability
- REQ 8 satisfied by leaving persisted chat history behavior unchanged.

## Plan Coverage (AP)

1. Phase 1: Split prompt source responsibilities
- Completed by separating built-in prompt access from optional workspace prompt loading.

2. Phase 2: Update runtime message assembly
- Completed by enforcing explicit base message ordering in the runtime client.

3. Phase 3: Expand verification coverage
- Completed by adding prompt-source and runtime ordering unit tests and rerunning CLI unit coverage.

4. Phase 4: Document the runtime contract
- Completed by updating README and implementation-status docs.

## Verification

Executed on `2026-05-11`:

1. `vitest run tests/unit/agent-files.test.js tests/unit/runtime-client.test.js`
2. `vitest run tests/unit/agent-files.test.js tests/unit/runtime-client.test.js tests/unit/agent-cli.test.js`
3. `npm run test:syntax`

Observed result:
- Prompt-source loading tests: passed.
- Runtime message-ordering tests: passed.
- CLI unit coverage: passed.
- Syntax checks: passed.
