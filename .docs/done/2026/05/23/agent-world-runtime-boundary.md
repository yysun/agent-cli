# Done: Agent World Runtime Boundary

Moved the Agent World runtime into `core` and kept HITL UI in the shell layer.

## Changes

- Added `core/agent-world-runtime.ts` and generated `core/agent-world-runtime.js`.
- Removed `cli/src/agent-world-runtime.ts` as the runtime source location.
- Updated `agent-world-cli` to import the runtime from `../../core/agent-world-runtime.js`.
- Kept `human-input-ui` in `cli/src`; `core/agent-world-runtime.ts` uses only a generic tool-call handler hook.
- Updated world runtime unit tests and syntax checks for the new core module.
- Restored the real `agent-cli.ts` entrypoint guard so `bin/agent-cli.js` keeps running when built directly from the renamed source file.

## Validation

- `npm run test:unit` - passed, 11 files / 123 tests.
- `npm run test:syntax` - passed.
- `npm run test:e2e:relay` - passed, 4 files / 10 tests.
- `npx vitest run tests/e2e/agent-world-cli-flow-matrix.e2e.test.js` - passed, 1 file / 3 tests.
- `git diff --check` - passed.
- Boundary scan: no `human-input-ui` import in `core`; no source/test import of `cli/src/agent-world-runtime`.
