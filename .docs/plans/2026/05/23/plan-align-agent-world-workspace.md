# Align Agent World Workspace Plan

## Tasks

- [x] Inspect relevant files
- [x] Make focused changes
- [x] Run validation
- [x] Update docs/status

## Validation

- `npx vitest run tests/unit/agent-world-cli.test.js`
- `npm run build`
- `npm run test:unit`
- `npm run test:syntax`

## Completion Review

VR passed: `agent-world-cli` now shares workspace preparation with `agent-cli`, accepts canonical and legacy workspace flag forms, honors cwd `.env` workspace fallback, loads workspace-local allowed `.env` keys, and has focused unit coverage for the new behavior.

## Architecture

Move the shared workspace preparation behavior out of the `agent-cli` shell and into core so both published CLIs use the same root-selection and `.env` loading semantics. Keep `agent-world-cli` argument parsing local, but make it accept the same workspace flag shapes and aliases before constructing the runtime.

## Implementation Notes

- Add a core helper for workspace preparation and allowed `.env` key loading.
- Replace `agent-cli`'s private helper with the core helper to avoid divergent behavior.
- Update `agent-world-cli` to parse `--workspace=value`, `--project`, and `--project=value`.
- Add focused unit tests proving `agent-world-cli` stores state under the selected workspace and loads workspace `.env` credentials.
- No E2E spec: this is a deterministic CLI parser/root-resolution contract.

## Architecture Review

AR passed: no blocking architecture flaws. The shared helper reduces drift without changing storage APIs, and focused unit tests cover the regression surface.
