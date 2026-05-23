# Done: World API Runtime

## Summary

- Added a concrete workspace-local `AgentWorldRuntime` implementation for world, agent, chat, message, queue, skill, heartbeat, and event API surfaces.
- Kept `runChatTurn` as the turn engine and wrapped it with world-owned routing, persistence, and events.
- Added Agent World paragraph-beginning `@mention` routing, inline mention rejection, deterministic multi-target sequencing, and non-mutating routed sends.
- Added durable per-agent memory with chat-scoped records, plus per-chat user message queues for steering and restart recovery.
- Added restart handling for queued rows, completed `sending` rows, recoverable interrupted rows, and `sending` rows blocked on unresolved tool calls.
- Added focused unit coverage for world API send/routing/queue/restart behavior and preserved existing CLI/remote validation.

## Verification

- `npx vitest run tests/unit/agent-world-runtime.test.js`
- `npm run build:cli`
- `npm test`
- CR: reviewed uncommitted changes after validation; no blocking code issues remained.
- VR: checked implementation, tests, and RPD docs against `req-world-api-runtime.md`.

## Notes

- This intentionally does not port full `../agent-world/core` orchestration, SQLite, import, branching, heartbeat scheduling, or HITL replay.
- Some broad API methods fail explicitly or return inert empty results until those features become product scope.
