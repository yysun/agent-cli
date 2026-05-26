# Agent CLI

Local-first agent runtime, durable `.agent-world` storage, one CLI binary, and a minimal Electron shell.

The project used to carry a relay server, Vite web client, and `agent-world-cli` shell. Those surfaces are gone. The supported product boundary is now smaller and clearer: run agents locally through `agent-cli`, keep state on disk, and build the desktop shell from `electron/`.

## What Stays

- `cli/src/agent-cli.ts`: CLI argument parsing, one-shot turns, and interactive terminal chat.
- `cli/src/turn-executor.ts`: terminal turn execution and stream-trace persistence.
- `core/agent-runtime.ts`: provider/runtime integration.
- `core/world-store.ts` and `core/workspace-store.ts`: `.agent-world` workspace, world, agent, chat, queue, and memory storage.
- `core/agent-world-runtime.ts`: runtime API over the local world store.
- `electron/`: Electron main/preload code and the Electron-owned renderer.
- `bin/agent-cli.js`: generated CLI executable.

## What Is Gone

- No relay server.
- No web app.
- No `agent-world-cli` binary.
- No `agent-cli --remote`.
- No browser pairing, remote host locks, or relay session state.

## Install

```sh
npm install
```

## Build

```sh
npm run build
```

This type-checks `core/` and bundles `cli/src/agent-cli.ts` to `bin/agent-cli.js`.

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

Runtime settings can come from:

1. CLI flags
2. selected-world `agents/{agentId}/agent.json`
3. selected-world `world.json`

CLI flags win. Supported runtime flags include:

- `--provider <name>`
- `--model <name>`
- `--temperature <number>`
- `--max-tokens <number>`
- `--tool-permission <auto|ask|read>`
- `--reasoning-effort <level>`
- `--past-messages <count>`
- `--stream-trace <true|false>`
- `--web-search <true|false|low|medium|high>`
- `--agent-id <id>`
- `--new-agent <id>`
- `--workspace <path>`
- `--world <id>`

Example:

```sh
npm run agent-cli -- --new-agent research --provider openai --model gpt-5 "Inspect this repo"
```

## Workspace And Storage

Workspace root resolution:

1. `--workspace <path>`
2. legacy `--project <path>`
3. `AGENT_CLI_WORKSPACE`
4. `AGENT_CLI_WORKSPACE` loaded from the invocation cwd `.env`
5. current working directory

The resolved absolute root is published back to `AGENT_CLI_WORKSPACE`.

Durable state lives under `.agent-world/`:

```text
.agent-world/
  registry.json
  skills/
  worlds/
    {worldId}/
      world.json
      agents/{agentId}/agent.json
      agents/{agentId}/state.json
      agents/{agentId}/memory.jsonl
      agents/{agentId}/events.jsonl
      chats/{chatId}/chat.json
      chats/{chatId}/messages.jsonl
      chats/{chatId}/summary.md
      queues/{chatId}.json
      skills/
```

No `.chats` compatibility path is current. No singleton `.agent-world/world.json` layout is current.

## Environment

`.env` is loaded from the invocation cwd and is limited to credentials plus optional workspace selection. Runtime defaults belong in `.agent-world/worlds/{worldId}/world.json`, selected agent `agent.json`, or CLI flags.

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
npm run test:syntax
npm run test:unit
npm run test:e2e
npm run electron:build
```

`npm test` runs syntax, unit, and local `agent-cli` E2E checks.
