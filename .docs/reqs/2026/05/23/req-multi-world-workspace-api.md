# Requirement: Multi-World Workspace API

## Problem

`.agent-world` currently behaves as one durable world. The workspace root exists as an implicit path selector, but there is no workspace API that owns the world registry or selected world. That makes multiple worlds impossible without leaking `currentChatId`, `defaultAgentId`, agents, chats, queues, memory, and remote locks through shared paths.

The product needs a clear split: workspace is the local project/container; world is the isolated operating state inside that workspace.

## Requirements

- Add a workspace API that manages multiple worlds in one workspace.
- Keep the workspace API narrow:
  - list worlds
  - create worlds
  - select the current world
  - rename worlds
  - delete worlds when safe
  - resolve the active world for runtime and CLI entrypoints
- Store workspace-level registry state under `.agent-world/registry.json`.
- Store world-owned state under `.agent-world/worlds/{worldId}`:
  - `world.json`
  - `agents/`
  - `chats/`
  - `queues/`
  - `remote-host.lock.json`
  - world-specific `skills/`
- Keep `AGENTS.md`, `.env`, and root `runtime.json` workspace-level only.
- Discover skills from both workspace and active world:
  - workspace shared skills under `.agent-world/skills`
  - active-world skills under `.agent-world/worlds/{worldId}/skills`
  - world-level skills override workspace-level skills with the same `skillId`
- Preserve the existing single-world behavior for users who do not pass a world selector.
- Add a world selector to CLI surfaces where world state is touched.
- Ensure runtime config that depends on default agent reads from the selected world, not a global singleton `world.json`.
- Scope remote-host locks to the selected world, so a remote session in one world does not block another world in the same workspace.
- Do not migrate or preserve compatibility for the old singleton `.agent-world/world.json`, `.agent-world/agents`, `.agent-world/chats`, `.agent-world/queues`, or `.agent-world/remote-host.lock.json` layout.
- Update documentation to describe workspace-level and world-level ownership accurately.

## Acceptance Criteria

- A fresh workspace bootstraps `.agent-world/registry.json` plus `.agent-world/worlds/default/world.json`.
- `agent-cli` and `agent-world-cli` preserve current behavior when no world is specified.
- `--world <id>` selects an existing world or creates/resolves a default world according to documented behavior.
- `agent-world-cli` exposes workspace world-management commands.
- Current chat and default agent are isolated per world.
- Agents, agent memory, chats, queues, and remote locks are isolated per world.
- Workspace skills and active-world skills are both discovered.
- World-level duplicate skills override workspace-level duplicate skills deterministically.
- `AGENTS.md` continues to load only from the workspace root.
- Runtime config precedence remains CLI flags > selected-world agent runtime > selected-world agent metadata > workspace `runtime.json`.
- Tests cover bootstrap, world switching, per-world isolation, skill layering, AGENTS.md location, runtime config lookup, and remote-lock scoping.
- Tests do not depend on the old singleton storage layout.

## Non-Goals

- Do not make `AGENTS.md` world-specific.
- Do not move `.env` or credentials under worlds.
- Do not make workspace own chats, agents, memory, queues, or current chat.
- Do not introduce a new storage backend.
- Do not include migration or backwards compatibility for the old singleton `.agent-world` layout.
- Do not break existing workspace-root selection through `--workspace`, `AGENT_CLI_WORKSPACE`, or legacy `AGENT_CLI_ROOT`.
