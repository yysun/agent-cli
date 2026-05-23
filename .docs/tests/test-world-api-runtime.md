# E2E Spec: World API Runtime

## Scenario: Default Agent Send Emits And Persists

1. Start a workspace with a default agent and one empty chat.
2. Send a user message through the world API without an `@mention`.
3. Confirm the world API emits run-start, message/chunk, and run-completed events.
4. Confirm the chat can be reloaded through the world API.
5. Confirm the default agent memory contains the chat-scoped user and assistant records.

## Scenario: Mention-Routed Send

1. Create two agents in the same world.
2. Send `@second-agent summarize this` through the world API.
3. Confirm the turn uses the second agent without changing `world.json.defaultAgentId`.
4. Confirm emitted events include the routed agent id.
5. Confirm the second agent memory contains the routed turn and the default agent memory is not polluted.

## Scenario: Inline Mention Suppression

1. Send a message that contains an inline `@agent` mention but no paragraph-beginning mention.
2. Confirm the message does not silently route to the default agent as a fallback broadcast.
3. Confirm the user receives a clear no-route or validation result.

## Scenario: Queued Steering

1. Start a turn that remains active long enough to accept another user message.
2. Send a second message to the same chat while the first is active.
3. Confirm the second message is persisted as a queued steering row and a queue event is emitted.
4. Let the first turn finish.
5. Confirm the queued steering message dispatches next in FIFO order and preserves any `@mention` routing.

## Scenario: Hard Restart Auto-Resume

1. Persist at least one `queued` user message and one `sending` queue row in a workspace.
2. Simulate a hard runtime restart by creating a fresh world runtime from the same workspace.
3. Confirm durable world, agent memory, chats, and queue state are reloaded.
4. Confirm `queued` rows resume automatically.
5. Confirm `sending` rows are removed, restored to queued, blocked, or marked error according to persisted transcript evidence.
6. Confirm `error` and `cancelled` rows do not resume automatically.
7. Confirm no completed user turn is duplicated.

## Scenario: Existing CLI Chat Commands Still Work

1. Use `agent-cli` interactive or remote command handling to create, list, select, and read chats.
2. Confirm `/new`, `/chats`, `/use <chatId>`, and `/messages <chatId>` behavior remains compatible.
3. Confirm chat state remains under `.agent-world`.

## Execution Status

- Covered by automated unit tests in `tests/unit/agent-world-runtime.test.js` for default sends, mention routing, inline mention suppression, queued steering, restart auto-resume, and blocked unresolved tool-call recovery.
- Existing CLI/remote compatibility covered by `npm test`, including relay E2E tests.
