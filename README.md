# Agent CLI

Project: Agent CLI
Repo: yysun/agent-cli
CLI: agent-cli
Core objects:
- Memory = map marks
- Tension = terrain signals
- Insight = route judgment
- Action = next move

## CLI

Run the chat CLI with:

```bash
npm run agent-cli -- --new-chat "Map my next financial move"
```

Follow-up messages reuse the current chat automatically:

```bash
npm run agent-cli -- "What should I do first?"
```

Use `--verbose` when you want startup and runtime-selection diagnostics on stderr without affecting the assistant response on stdout.

Streaming is enabled by default. While streaming, response text chunks stream on stdout. Diagnostics such as `warning: ...`, `error: ...`, `reasoning: ...`, and `tool: ...` are printed to stderr only when `--verbose` is set. There is no `data: [DONE]` marker. Pass `--stream-off` to force non-stream (generate) mode and print only the final plain-text answer.

Use `--remote` to host the current local chat through the optional relay server. The CLI reads the relay URL from `AGENT_CLI_RELAY_SERVER_URL`, connects to the relay, and prints the client connection URL supervisors can use to pair.

Remote sessions created by `agent-cli --remote` do not expire by default. They stay available until the local CLI process exits, the remote client disconnects, or you press `Ctrl+C`.

Runtime settings can be supplied on the command line or through environment defaults. Supported flags are `--provider`, `--model`, `--temperature`, `--max-tokens`, `--tool-permission`, `--reasoning-effort`, `--past-messages`, `--stream-trace`, and `--web-search`. Use either `--flag=value` or `--flag value`.

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

Use `npm run relay-server:lan` when `./web/dist` is already built and you want LAN exposure without rebuilding.

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

Paste the `Client connection URL` printed by `agent-cli --remote` into the web app and pair. The UI can send remote user messages, approval decisions, cancel/resume commands, and disconnect requests for the active local remote session.

### Agent Files

- System prompt: `./AGENTS.md`
- Skills root: `./.agents/skills/`
- Sessions: `./.chats/`

Session chats are stored under `./.chats/{chatId}/` with:
- `messages.json`: persisted chat messages
- `events.json`: optional stream trace when enabled
- `remote.json`: optional remote-session metadata when `--remote` is used

While a CLI process is running in `--remote` mode for a project root, other CLI invocations from that same root are rejected until the remote host exits. A stale lock from a dead process is cleared automatically on the next start.

The CLI always includes a built-in default system prompt.
If `./AGENTS.md` is present and non-empty, its content is added after the built-in prompt and before tools/skills guidance.
If `./AGENTS.md` is missing or empty, the CLI continues with only the built-in prompt.
If `./.agents/skills/` is missing, the CLI continues with an empty skill inventory.

The CLI treats the current working directory as the project root by default. Run it from the folder that contains `./AGENTS.md`, or set `AGENT_CLI_ROOT` to point at a different project root.

Skills follow `llm-runtime` conventions and are discovered from recursive `SKILL.md` files under `./.agents/skills/`.

### Runtime Configuration

`pastMessages` controls how many previous persisted chat messages are loaded into each LLM request. If it is not defined, the CLI loads `0` past messages by default.
`streamTrace` accepts `true` or `false`. When set to `true`, the CLI writes per-turn streaming events (`warning`, `error`, `reasoning`, `tool`, and `text`) to `events.json` under the active chat directory.

The CLI parser accepts a few aliases for convenience: `modal` -> `model`, `tokens` -> `maxTokens`, `permissions` -> `toolPermission`, `reasoning` -> `reasoningEffort`, and `web_search` -> `webSearch`.

Provider credentials still come from environment variables.
Precedence is: command-line flags, then `LLM_*` environment defaults.

Set runtime environment variables before running the CLI:

Use `./.env.example` as a template for local setup.

- `LLM_PROVIDER` defaults to `openai`
- `LLM_MODEL` defaults to `gpt-5` for `openai` and is required for other providers unless provider-specific defaults apply
- `LLM_TEMPERATURE` sets the request temperature
- `LLM_MAX_TOKENS` sets the max output tokens per turn
- `LLM_TOOL_PERMISSION` sets the default tool mode: `auto`, `ask`, or `read`
- `LLM_REASONING_EFFORT` sets the reasoning level: `default`, `none`, `low`, `medium`, or `high`
- `LLM_PAST_MESSAGES` sets how many persisted messages are loaded as history
- `LLM_STREAM_TRACE` controls whether stream trace events are persisted: `true` or `false`
- `LLM_WEB_SEARCH` enables or configures web search: `true`, `false`, `low`, `medium`, or `high`
- `AGENT_CLI_RELAY_SERVER_URL` points `--remote` at the relay server
- Provider credentials depend on `LLM_PROVIDER`

Supported provider env vars:

- `openai`: `OPENAI_API_KEY`
- `anthropic`: `ANTHROPIC_API_KEY`
- `google`: `GOOGLE_API_KEY`
- `xai`: `XAI_API_KEY`
- `openai-compatible`: `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_BASE_URL`
- `ollama`: `OLLAMA_BASE_URL`
- `azure`: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_RESOURCE_NAME`, `AZURE_OPENAI_DEPLOYMENT_NAME`, optional `AZURE_OPENAI_API_VERSION`

### Tests

- `npm test`: targeted checks (syntax, unit tests, and web typecheck)
- `npm run test:unit`: targeted module tests
- `npm run test:e2e`: end-to-end CLI flows against a real LLM provider
- `npm run relay-server`: run the optional relay server locally
- `npm run dev`: start relay + web + remote CLI together for local development
- `npm run web:install`: install React/Vite web UI dependencies under `./web`
- `npm run web:dev`: run the web UI in development mode
- `npm run web:build`: build the web UI for production
- `npm run web:preview`: preview the built web UI locally

### Production Static Hosting

Yes. The relay can serve the compiled React app as static files from `./web/dist`.

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

This serves the fixed `./web/dist` bundle from the same process while keeping relay APIs available. You can also pass custom values with `--host` and `PORT`.

Examples:

```bash
npm run relay-server:prod -- --port 8080
npm run relay-server:prod -- --host 0.0.0.0 --port 8080
```

### Remote Safety

`--remote` does not move agent execution, tools, workspace files, `.env` contents, provider API keys, or long-term memory off the local machine. The relay only receives short-lived normalized coordination data for the active local chat, including status changes, assistant output, approval requests, and remote commands.

The repo now uses package-level ESM via `"type": "module"`, so local modules use `.js` files instead of `.mjs`.

The e2e suite uses the same runtime validation path as the CLI and always expects a usable live provider configuration. It prefers the configured provider when that configuration is complete; otherwise it falls back to another available live provider for the test process when possible. If no usable provider configuration is available, `npm run test:e2e` fails fast instead of skipping.