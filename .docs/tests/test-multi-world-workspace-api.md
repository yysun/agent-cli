# E2E Spec: Multi-World Workspace API

## Scenario: Fresh Workspace Uses Default World

1. Start `agent-world-cli world` against an empty workspace.
2. Confirm `.agent-world/registry.json` exists with `currentWorldId: "default"`.
3. Confirm `.agent-world/worlds/default/world.json` exists.
4. Confirm the default world has a default agent and no current chat.

## Scenario: Create And Switch Worlds

1. Create a world named `research`.
2. Select `research`.
3. Create a chat in `research`.
4. Switch back to `default`.
5. Confirm `default` has a different `currentChatId` from `research` or no current chat.
6. Confirm chats from `research` are not listed as current in `default`.

## Scenario: Runtime Config Uses Selected World Default Agent

1. In `default`, create an agent with one model.
2. In `research`, create an agent with a different model and set it as default.
3. Run config resolution for each selected world.
4. Confirm each world resolves the runtime config from its own default agent.

## Scenario: Workspace And World Skills Are Layered

1. Add one shared skill under `.agent-world/skills`.
2. Add one world-specific skill under `.agent-world/worlds/research/skills`.
3. Add a duplicate skill id in both locations.
4. Select `research` and list skills.
5. Confirm shared-only skills are present, world-only skills are present, and the duplicate resolves to the world-specific skill.
6. Confirm `AGENTS.md` still loads from the workspace root only.

## Scenario: Remote Locks Are Per World

1. Acquire a remote lock in `default`.
2. Select or explicitly run against `research`.
3. Confirm remote startup in `research` is not blocked by the `default` lock.
4. Confirm a second remote startup in `default` is blocked.

## Execution Status

- Covered by `tests/unit/agent-world-cli.test.js` for world creation, selection, and per-world current-chat isolation.
- Covered by `tests/unit/agent-files.test.js` for workspace plus selected-world skill discovery and world-level duplicate override.
- Existing CLI, remote, and syntax coverage passed through `npm run test:unit`, `npm run test:syntax`, and `npm run test:e2e:relay`.
