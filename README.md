# Agent CLI

Local-first agent runtime, flat `.agent-world` chat storage, one CLI binary, and a minimal Electron shell.

The supported boundary is intentionally small: run agents locally through `agent-cli`, keep chat state on disk, load workspace instructions from `AGENTS.md`, and build the desktop shell from `electron/`.

## What Stays

- `cli/src/agent-cli.ts`: CLI argument parsing, one-shot turns, and interactive terminal chat.
- `cli/src/turn-executor.ts`: terminal turn execution and stream-trace persistence.
- `core/agent-runtime.ts`: provider/runtime integration.
- `core/chat-store.ts`: flat chat storage under `.agent-world/chats`.
- `core/agent-files.ts`: built-in prompt, workspace `AGENTS.md`, and skill inventory loading.
- `electron/`: Electron main/preload code and the Electron-owned renderer.
- `bin/agent-cli.js`: generated CLI executable.

## What Is Gone

- No relay server.
- No web app.
- No `agent-world-cli` binary.
- No `agent-cli --remote`.
- No worlds, world ids, registry, agents folder, or `agent.json`.

## Install

```sh
npm install
```

## Build

```sh
npm run build
```

Build the Electron shell separately:

```sh
npm run electron:build
```

## Run

```sh
npm run agent-cli -- "Summarize this workspace"
```

Start a new chat:

```sh
npm run agent-cli -- --new-chat "Map my next move"
```

Use interactive mode by omitting the message:

```sh
npm run agent-cli --
```

Interactive commands:

- `/new` or `/clear`: start a fresh chat
- `/chats`: list persisted chats
- `/use <chatId>`: switch chats
- `/exit` or `/quit`: leave interactive mode

Start Electron:

```sh
npm run electron:start
```

## Runtime Settings

LLM-time defaults come from the selected workspace `.env`:

```sh
AGENT_CLI_PROVIDER=openai
AGENT_CLI_MODEL=gpt-5
AGENT_CLI_TEMPERATURE=0.2
AGENT_CLI_MAX_TOKENS=4096
AGENT_CLI_TOOL_PERMISSION=ask
AGENT_CLI_REASONING_EFFORT=medium
AGENT_CLI_PAST_MESSAGES=20
AGENT_CLI_STREAM=true
AGENT_CLI_STREAM_TRACE=false
AGENT_CLI_WEB_SEARCH=false
AGENT_CLI_GLOBAL_SKILLS=false
```

CLI flags override `.env`:

- `--provider <name>`
- `--model <name>`
- `--temperature <number>`
- `--max-tokens <number>`
- `--tool-permission <auto|ask|read>`
- `--reasoning-effort <level>`
- `--past-messages <count>`
- `--stream-trace <true|false>`
- `--web-search <true|false|low|medium|high>`
- `--workspace <path>`

Example:

```sh
npm run agent-cli -- --provider openai --model gpt-5 "Inspect this repo"
```

## Prompt Loading

Agent CLI always uses its built-in system prompt. If the workspace has `AGENTS.md`, Agent CLI reads it from the selected workspace root and layers it into the system prompt for the model. `AGENTS.md` is instruction context, not persisted chat history.

## Workspace And Storage

Workspace root resolution:

1. `--workspace <path>`
2. legacy `--project <path>`
3. `AGENT_CLI_WORKSPACE`
4. current working directory

The resolved absolute root is published back to `AGENT_CLI_WORKSPACE`.

Durable workspace state is flat:

```text
.agent-world/
  world.json
  chats/
    current.json
    {chatId}/
      chat.json
      messages.jsonl
      summary.md
      events.jsonl
  skills/
    .../SKILL.md
```

Workspace skills in `.agent-world/skills` always load. Global skills are opt-in: set `AGENT_CLI_GLOBAL_SKILLS=true` to also load `~/.agent-world/skills` and `~/.agents/skills`. Workspace skills win when skill ids collide.

If `.agent-world/world.json` exists, CLI startup diagnostics parse it as best-effort metadata, then print the configured workflow plus agent list when present. This file is metadata for display; it does not restore persisted worlds or agent selection.

No `.chats` compatibility path is current. No `.agent-world/worlds`, registry, `agents`, or `agent.json` layout is current.

## Environment

`.env` is loaded from the selected workspace root and is limited to credentials and `AGENT_CLI_*` runtime defaults. CLI flags override `.env`; `.env` does not select the workspace.

Supported credential keys include:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `XAI_API_KEY`
- `OPENAI_COMPATIBLE_API_KEY`
- `OPENAI_COMPATIBLE_BASE_URL`
- `OLLAMA_BASE_URL`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_RESOURCE_NAME`
- `AZURE_OPENAI_DEPLOYMENT_NAME`
- `AZURE_OPENAI_API_VERSION`

## Validation

```sh
npm run check
npm run test:unit
npm run test:e2e
npm run electron:build
```

`npm test` runs syntax, unit, and local `agent-cli` E2E checks.
