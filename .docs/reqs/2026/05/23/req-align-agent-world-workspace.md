# Align Agent World Workspace

## Requirement

`agent-world-cli` must select and prepare the workspace root the same way `agent-cli` does.

## Acceptance Criteria

- `--workspace <path>` and `--workspace=<path>` select the workspace root.
- Legacy `--project <path>` and `--project=<path>` remain valid compatibility aliases.
- When no workspace flag is supplied, `AGENT_CLI_WORKSPACE` wins over `AGENT_CLI_ROOT`, and both win over `cwd`.
- When neither workspace environment variable is set, the current directory's `.env` may provide `AGENT_CLI_WORKSPACE` or `AGENT_CLI_ROOT`.
- After the workspace root is resolved, allowed provider and relay credential keys from that workspace's `.env` are loaded without overwriting non-empty process environment values.
- `agent-world-cli` help must not imply that `--workspace` only applies to the `world` command.

## Non-Goals

- Do not change `.agent-world` storage layout.
- Do not change provider execution behavior beyond loading the same workspace-local environment keys as `agent-cli`.
- Do not add broad E2E coverage for parser behavior that unit tests can validate directly.
