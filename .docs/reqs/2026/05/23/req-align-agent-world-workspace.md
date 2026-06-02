# Align Agent World Workspace

## Requirement

`agent-world-cli` must select and prepare the workspace root the same way `agent-cli` does.

## Acceptance Criteria

- `--workspace <path>` and `--workspace=<path>` select the workspace root.
- When no workspace flag is supplied, `cwd` selects the workspace root.
- Workspace `.env` provides runtime defaults and credentials only; it does not select the workspace root.
- After the workspace root is resolved, allowed provider and relay credential keys from that workspace's `.env` are loaded without overwriting non-empty process environment values.
- `agent-world-cli` help must not imply that `--workspace` only applies to the `world` command.

## Non-Goals

- Do not change `.agent-world` storage layout.
- Do not change provider execution behavior beyond loading the same workspace-local environment keys as `agent-cli`.
- Do not add broad E2E coverage for parser behavior that unit tests can validate directly.
