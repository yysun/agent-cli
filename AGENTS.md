# Agent CLI

Rules for AI agents working in this repo:

- Workspace root: use `AGENT_CLI_WORKSPACE` when set, otherwise use `cwd` and publish that resolved path back to `AGENT_CLI_WORKSPACE`. Resolve `AGENTS.md`, workspace `.agent-world/skills`, and `.agent-world` from that root. Resolve user skills from `~/.agent-world/skills`. Resolve `.env` from invocation `cwd`.
- Workspace API: `.agent-world/registry.json` owns `currentWorldId` and the list of worlds. `--world <id>` or `AGENT_CLI_WORLD` selects a world.
- Storage: use `.agent-world` only. No `.chats` compatibility paths and no singleton `.agent-world/world.json` layout.
- Layout: world state in `.agent-world/worlds/{worldId}`; chats in `chats/{chatId}`; agent state in `agents/{agentId}`; world skills in `skills`.
- Runtime precedence: CLI flags > selected-world `agents/{agentId}/agent.json` > selected-world `world.json`.
- `.env`: credentials and optional workspace selection only. Do not move runtime defaults into `.env`.
- Build outputs: CLI -> `bin/agent-cli.js`; core remains TypeScript source and is checked with no emit; Electron builds from `electron/`.
- Source of truth: prefer editing `cli/src`, `core`, and `electron`. Avoid editing generated outputs unless required.
- Imports: keep local ESM imports using `.js` extensions.
- Deleted surfaces: no relay server, web app, `agent-world-cli`, or `agent-cli --remote`.
- Safety: keep execution local-first. Do not move workspace files, tools, provider keys, or long-term memory off-machine.
- Validation: prefer targeted checks. Key commands: `npm run build`, `npm run test:syntax`, `npm run test:unit`, `npm run test:e2e`, `npm run electron:build`.
- Editing: prefer root-cause fixes, keep changes minimal, update tests/docs when behavior changes, and do not describe outdated layouts as current.
