---
title: "Workspace Root Resolution"
type: "concept"
status: "active"
language: "default"
source_paths:
  - "core/paths.ts"
  - "core/workspace-environment.ts"
  - "cli/src/agent-cli.ts"
  - "cli/src/agent-world-cli.ts"
  - "README.md"
  - "AGENTS.md"
  - ".docs/done/2026/05/23/workspace-terminology.md"
  - ".docs/done/2026/05/23/align-agent-world-workspace.md"
updated_at: "2026-05-23"
---

# Workspace Root Resolution

The loaded root is now called the workspace root. That is not word polish: the root decides where prompts, runtime config, skills, `.env`, saved chats, agents, queues, and remote locks live.

## Precedence

The preferred selector is `--workspace <path>`. Legacy `--project <path>` still works. Environment fallback is `AGENT_CLI_WORKSPACE`, then legacy `AGENT_CLI_ROOT`, then a root value read from the current directory's `.env`, then `cwd`.

Once resolved, `core/paths.ts` derives `AGENTS.md`, `runtime.json`, `.agent-world/skills`, `.agent-world`, and all world-store paths from the same root.

## Shared Preparation

`core/workspace-environment.ts` is the shared setup path for both CLIs. It configures the root first, then loads allowed `.env` keys from that workspace. Allowed `.env` values are provider credentials and relay configuration only.

The business consequence is simple: switching workspaces switches the whole local world. It should not leave prompts in one root, chats in another, and provider keys from a third.

## Compatibility

`--project`, `AGENT_CLI_ROOT`, `REPO_ROOT`, and `configureProjectRoot(...)` remain as compatibility names. New code should use workspace terminology unless it is preserving an existing public API.
