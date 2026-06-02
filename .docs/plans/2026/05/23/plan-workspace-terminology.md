# Plan: Workspace Terminology

## Architecture

The CLI should treat workspace as the canonical name for the loaded root. This is a naming migration, not a storage migration.

```mermaid
flowchart TD
  A[CLI args] --> B{--workspace?}
  B -- yes --> C[workspace root]
  B -- no --> D[cwd fallback]
  D --> C
  C --> H[AGENTS.md, runtime.json, .env, .agent-world]
```

## Tasks

- [x] Inspect relevant files
- [x] Make focused changes
- [x] Run validation
- [x] Update docs/status

## Status

- Added canonical `--workspace` support.
- Removed legacy root selector aliases from the current contract.
- Renamed source terminology around workspace roots and workspace `AGENTS.md` prompt loading.
- Updated README, AGENTS.md, tests, and relevant RPD docs.
- Validation passed: `npm run test:syntax`; `npm run test:unit`; `node ./bin/agent-cli.js --workspace /tmp --help`.

## Implementation Notes

- Rename source-level root APIs and variables where they represent Agent CLI workspace state.
- Avoid exported compatibility names for workspace root selectors.
- Prefer `--workspace` in help, docs, tests, and examples.
- Update generated JS through the normal build path.

## E2E Coverage

No new E2E spec is required. This is a CLI naming and compatibility refactor covered by unit tests and syntax/build checks. Existing remote and CLI e2e suites continue to cover the unchanged runtime behavior.

## AR Review

AR passed: no blocking architecture flaws. The key risk is breaking existing users by removing old inputs; the plan accepts that risk to keep `--workspace` as the single explicit root selector.
