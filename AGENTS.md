# Agent CLI

Rules for AI agents working in this repo:

- Workspace root: use `AGENT_CLI_WORKSPACE` when set, otherwise use `cwd` and publish that resolved path back to `AGENT_CLI_WORKSPACE`. Resolve `AGENTS.md`, workspace `.agent-world/skills`, `.agent-world`, and `.env` from that root. Resolve user skills from `~/.agent-world/skills`.
- Storage: use `.agent-world` only. `.agent-world/world.json` is optional best-effort startup metadata with no schema validation. No `.chats` compatibility paths, no `.agent-world/worlds`, no registry, no `agents`, and no `agent.json`.
- Layout: chats in `.agent-world/chats`; workspace skills in `.agent-world/skills`.
- Runtime precedence: CLI flags > `.env` `AGENT_CLI_*` runtime defaults.
- `.env`: credentials and `AGENT_CLI_*` runtime defaults only. It does not select the workspace.
- Build outputs: CLI -> `bin/agent-cli.js`; core remains TypeScript source and is checked with no emit; Electron builds from `electron/`.
- Source of truth: prefer editing `cli/src`, `core`, and `electron`. Avoid editing generated outputs unless required.
- Imports: keep local ESM imports using `.js` extensions.
- Deleted surfaces: no relay server, web app, `agent-world-cli`, `agent-cli --remote`, worlds, or persisted agents.
- Safety: keep execution local-first. Do not move workspace files, tools, provider keys, or long-term memory off-machine.
- Validation: prefer targeted checks. Key commands: `npm run build`, `npm run check`, `npm run test:unit`, `npm run test:e2e`, `npm run electron:build`.
- Editing: prefer root-cause fixes, keep changes minimal, update tests/docs when behavior changes, and do not describe outdated layouts as current.
