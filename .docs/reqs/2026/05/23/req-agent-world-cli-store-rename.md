# Requirement: Agent World CLI And Store Rename

## Problem

The world runtime is now a real product boundary, but the storage module still reads as a chat/session helper. `core/session-store.ts` owns world metadata, agent records, chats, agent memory, durable queues, and remote locks. That name hides the ownership model and makes new world code harder to reason about.

At the same time, `agent-world-cli` is published in `package.json` but its source is effectively empty. Shipping a binary that does nothing is worse than not shipping one: callers see a promised world interface but cannot inspect, operate, or smoke-test the runtime from the command line.

## Requirements

- Rename `core/session-store.ts` to `core/world-store.ts`, a world-owned store name that matches its current responsibility.
- Update source imports, tests, build scripts, syntax checks, and generated outputs so there is one canonical store module name.
- Preserve the existing exported helper API and behavior during the rename; this is a naming boundary change, not a storage migration.
- Avoid broad storage refactors. Do not split the store into multiple modules in this story.
- Preserve `.agent-world` layout, existing CLI behavior, relay behavior, and remote command behavior.
- Implement `agent-world-cli` as a usable local CLI over `AgentWorldRuntime`.
- The CLI must support at least:
  - `help`
  - `world`
  - `agents list`
  - `agents create <agentId> [--name <name>] [--provider <provider>] [--model <model>] [--default]`
  - `chats list`
  - `chats new`
  - `chats use <chatId>`
  - `messages list [chatId]`
  - `send [--chat <chatId>] [--agent <agentId>] [--queue] <message...>`
  - `queue list [chatId]`
  - `queue pause|resume|stop|clear [chatId]`
- The CLI must resolve workspace root using the existing runtime/workspace rules.
- The CLI must print deterministic, script-friendly output by default.
- Mutating commands must return enough information for shell callers to identify created/selected resources.
- Message sending must use the world runtime, including `@mention` routing, queue behavior, and events.
- The CLI should not introduce remote execution, provider-key movement, or new persistence locations.
- Add focused tests for the CLI command parser/behavior and for the store rename where useful.
- Add a real-binary E2E for `agent-world-cli` modeled after `../agent-world` Electron E2E: isolated workspace, real built entrypoint, durable state assertions, and queue lifecycle checks without mocks.

## Acceptance Criteria

- No source file imports `core/session-store.js`; callers use the renamed store module.
- `npm run build` produces `core/world-store.js` or the chosen canonical generated module and a non-empty `bin/agent-world-cli.js`.
- Existing `agent-cli` commands and relay tests still pass.
- `agent-world-cli help` prints available commands.
- `agent-world-cli world` prints the durable world snapshot.
- `agent-world-cli agents list/create`, `chats list/new/use`, `messages list`, `send`, and `queue` commands operate against the local world runtime.
- `send --queue` creates a durable queued row without requiring a live provider call.
- Tests cover representative `agent-world-cli` commands without requiring live provider credentials.
- E2E coverage runs the real `bin/agent-world-cli.js` against an isolated workspace and verifies queued-send lifecycle behavior.
- Full project validation passes.

## Non-Goals

- Do not split the store into separate agent/chat/queue modules yet.
- Do not replace `agent-cli`.
- Do not add an interactive shell for `agent-world-cli` in this story.
- Do not add remote relay mode to `agent-world-cli`.
- Do not change `.agent-world` file formats beyond whatever metadata the existing runtime already writes.
