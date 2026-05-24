# Requirement: Retire Runtime JSON

## Problem

Agent CLI now has workspace-managed worlds, but runtime settings still live in separate `runtime.json` files at the workspace and agent levels. That splits one concept across too many files:

- workspace `runtime.json`
- selected-world `world.json`
- selected-world `agents/{agentId}/agent.json`
- selected-world `agents/{agentId}/runtime.json`

The result is unclear ownership. World defaults belong to the world. Agent-specific identity and runtime overrides belong to the agent. A separate `runtime.json` file is now extra indirection.

## Requirements

- Retire `runtime.json` as a supported configuration source.
- Do not create, read, document, or recommend workspace-level `runtime.json`.
- Do not create, read, document, or recommend agent-level `runtime.json`.
- Store world-wide runtime defaults in the selected world's `world.json`.
- Store agent identity and agent-specific runtime settings in `agents/{agentId}/agent.json`.
- Keep CLI flags as the highest-precedence runtime source.
- Keep provider credentials in `.env` or process environment only.
- Keep `.env` limited to credentials and relay config.
- Preserve `AGENTS.md` as workspace-level instructions only.
- Preserve `.agent-world/registry.json` as workspace-level world registry only.
- Remove runtime config duplication between `agent.json` and `runtime.json` by eliminating `runtime.json`.
- The effective runtime config must be resolved from:
  - CLI flags
  - selected-world `agents/{agentId}/agent.json`
  - selected-world `world.json`
  - provider defaults when no configured model is present
- Agent creation must write provider/model and other agent-specific runtime settings into `agent.json`, not `runtime.json`.
- World creation/bootstrap may write default runtime settings into `world.json` when needed.
- User-facing errors, docs, and help text must refer to `world.json`, `agent.json`, or CLI flags, not `runtime.json`.

## Acceptance Criteria

- No source code path reads workspace `runtime.json`.
- No source code path reads selected-world agent `runtime.json`.
- No source code path writes selected-world agent `runtime.json`.
- A fresh agent created through `agent-cli --new-agent` or `agent-world-cli agents create` has runtime settings in `agent.json` only.
- Runtime precedence is CLI flags > selected-world `agent.json` > selected-world `world.json` > provider defaults.
- Existing tests that seed or assert `runtime.json` are updated to seed/assert `world.json` or `agent.json`.
- README and AGENTS instructions describe the new ownership model.
- Error messages that currently say "Set it in runtime.json" are updated.
- Generated CLI bundles reflect the new behavior after build.

## Non-Goals

- Do not add migration or backwards compatibility for existing `runtime.json` files.
- Do not move provider credentials into `world.json` or `agent.json`.
- Do not make `AGENTS.md` world-specific.
- Do not change provider credential environment variable names.
