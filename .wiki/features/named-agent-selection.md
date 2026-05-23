---
title: "Named Agent Selection"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "README.md"
  - "cli/src/cli-shell.ts"
  - "core/agent-config.ts"
  - "core/session-store.ts"
  - "tests/unit/agent-cli.test.js"
  - "tests/unit/agent-config.test.js"
  - "tests/unit/session-store.test.js"
  - ".docs/reqs/2026/05/20/req-agent-id-config.md"
  - ".docs/done/2026/05/20/agent-id-config.md"
  - ".docs/tests/test-agent-id-config.md"
updated_at: "2026-05-23"
---

# Named Agent Selection

Agent CLI now lets a project carry multiple named agents under `.agent-world/agents/{agentId}`. The old practical model was "the default agent plus optional runtime overrides"; the new model lets the user select or create an agent explicitly and have that choice drive metadata, runtime provider/model defaults, chat persistence, stream traces, and remote state.

## User Contract

- `--agent-id <id>` selects an agent for the invocation.
- `--new-agent <id>` creates or initializes the agent, then selects it.
- Omitting both flags uses `default`.
- Selecting a missing agent initializes the folder automatically.
- `world.json.defaultAgentId` is updated when an agent is selected or created.

Agent folders stay under `.agent-world/agents/{agentId}`. There is no parallel `.agent-world/{agentId}` layout.

## Agent Files

Each selected agent can have:

- `agent.json` for identity and provider/model fallback.
- `runtime.json` for agent-level runtime overrides.
- `state.json`, `inbox.jsonl`, `events.jsonl`, and `memory.md` for agent-scoped state and traces.

Credentials are not stored there. Provider keys still come from the environment or project `.env`, as described in [[configuration-and-runtime-precedence]].

## Creation Flow

`cli/src/cli-shell.ts` parses `--agent-id` and `--new-agent`, then calls the selection path before runtime config is resolved. When an interactive prompt is available and required fields are missing, new-agent setup asks for name, provider, and model. Scripted runs can provide provider and model through normal runtime flags.

The selected agent id is printed in startup diagnostics, which makes accidental default-agent use visible when `startupDiagnostics` is enabled.

## Runtime Precedence

The effective runtime config now merges, from weakest to strongest:

1. repo-root `runtime.json`
2. selected agent `agent.json`
3. selected agent `runtime.json`
4. CLI flags

That middle `agent.json` layer is intentional. It means provider/model values entered during agent creation are still honored even before a richer `runtime.json` exists. [[lib-agent-config-js]] owns the file loading and normalization.

## Storage Boundary

[[lib-session-store-js]] owns the bootstrap behavior. It creates world metadata, selected agent files, and chat state under the configured project root. [[storage-layout]] documents the resulting on-disk shape.

The practical consequence is that named agents change which local agent state is active without moving the project, tools, credentials, or saved data off-machine.
