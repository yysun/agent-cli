# Workspace Terminology

## Summary

- Changed the canonical loaded-root terminology from project to workspace.
- Added `--workspace <path>` as the preferred CLI selector.
- Removed legacy root selector compatibility from the current contract.
- Updated startup/help text, README, AGENTS.md, unit tests, and relevant RPD docs to use workspace wording.
- Kept storage layout, runtime behavior, remote relay behavior, and chat/agent state unchanged.

## Verification

- `npm run test:syntax`
- `npm run test:unit`
- `node ./bin/agent-cli.js --workspace /tmp --help`
- CR passed after fixing an empty root fallback edge case.

## Notes

- No E2E spec was added because this is a CLI naming/refactor change covered by unit tests and syntax/build checks.
- Remaining project-oriented internal names are unrelated to workspace root selection or are compatibility names outside the current CLI root selector contract.
- Committed separately from unrelated placeholder work so the workspace terminology change remains reviewable on its own.
