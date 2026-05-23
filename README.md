# Agent CLI

Workspace: Agent CLI
Repo: yysun/agent-cli
CLI: agent-cli
Core objects:
- Memory = map marks
- Tension = terrain signals
- Insight = route judgment
- Action = next move

## CLI

CLI source now lives under `./cli/src` in TypeScript.
`./cli/src/agent-cli.ts` owns argument parsing, entrypoint flow, and shell I/O.
`./cli/src/turn-executor.ts` owns runtime resolution, turn execution, and stream-trace persistence.
`./cli/src/agent-world-cli.ts` owns the Agent World command shell; `./core/agent-world-runtime.ts` owns the world runtime API.
`./bin/agent-cli.js` is the bundled executable built from the TypeScript CLI entry.

Naming convention:
- `agent-cli`
- `agent-runtime`
- `agent-world-cli`
- `agent-world-runtime`

Run the chat CLI with:

```bash
npm run agent-cli -- --new-chat "Map my next financial move"
```

Follow-up messages reuse the current chat automatically:

```bash
npm run agent-cli -- "What should I do first?"
```

Run without a message to start an interactive terminal chat. The prompt keeps using the current persisted chat until you switch or clear it.

```bash
npm run agent-cli --
```

Interactive commands are `/new`, `/clear`, `/chats`, `/use <chatId>`, `/exit`, and `/quit`.

Use `--verbose` when you want startup and runtime-selection diagnostics on stderr without affecting the assistant response on stdout.

Streaming is enabled by default. While streaming, response text chunks stream on stdout. Diagnostics such as `warning: ...`, `error: ...`, `reasoning: ...`, and `tool: ...` are printed to stderr only when `--verbose` is set. There is no `data: [DONE]` marker. Pass `--stream-off` to force non-stream (generate) mode and print only the final plain-text answer.

Use `--remote` to host the current local chat through the optional relay server. The CLI reads the relay URL from `AGENT_CLI_RELAY_SERVER_URL`, connects to the relay, and prints the client connection URL supervisors can use to pair.

One remote host session can now serve multiple paired clients at the same time. After the first client pairs, the web UI can mint an additional one-time invite link for another browser or device without restarting the local CLI host.

Paired browsers observe the same shared remote session over SSE. Shared assistant output, run status, approvals, completion, failure, disconnect, and session snapshots fan out to every authorized paired browser, while requester-specific slash-command results and command errors stay targeted to the requesting client.

`agent-cli --remote` is a long-running host process. It stays alive after startup, keeps the local workspace root locked for that remote session, and continues serving relay commands until the host exits, a client disconnect ends the session, or you press `Ctrl+C`.

Remote sessions created by `agent-cli --remote` do not expire by default. They stay available until the local CLI process exits, the remote client disconnects, or you press `Ctrl+C`.

Runtime settings can be supplied through `runtime.json` and overridden on the command line. Supported flags are `--provider`, `--model`, `--temperature`, `--max-tokens`, `--tool-permission`, `--reasoning-effort`, `--past-messages`, `--stream-trace`, and `--web-search`. Use either `--flag=value` or `--flag value`.
Use `--workspace <path>` to run against a specific Agent CLI workspace without changing your shell's current directory. `--project <path>` remains as a compatibility alias.
Use `--agent-id <id>` to select an agent, or `--new-agent <id>` to create/select one.

Remote hosting uses:

```bash
npm run agent-cli -- --remote
```

Remote hosting with an initial local turn uses:

```bash
npm run agent-cli -- --remote "Summarize the current task"
```

Start the relay server in a separate terminal:

```bash
npm run relay-server
```

By default, the relay binds to `127.0.0.1` and serves only the relay API.

For phone or LAN access with the built web app served from the same process:

```bash
npm run relay-server:prod
```

On startup, the relay prints every reachable listen URL for the current bind. When you use `HOST=0.0.0.0`, it lists each local interface address instead of only the wildcard host.

Use `npm run relay-server:lan` when `./bin/public` is already built and you want LAN exposure without rebuilding.

For live frontend iteration, you can still run the Vite dev server separately:

```bash
npm run web:install
npm run web:dev
```

Or run all three together in one command:

```bash
npm run dev
```

`npm run dev` starts the relay server first, waits for `/healthz`, then starts the web UI and `agent-cli --remote`.

Paste the `Client connection URL` printed by `agent-cli --remote` into the web app and pair. The UI can send generic remote text input, approval decisions, cancel/resume commands, and disconnect requests for the active local remote session.

If the browser is refreshed, the session URL is reopened, or the SSE stream drops transiently, the web client automatically restores the live session while the remote session is still valid. The relay sends heartbeat comments and resume-friendly event IDs so the browser can continue from its last confirmed event position without restarting the local CLI host.

Paired clients can also drive local chat-management through slash commands sent over the same generic input path:
- `/chats`
- `/messages <chatId>`
- `/new`
- `/use <chatId>`

The browser UI uses that same slash-command path underneath its chat sidebar controls, so the relay stays transport-oriented instead of defining chat-specific remote command types.

Paired clients can still create a new one-time invite link for another paired client.

The deterministic relay and remote-host e2e coverage confirms that a real `agent-cli --remote` process stays up, serves slash-command-driven chat listing and persisted chat-message reads, and supports resumed SSE streams through the relay.

### Agent Files

- System prompt: `./AGENTS.md`
- Repo runtime defaults: `./runtime.json`
- Skills root: `./.agent-world/skills/`
- Durable world root: `./.agent-world/`

Durable local state lives under `./.agent-world/`:
- `world.json` stores world identity plus `defaultAgentId` and `currentChatId`
- `chats/{chatId}/chat.json`, `messages.jsonl`, and `summary.md` store chat metadata, ordered message history, and summary text
- `agents/{agentId}/agent.json`, `inbox.jsonl`, `state.json`, `events.jsonl`, and `memory.md` store agent-scoped metadata, inbox, mutable state, event traces, and memory

Agent runtime config can live in `./.agent-world/agents/{agentId}/agent.json` and `./.agent-world/agents/{agentId}/runtime.json`. `agent.json` provides the agent identity plus provider/model fallback; `runtime.json` stores runtime overrides and wins over matching `agent.json` fields.

Remote host coordination also lives under `./.agent-world/remote-host.lock.json` while a `--remote` host session is active. Agent CLI now treats `./.agent-world/` as the only supported local storage contract for world, chat, agent, and remote-host state.

While a CLI process is running in `--remote` mode for a workspace root, other CLI invocations from that same root are rejected until the remote host exits. A stale lock from a dead process is cleared automatically on the next start.

The CLI always includes a built-in default system prompt.
If `./AGENTS.md` is present and non-empty, its content is added after the built-in prompt and before tools/skills guidance.
If `./AGENTS.md` is missing or empty, the CLI continues with only the built-in prompt.
If `./.agent-world/skills/` is missing, the CLI continues with an empty skill inventory.

The CLI uses `--workspace <path>` as the workspace root when provided, otherwise legacy `--project <path>`, otherwise `AGENT_CLI_WORKSPACE`, otherwise legacy `AGENT_CLI_ROOT`, otherwise either value from the current working directory's `.env`, otherwise the current working directory. Prompts, skills, runtime files, `.agent-world/` storage, the agent tool working directory, and the local `.env` lookup all resolve from that workspace root.

Skills follow `llm-runtime` conventions and are discovered from recursive `SKILL.md` files under `./.agent-world/skills/`.

### Runtime Configuration

Runtime defaults can come from three file layers:
- `./runtime.json`
- `./.agent-world/agents/{agentId}/agent.json`
- `./.agent-world/agents/{agentId}/runtime.json`

Precedence is: CLI flags, then agent-level `runtime.json`, then agent-level `agent.json`, then repo-root `runtime.json`. `--agent-id <id>` selects the agent for the invocation. `--new-agent <id>` creates the folder under `./.agent-world/agents/{id}`, prompts for missing name/provider/model when running interactively, writes `agent.json` and `runtime.json`, and sets `world.json.defaultAgentId`.

The runtime file schema currently supports:

```json
{
	"schemaVersion": 1,
	"provider": "openai",
	"model": "gpt-5",
	"reasoningEffort": "medium",
	"temperature": 0.2,
	"maxTokens": 4096,
	"toolPermission": "ask",
	"webSearch": false,
	"pastMessages": 20,
	"stream": true,
	"streamTrace": false
}
```

`pastMessages` controls how many previous persisted chat messages are loaded into each LLM request. If it is not defined, the CLI loads `0` past messages by default.
`stream` controls whether response text streams by default. Use `--stream-off` to force non-stream mode even when the runtime file enables streaming.
`streamTrace` accepts `true` or `false`. When set to `true`, the CLI writes per-turn streaming events (`warning`, `error`, `reasoning`, `tool`, and `text`) to `events.jsonl` under the active agent directory.

The CLI parser accepts a few aliases for convenience: `modal` -> `model`, `tokens` -> `maxTokens`, `permissions` -> `toolPermission`, `reasoning` -> `reasoningEffort`, and `web_search` -> `webSearch`.

Provider credentials still come from environment variables. When a local `.env` file is present at the resolved workspace root, Agent CLI only loads provider credential keys and relay configuration from it.

Non-credential runtime defaults such as provider selection, model, temperature, tool mode, search mode, history depth, streaming, and stream tracing should be set in `runtime.json` or on the command line rather than in `.env`.

Set credential environment variables before running the CLI:

Use `./.env.example` as a template for local credential setup.

- Export `AGENT_CLI_RELAY_SERVER_URL` in your shell when using `--remote`
- Provider credentials depend on the `provider` selected in `runtime.json` or via CLI flags

Supported provider env vars:

- `openai`: `OPENAI_API_KEY`
- `anthropic`: `ANTHROPIC_API_KEY`
- `google`: `GOOGLE_API_KEY`
- `xai`: `XAI_API_KEY`
- `openai-compatible`: `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_BASE_URL`
- `ollama`: `OLLAMA_BASE_URL`
- `azure`: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_RESOURCE_NAME`, `AZURE_OPENAI_DEPLOYMENT_NAME`, optional `AZURE_OPENAI_API_VERSION`

### Tests

- `npm test`: targeted checks (syntax, unit tests, deterministic relay and remote-host e2e, and web typecheck)
- `npm run test:unit`: targeted module tests
- `npm run test:e2e`: deterministic relay e2e plus live-provider CLI e2e
- `npm run test:e2e:relay`: deterministic relay-server and remote-host end-to-end coverage
- `npm run test:e2e:live`: end-to-end CLI flows against a real LLM provider
- `npm run relay-server`: run the optional relay server locally
- `npm run dev`: start relay + web + remote CLI together for local development
- `npm run web:install`: install React/Vite web UI dependencies under `./web`
- `npm run web:dev`: run the web UI in development mode
- `npm run web:build`: build the web UI for production
- `npm run web:preview`: preview the built web UI locally

### Production Static Hosting

Yes. The relay can serve the compiled React app as static files from `./bin/public`.

Build the web app first:

```bash
npm run web:build
```

Then start relay with static hosting enabled:

```bash
npm run relay-server:lan
```

Or use the helper script:

```bash
npm run relay-server:prod
```

This serves the fixed `./bin/public` bundle from the same process while keeping relay APIs available. You can also pass custom values with `--host` and `PORT`.

Examples:

```bash
npm run relay-server:prod -- --port 8080
npm run relay-server:prod -- --host 0.0.0.0 --port 8080
```

### Remote Safety

`--remote` does not move agent execution, tools, workspace files, `.env` contents, provider API keys, or long-term memory off the local machine. The relay only receives short-lived normalized coordination data for the active local host session, including status changes, assistant output, approval requests, remote commands, and per-client chat-management responses.

The repo now uses package-level ESM via `"type": "module"`, so local modules use `.js` files instead of `.mjs`.

CLI source lives under `./cli/src/` as TypeScript and bundles to `./bin/agent-cli.js`. Shared runtime source lives under `./core/*.ts` and is type-checked without emitting duplicate files next to the source. The web app bundles to `./bin/public`, so shipped runtime artifacts live under `./bin/`.

```bash
npm run build
```

`npm test` includes the deterministic relay and remote-host e2e suite, so the default path now exercises the real relay binary and `agent-cli --remote` long-running host loop without requiring external model credentials.

The live CLI e2e suite uses the same runtime validation path as the CLI and always expects a usable live provider configuration. It prefers the configured provider when that configuration is complete; otherwise it falls back to another available live provider for the test process when possible. If no usable provider configuration is available, `npm run test:e2e:live` fails fast instead of skipping, and `npm run test:e2e` will fail at that step as well.
