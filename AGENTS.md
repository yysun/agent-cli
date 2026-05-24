# Agent CLI

Rules for AI agents working in this repo:

- Workspace root: use `AGENT_CLI_WORKSPACE` when set, otherwise use `cwd` and publish that resolved path back to `AGENT_CLI_WORKSPACE`. Resolve `AGENTS.md`, workspace `.agent-world/skills`, and `.agent-world` from that root. Resolve `.env` from invocation `cwd`.
- Workspace API: `.agent-world/registry.json` owns `currentWorldId` and the list of worlds. `--world <id>` or `AGENT_CLI_WORLD` selects a world.
- Storage: use `.agent-world` only. No `.chats` compatibility paths and no singleton `.agent-world/world.json` layout.
- Layout: world state in `.agent-world/worlds/{worldId}`; chats in `chats/{chatId}`; agent state in `agents/{agentId}`; world skills in `skills`; remote lock in `remote-host.lock.json`.
- Runtime precedence: CLI flags > selected-world `agents/{agentId}/agent.json` > selected-world `world.json`.
- `.env`: credentials and relay config only. Do not move runtime defaults into `.env`.
- Build outputs: CLI -> `bin/agent-cli.js`; relay -> `bin/server.js`; web -> `bin/public`; core remains TypeScript source and is checked with no emit.
- Source of truth: prefer editing `cli/src`, `core`, `server/src`, `web/src`. Avoid editing generated outputs unless required.
- Imports: keep local ESM imports using `.js` extensions.
- Remote: `--remote` requires `AGENT_CLI_RELAY_SERVER_URL`. Preserve `/chats`, `/messages <chatId>`, `/new`, `/use <chatId>` behavior and keep selected-chat state synced.
- Safety: keep execution local-first. Do not move workspace files, tools, provider keys, or long-term memory off-machine.
- Validation: prefer targeted checks. Key commands: `npm run build`, `npm run test:syntax`, `npm run test:unit`, `npm run test:e2e:relay`.
- Editing: prefer root-cause fixes, keep changes minimal, update tests/docs when behavior changes, and do not describe outdated layouts as current.
