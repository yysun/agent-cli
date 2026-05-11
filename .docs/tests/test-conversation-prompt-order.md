# AT: conversation-prompt-order

- Story slug: `conversation-prompt-order`
- Created: `2026-05-11`
- Status: Implemented
- Related requirement: `./.docs/reqs/2026/05/11/req-conversation-prompt-order.md`
- Related plan: `./.docs/plans/2026/05/11/plan-conversation-prompt-order.md`

## Scope

Validate that Agent CLI assembles model messages in the required prompt/context order without changing persisted chat history behavior.

## Scenarios

1. Built-in prompt is always first
- Given a chat turn is assembled
- When model messages are built
- Then the first message has role `system`
- And its content is the built-in Agent CLI prompt

2. AGENTS.md layers after the built-in prompt
- Given the project root contains a readable, non-empty `AGENTS.md`
- When model messages are built
- Then the next `system` message contains the contents of `AGENTS.md`
- And `AGENTS.md` content does not replace the built-in prompt

3. Tools and skills context follow prompt content
- Given discovered skills are available
- When model messages are built
- Then the combined tools/skills guidance appears after the built-in prompt
- And after `AGENTS.md` content when `AGENTS.md` is present

4. User input follows all system messages
- Given a new user message is submitted
- When model messages are built
- Then the current user input appears after all applicable `system` messages

5. Missing or empty AGENTS.md does not break prompt assembly
- Given `AGENTS.md` is missing or empty
- When model messages are built
- Then the built-in prompt is still present as the first `system` message
- And prompt assembly continues without error

6. Persisted history stays unchanged
- Given prior chat messages exist
- When a new turn completes
- Then persisted chat history still contains user, assistant, and tool messages only
- And system prompt material is not written into chat transcripts

7. Optional live proof of prompt and skill delivery
- Given live e2e is enabled
- And a probe token exists only in the built-in prompt path
- And a different probe token exists only in a test skill body
- When the CLI runs a turn that should load the skill
- Then the assistant response contains both tokens
- And the persisted chat records the assistant `load_skill` tool call for that skill

## Verification Run

Executed on `2026-05-11`:

1. `vitest run tests/unit/agent-files.test.js tests/unit/runtime-client.test.js`
2. `vitest run tests/unit/agent-files.test.js tests/unit/runtime-client.test.js tests/unit/agent-cli.test.js`
3. `npm run test:syntax`

Observed result:
- Prompt-source loading tests passed.
- Runtime message-ordering tests passed.
- CLI unit coverage passed.
- Syntax checks passed.