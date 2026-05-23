# Workspace Terminology

## Summary

- Changed the canonical loaded-root terminology from project to workspace.
- Added `--workspace <path>` and `AGENT_CLI_WORKSPACE` as the preferred CLI/env selectors.
- Kept `--project <path>` and `AGENT_CLI_ROOT` working as compatibility aliases.
- Updated startup/help text, README, AGENTS.md, unit tests, and relevant RPD docs to use workspace wording.
- Kept storage layout, runtime behavior, remote relay behavior, and chat/agent state unchanged.

## Verification

- `npm run test:syntax`
- `npm run test:unit`
- `node ./bin/agent-cli.js --workspace /tmp --help`
- `node ./bin/agent-cli.js --project /tmp --help`
- CR passed after fixing an empty-`AGENT_CLI_WORKSPACE` fallback edge case.

## Notes

- No E2E spec was added because this is a CLI naming/refactor change covered by unit tests and syntax/build checks.
- `projectRoot`, `REPO_ROOT`, `configureProjectRoot`, `loadProjectSystemPrompt`, and `projectSystemPrompt` remain only as compatibility aliases or accepted legacy options where removal would create avoidable breakage.
- Committed separately from unrelated placeholder work so the workspace terminology change remains reviewable on its own.
