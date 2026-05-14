# DD: agent-world-storage

- Story slug: `agent-world-storage`
- Completed: `2026-05-14`
- Status: Done
- Related requirement: `./.docs/reqs/2026/05/14/req-agent-world-storage.md`
- Related plan: `./.docs/plans/2026/05/14/plan-agent-world-storage.md`
- Related test spec: `./.docs/tests/test-agent-world-storage.md`

## Outcome

Moved Agent CLI's durable local persistence and remote-host coordination to a world-centric `.agent-world/` layout, introduced `world.json` plus agent-scoped durability, and wired runtime defaults through repo-root and default-agent `runtime.json` files with CLI overrides still taking precedence.

The shipped behavior now includes:
- `.agent-world/world.json` as the durable world record
- `.agent-world/chats/{chatId}/chat.json`, `messages.jsonl`, and `summary.md` for persisted chats
- `.agent-world/agents/{agentId}/agent.json`, `inbox.jsonl`, `state.json`, `events.jsonl`, and `memory.md` for agent-scoped durability
- `.agent-world/remote-host.lock.json` for remote-host coordination
- runtime default loading from `./runtime.json` plus `./.agent-world/agents/{defaultAgentId}/runtime.json`
- continued remote-host chat list, load, create, and select behavior against the `.agent-world` store

## Delivered

1. World and chat persistence
- Added `.agent-world` path helpers and bootstrap behavior for `world.json`, chat directories, and agent directories.
- Replaced the old current-chat pointer as the source of truth with `world.json.currentChatId`.
- Persisted chat metadata in `chat.json` and ordered message history in append-friendly `messages.jsonl` files.
- Created `summary.md` as a required placeholder file for each persisted chat.

2. Agent-scoped durability
- Added bootstrap for `agent.json`, `inbox.jsonl`, `state.json`, `events.jsonl`, and `memory.md` under the default agent directory.
- Moved stream-trace persistence to agent-scoped `events.jsonl` with `chatId` attached to each event.
- Moved remote-session durability to agent-scoped `state.json`.

3. Runtime configuration precedence
- Restored repo-root `runtime.json` support for runtime defaults.
- Added optional default-agent `runtime.json` overrides under `.agent-world/agents/{agentId}/runtime.json`.
- Kept CLI flags as the highest-precedence runtime override layer.
- Restricted `.env` loading to provider credentials and relay configuration instead of general runtime defaults.

4. Remote behavior
- Preserved prompt loading from `AGENTS.md` and skill loading from `./.agents/skills/` unchanged.
- Moved the project-root remote host lock into `./.agent-world/remote-host.lock.json`.
- Fixed remote chat switching so agent `state.json.currentChatId` follows `/new` and `/use` as well as startup.
- Preserved remote chat list, message load, chat creation, and chat selection against the new storage layout.

5. Documentation and test updates
- Added and updated storage, runtime, and test coverage around `.agent-world` persistence.
- Updated top-level README documentation to describe the shipped `.agent-world` layout and runtime precedence.

## Requirement Coverage (REQ)

1. `.agent-world` as durable local root
- Satisfied by the world, chat, and agent path helpers plus on-demand bootstrap in the session store.

2. World, chat, and agent file contracts
- Satisfied by `world.json`, chat-local `chat.json/messages.jsonl/summary.md`, and agent-local `agent.json/inbox.jsonl/state.json/events.jsonl/memory.md` creation.

3. Current chat and default agent selection
- Satisfied by `world.json.currentChatId` and `world.json.defaultAgentId` as the storage-layer source of truth.

4. Runtime precedence and credential handling
- Satisfied by repo-root and agent-level runtime file loading, CLI override precedence, and credential-only `.env` behavior.

5. Remote behavior and local-first durability
- Satisfied by continued remote chat operations against `.agent-world`, agent `state.json` synchronization for the selected chat, and a local `.agent-world/remote-host.lock.json` coordination file.

## Plan Coverage (AP)

1. Add `.agent-world` paths and bootstrap world state
- Completed by creating world, chat, and agent path helpers plus the world bootstrap flow.

2. Refactor session-store persistence into world/chat/agent files
- Completed by moving current-chat selection into `world.json`, chat persistence into `chat.json/messages.jsonl/summary.md`, stream traces into agent events, and remote-session state into agent state.

3. Centralize runtime-file loading and precedence
- Completed by restoring repo-root `runtime.json`, adding default-agent runtime overrides, and keeping CLI overrides on top.

4. Preserve remote flows inside `.agent-world`
- Completed by keeping remote chat-management behavior working over the `.agent-world` store, moving the remote-host lock into `.agent-world`, and synchronizing agent `state.json` after remote chat switches.

5. Add tests and update docs
- Completed by extending targeted unit and remote-host coverage and updating README plus story docs.

## Verification

Executed on `2026-05-14`:

1. `vitest run tests/unit/session-store.test.js tests/unit/agent-config.test.js tests/unit/agent-cli.test.js tests/unit/remote-control.test.js tests/e2e/agent-cli-remote.e2e.test.js`

Observed result:
- Targeted session-store, runtime-precedence, CLI, and remote-host coverage: passed.
- Total coverage in the verified run: 57 tests passed.

## Follow-Up Risks

1. Historical docs from earlier stories still mention pre-`.agent-world` storage layouts, so contributors can still encounter obsolete terminology outside the active story set.
2. The storage layer currently prefers the latest available timestamp among chat metadata and persisted messages; if upstream message timestamps become inconsistent, chat ordering may still drift.