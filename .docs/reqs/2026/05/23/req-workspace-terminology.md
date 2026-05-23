# Requirement: Workspace Terminology

## Problem

Agent CLI currently describes its `.agent-world` root as a project root. That term is now wrong. A project is the code or content folder an agent may work on; a workspace is the local Agent World operating context that owns `AGENTS.md`, `runtime.json`, `.env`, `.agent-world/world.json`, chats, agents, skills, and remote host state.

Keeping the old wording makes the API and CLI harder to reason about because it blurs the user's workspace state with the target project the agent might inspect or edit.

## Requirements

1. User-facing CLI help, startup diagnostics, README text, and current repository docs must call the loaded Agent CLI root a `workspace`, not a `project`.
2. The preferred CLI flag must be `--workspace <path>`.
3. Existing `--project <path>` invocations must continue to work as a backward-compatible alias.
4. The preferred environment variable must be `AGENT_CLI_WORKSPACE`.
5. Existing `AGENT_CLI_ROOT` usage must continue to work as a backward-compatible fallback.
6. Internal names that represent the loaded Agent CLI root should move from `projectRoot`/`configureProjectRoot` style naming to `workspaceRoot`/`configureWorkspaceRoot` style naming where practical.
7. Prompt-loading terminology should use workspace wording for `AGENTS.md` content where the code is describing the loaded root, while preserving behavior.
8. Remote host lock messages must refer to the workspace root.
9. Runtime behavior, storage paths, chat/session behavior, agent selection, and remote relay behavior must remain unchanged apart from naming.
10. Generated JavaScript outputs may be updated by the build, but source of truth remains TypeScript.

## Acceptance Criteria

1. `agent-cli --workspace <root> --help` resolves and loads the workspace root.
2. `agent-cli --project <root> --help` still resolves and loads the same root.
3. `AGENT_CLI_WORKSPACE=<root> agent-cli --help` works when no flag is provided.
4. `AGENT_CLI_ROOT=<root> agent-cli --help` still works when `AGENT_CLI_WORKSPACE` is not set.
5. Startup/help output uses workspace wording.
6. README and current RPD docs for this story use workspace wording.
7. Existing tests are updated or extended to cover the preferred flag/env plus compatibility aliases.
