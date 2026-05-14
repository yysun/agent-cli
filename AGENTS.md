# Agent CLI

Rules for AI agents working in this repo:

- Root: use `AGENT_CLI_ROOT` when set; otherwise use `cwd`. Resolve `AGENTS.md`, `.agents/skills`, `runtime.json`, `.env`, and `.agent-world` from that root.
- Storage: use `.agent-world` only. No `.chats` compatibility paths. `world.json` is the source of truth for `defaultAgentId` and `currentChatId`.
- Layout: chats in `.agent-world/chats/{chatId}`; agent state in `.agent-world/agents/{agentId}`; remote lock in `.agent-world/remote-host.lock.json`.
- Runtime precedence: CLI flags > `.agent-world/agents/{agentId}/runtime.json` > repo-root `runtime.json`.
- `.env`: credentials and relay config only. Do not move runtime defaults into `.env`.
- Build outputs: CLI -> `bin/agent-cli.js`; relay -> `bin/server.js`; web -> `bin/public`; core TS compiles in place to `core/*.js`.
- Source of truth: prefer editing `cli/src`, `core`, `server/src`, `web/src`. Avoid editing generated outputs unless required.
- Imports: keep local ESM imports using `.js` extensions.
- Remote: `--remote` requires `AGENT_CLI_RELAY_SERVER_URL`. Preserve `/chats`, `/messages <chatId>`, `/new`, `/use <chatId>` behavior and keep selected-chat state synced.
- Safety: keep execution local-first. Do not move workspace files, tools, provider keys, or long-term memory off-machine.
- Validation: prefer targeted checks. Key commands: `npm run build:ts`, `npm run test:syntax`, `npm run test:unit`, `npm run test:e2e:relay`.
- Editing: prefer root-cause fixes, keep changes minimal, update tests/docs when behavior changes, and do not describe outdated layouts as current.

