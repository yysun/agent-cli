# REQ: agent-world-storage

- Story slug: `agent-world-storage`
- Created: `2026-05-14`
- Status: Done

## Summary

Reshape Agent CLI's durable local storage so world metadata, chats, and agent-specific state live under a single `.agent-world/` root with the requested `world.json`, `chats/{chatId}/`, and `agents/{agentId}/` layout.

## Problem

The current implementation needs a single world-centric local storage contract instead of mixing durable chat state and coordination details across older chat-centric layouts. The requested direction is a durable world model rooted at `./.agent-world/` so the CLI can track world identity, agent identity, the default agent, the current chat, and per-agent state in a consistent filesystem contract.

## Requirements

1. Agent CLI must use `./.agent-world/` as the root for durable local world, chat, and agent persistence.
2. The durable root must include `world.json` at `./.agent-world/world.json`.
3. `world.json` must contain at minimum `id`, `name`, `defaultAgentId`, and `currentChatId` fields.
4. Durable chat data must live under `./.agent-world/chats/{chatId}/`.
5. Each persisted chat directory must contain `chat.json`, `messages.jsonl`, and `summary.md`.
6. `chat.json` must hold the durable metadata for that chat, including enough identity and timestamp information for the CLI to load, list, and select chats.
7. `messages.jsonl` must be the durable append-friendly store for chat message history for that chat.
8. `summary.md` must hold the persisted human-readable chat summary for that chat, even if the summary is initially empty.
9. Durable agent data must live under `./.agent-world/agents/{agentId}/`.
10. Each persisted agent directory must contain `agent.json`, `inbox.jsonl`, `state.json`, `events.jsonl`, and `memory.md`.
11. `agent.json` must contain the agent identity and runtime-selection metadata, including at minimum `id`, `name`, `provider`, and `model`, and may include additional agent configuration fields.
12. `inbox.jsonl` must persist agent-targeted inbound items in append-friendly form.
13. `state.json` must persist the current durable state for that agent.
14. `events.jsonl` must persist durable agent events in append-friendly form.
15. `memory.md` must persist agent-specific long-term memory in markdown form.
16. The CLI's notion of the currently selected chat must come from `world.json.currentChatId` rather than a separate top-level current-pointer file.
17. The CLI's notion of the default agent must come from `world.json.defaultAgentId`.
18. The repo root may include `./runtime.json` for runtime defaults.
19. An agent directory may include `./.agent-world/agents/{agentId}/runtime.json` as an optional runtime override.
20. When both runtime files exist, the agent-level `runtime.json` must override matching keys from the repo-root `runtime.json`.
21. The supported runtime file schema must include at minimum `schemaVersion`, `provider`, `model`, `reasoningEffort`, `temperature`, `maxTokens`, `toolPermission`, `webSearch`, `pastMessages`, `stream`, and `streamTrace`.
22. Runtime selection precedence must be command-line flags first, then agent-level `runtime.json`, then repo-root `runtime.json`.
23. If `world.json.defaultAgentId` is present and the matching agent runtime file exists, the CLI must use it automatically without requiring a separate CLI flag.
24. Runtime provider credentials may still come from `.env` or process environment variables, but `.env` must not be the source of non-credential runtime defaults such as model selection, temperature, search mode, or history depth.
25. Chat creation, chat listing, chat selection, chat loading, and follow-up turns must operate against the `.agent-world/chats/` layout.
26. Agent lookup and agent-scoped persistence must operate against the `.agent-world/agents/` layout.
27. Existing project prompt and skill discovery behavior must continue to use `./AGENTS.md` and `./.agents/skills/`; moving durable state into `.agent-world` must not repurpose the existing skills directory.
28. Remote-mode features that depend on persisted local chat state must continue to work against the new durable layout.
29. Remote host locking for a project root must be stored under `./.agent-world/remote-host.lock.json` while a remote host session is active.
30. Local durable persistence must remain on the local machine; relay infrastructure must not become the source of truth for world, chat, or agent files.

## Non-Goals

1. Replacing `AGENTS.md` or `./.agents/skills/` as the prompt and skill-discovery mechanism is not required.
2. Replacing provider credentials in `.env` or the process environment is not required.
3. Defining the final contents of every optional field in `chat.json`, `agent.json`, or `state.json` beyond the required minimum identity fields is not required.
4. Changing the relay protocol solely for transport reasons is not required unless the storage change forces it.
5. Introducing multi-user authorization, synchronization across machines, or a remote database is not required.
6. Designing a new summarization strategy for `summary.md` or `memory.md` beyond ensuring those files exist is not required.

## Acceptance Criteria

1. Given a project root using Agent CLI, when durable state is initialized, the CLI creates `./.agent-world/world.json`, `./.agent-world/chats/`, and `./.agent-world/agents/`.
2. Given a newly initialized world, `world.json` contains non-empty `id` and valid fields for `name`, `defaultAgentId`, and `currentChatId`.
3. Given a new chat is created, the CLI persists that chat under `./.agent-world/chats/{chatId}/` and writes `chat.json`, `messages.jsonl`, and `summary.md` for it.
4. Given a chat receives messages across multiple turns, the CLI can reload the same message history from `messages.jsonl` in the original order.
5. Given the current chat changes, the CLI updates `world.json.currentChatId` and subsequent turns use that selected chat.
6. Given agent metadata is initialized or loaded, the CLI persists it under `./.agent-world/agents/{agentId}/agent.json` with at least `id`, `name`, `provider`, and `model`.
7. Given agent inbox items or events are persisted, the CLI writes them to `inbox.jsonl` and `events.jsonl` under the owning agent directory.
8. Given agent state or memory changes, the CLI persists them to `state.json` and `memory.md` under the owning agent directory.
9. Given `./runtime.json` exists, the CLI loads those runtime defaults when the same keys are not provided by CLI flags.
10. Given `world.json.defaultAgentId` points at an agent directory with `runtime.json`, the agent runtime file overrides matching keys from the repo-root `runtime.json`.
11. Given runtime provider credentials are present in `.env` or the process environment, the CLI still uses those credentials without requiring them to be duplicated into `runtime.json`.
12. Given an existing project root still contains an old `.chats` directory, the CLI does not depend on it and initializes the new `.agent-world` contract independently.
13. Given `agent-cli --remote` depends on local persisted chat state, remote chat operations continue to work after the durable storage root moves to `.agent-world`.
14. Given a `--remote` host is active, the host lock is enforced from `./.agent-world/remote-host.lock.json`.
15. Given prompt and skill loading, the CLI continues to read `./AGENTS.md` and `./.agents/skills/` unchanged.

## Open Questions

1. The requested structure defines required filenames, but it does not yet fix the exact schema for `chat.json`, `state.json`, or the JSONL record shapes for messages, inbox items, and events.
2. The requirement introduces agent-scoped files, but it does not yet define whether one project may host multiple durable agents simultaneously or how the default agent is created when none exists.
3. The runtime-file requirement defines precedence, but it does not yet define whether non-default agents should ever be selectable for a single invocation without changing `world.json.defaultAgentId`.
4. The requirement removes non-credential runtime defaults from `.env`, but it does not yet define whether legacy `LLM_*` runtime env keys should be ignored silently or rejected with a clear startup error.
