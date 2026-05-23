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
  - interactive mode when launched without a subcommand, and explicitly through `interactive`
  - `world`
  - `agents list`
  - `agents create <agentId> [--name <name>] [--provider <provider>] [--model <model>] [--default]`
  - `chats list`
  - `chats new`
  - `chats use <chatId>`
  - `messages list [chatId]`
  - `messages edit <chatId> <messageId> <message...>`
  - `messages delete-from <chatId> <messageId>`
  - `send [--chat <chatId>] [--agent <agentId>] [--queue] <message...>`
  - `queue list [chatId]`
  - `queue pause|resume|stop|clear [chatId]`
- The CLI must resolve workspace root using the existing runtime/workspace rules.
- The CLI must print deterministic, script-friendly output by default.
- One-shot command output remains JSON-first; interactive mode may use human-readable prompts and command results, but command results should still be structured enough to scan and test.
- Mutating commands must return enough information for shell callers to identify created/selected resources.
- Message sending must use the world runtime, including `@mention` routing, queue behavior, and events.
- Interactive mode must:
  - start when `agent-world-cli` is launched without a subcommand or with `interactive`
  - print a concise prompt that identifies the current chat when available
  - accept the same command grammar as one-shot mode
  - support `/help`, `/world`, `/agents`, `/chats`, `/new`, `/use <chatId>`, `/messages [chatId]`, `/queue [chatId]`, `/pause [chatId]`, `/resume [chatId]`, `/stop [chatId]`, `/clear [chatId]`, and `/exit`
  - treat non-slash input as a message send to the selected chat
  - preserve `@mention` routing and queued-send behavior through the world runtime
  - handle `ask_user_input` / `ask_human_input` tool calls only in the final CLI UI layer; the world runtime may accept generic tool-call plumbing, but must not own human-input UI policy
  - keep queue inspection and control provider-free
  - exit cleanly on `/exit`, `/quit`, EOF, or `Ctrl+C`
  - avoid starting automatic queue resume merely because the interactive shell opened
- The CLI should not introduce remote execution, provider-key movement, or new persistence locations.
- Add focused tests for the CLI command parser/behavior and for the store rename where useful.
- Add focused tests for interactive command handling, including scripted stdin/stdout behavior.
- Add real-binary E2E for `agent-world-cli` modeled after `../agent-world` Electron E2E: isolated workspace, real built entrypoint, monitored stdin/stdout, durable state assertions, provider-free queue lifecycle checks, and live-provider flow-matrix coverage for non-queue send/edit/delete/HITL cases.

## Acceptance Criteria

- No source file imports `core/session-store.js`; callers use the renamed store module.
- `npm run build` produces `core/world-store.js` or the chosen canonical generated module and a non-empty `bin/agent-world-cli.js`.
- Existing `agent-cli` commands and relay tests still pass.
- `agent-world-cli help` prints available commands.
- `agent-world-cli` with no subcommand starts interactive mode.
- `agent-world-cli interactive` starts interactive mode.
- `agent-world-cli world` prints the durable world snapshot.
- `agent-world-cli agents list/create`, `chats list/new/use`, `messages list`, `send`, and `queue` commands operate against the local world runtime.
- In interactive mode, slash commands map to the equivalent world CLI operations and plain text sends a message to the active chat.
- Interactive `/exit` and EOF terminate with exit code 0.
- `send --queue` creates a durable queued row without requiring a live provider call.
- Tests cover representative `agent-world-cli` commands without requiring live provider credentials.
- E2E coverage runs the real `bin/agent-world-cli.js` against an isolated workspace and verifies queued-send lifecycle behavior.
- E2E coverage includes both batch-scripted and stepwise monitored interactive sessions against the real `bin/agent-world-cli.js`.
- Live E2E coverage includes a flow matrix for loaded-current, switched, and new chat send/edit/delete/HITL behavior, excluding queue cases.
- Full project validation passes.

## Non-Goals

- Do not split the store into separate agent/chat/queue modules yet.
- Do not replace `agent-cli`.
- Do not add remote relay mode to `agent-world-cli`.
- Do not change `.agent-world` file formats beyond whatever metadata the existing runtime already writes.
