# E2E Spec: Agent World Runtime Boundary

## Scenario: Provider-Free CLI Behavior Still Works

1. Build `agent-world-cli`.
2. Run the provider-free real-binary E2E suite.
3. Confirm help, world snapshot, agent/chat lifecycle, queued send, queue stop, queue clear, and scripted interactive behavior still pass.

## Scenario: Monitored Interactive Behavior Still Works

1. Spawn the built `agent-world-cli` process.
2. Send commands through stdin one at a time.
3. Wait for stdout transitions after each command.
4. Confirm queue state is durable and cleared at the end.

## Scenario: Live HITL Flow Still Belongs To CLI UI

1. Run the live flow-matrix E2E with provider credentials.
2. Trigger `ask_user_input` from a live model turn.
3. Confirm the shell prints the prompt and answers through stdin.
4. Confirm `core/agent-world-runtime` did not import or decide `ask_user_input` handling.

## Execution Status

- Passed on 2026-05-23:
- `npm run test:unit` - 11 files / 123 tests.
- `npm run test:syntax`
- `npm run test:e2e:relay` - 4 files / 10 tests.
- `npx vitest run tests/e2e/agent-world-cli-flow-matrix.e2e.test.js` - 1 file / 3 tests.
- `git diff --check`
- Boundary scans confirmed `human-input-ui` remains CLI-only and no source/test import points at `cli/src/agent-world-runtime`.
