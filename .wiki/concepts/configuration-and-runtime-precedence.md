---
title: "Configuration And Runtime Precedence"
type: "concept"
status: "active"
language: "default"
source_paths:
  - "README.md"
  - "runtime.json"
  - "cli/src/agent-cli.ts"
  - "cli/src/agent-world-cli.ts"
  - "core/agent-config.ts"
  - "core/agent-runtime.ts"
  - "core/paths.ts"
  - "core/workspace-environment.ts"
  - ".docs/done/2026/05/14/agent-world-storage.md"
  - ".docs/done/2026/05/20/agent-id-config.md"
  - ".docs/done/2026/05/23/align-agent-world-workspace.md"
  - ".docs/done/2026/05/23/workspace-terminology.md"
updated_at: "2026-05-23"
---

# Configuration And Runtime Precedence

This page explains where the app gets its settings and which source wins when the same setting shows up in more than one place. It also separates everyday behavior settings from secrets such as API keys.

## Which Folder Counts As The Workspace?

- The workspace root is `--workspace <path>` when the flag is provided.
- Legacy `--project <path>` still works as an alias.
- Otherwise it is `AGENT_CLI_WORKSPACE` when that environment variable is set.
- Otherwise legacy `AGENT_CLI_ROOT` still works.
- Otherwise it can fall back to either root key from the current working directory's `.env`.
- Otherwise it is the real current working directory.
- `AGENTS.md`, `.agent-world/skills`, `runtime.json`, `.env`, and `.agent-world` all resolve from that same root.

This matters because the app reads prompts, skills, settings, and saved chat data from that one chosen folder. `core/workspace-environment.ts` now prepares that root for both CLIs, while `core/paths.ts` keeps compatibility aliases such as `configureProjectRoot(...)`. [[workspace-root-resolution]] and [[storage-layout]] show the boundary.

## Runtime Layers

The run settings are loaded in this order, from weakest to strongest:

1. Repo defaults in `runtime.json`.
2. Selected agent metadata in `.agent-world/agents/{agentId}/agent.json`, currently useful as provider/model fallback.
3. Selected agent overrides in `.agent-world/agents/{agentId}/runtime.json`.
4. CLI flags such as `--provider`, `--model`, `--temperature`, `--past-messages`, and `--stream-off`.

The cleanup logic in [[runtime-config-loading-and-normalization]] converts older spellings such as `modal`, `tokens`, `permissions`, and `reasoning` into the current setting names so the rest of the app sees one consistent shape.

`--agent-id <id>` and `--new-agent <id>` select the agent before this merge happens. [[named-agent-selection]] covers the creation and selection flow.

## What `.env` Still Does

The CLI still reads `.env`, but only for provider credential keys. It does not use `.env` for normal behavior settings like model choice, temperature, tool mode, or search settings.

That means:

- use `runtime.json` or CLI flags for behavior
- use `.env` or process environment variables for secrets such as API keys
- export `AGENT_CLI_RELAY_SERVER_URL` in the process environment when running [[remote-session-lifecycle]]

This is stricter than the product description might suggest. `core/workspace-environment.ts` allow-lists provider credential variables and `AGENT_CLI_RELAY_SERVER_URL` from local `.env`; runtime behavior settings belong in runtime files or flags.

## Provider Validation

`core/agent-runtime.ts` validates the selected provider before any turn starts. The supported providers are `openai`, `anthropic`, `google`, `azure`, `xai`, `openai-compatible`, and `ollama`.

If the required environment variables are missing, the CLI fails early instead of starting and then failing later in the middle of a model call or tool run.

## History And Streaming Settings

- `pastMessages` limits how much earlier chat history is sent back to the model.
- The full chat history on disk is still kept in `.agent-world`.
- `stream` and `streamTrace` are normal behavior settings, not secret settings.

Those settings are applied during [[chat-turn-lifecycle]] and persisted by [[world-store]].
