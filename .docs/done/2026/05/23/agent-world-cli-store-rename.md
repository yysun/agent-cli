# Done: Agent World CLI And Store Rename

## Summary

- Renamed `core/session-store` to `core/world-store` and updated runtime, CLI, tests, generated files, and syntax checks to use the canonical world-store module.
- Implemented the published `agent-world-cli` binary with JSON-first commands for world, agents, chats, messages, sends, and queue controls.
- Made runtime queue `add` enqueue-only so `agent-world-cli send --queue` can persist durable queue rows without triggering provider calls.
- Added unit coverage for the CLI dispatcher and renamed store tests.
- Added a real-binary E2E for `agent-world-cli`, modeled after `../agent-world` Electron E2E style: built entrypoint, isolated workspace, durable state assertions, and queue lifecycle checks.
- Added `agent-world-cli` interactive mode for no-arg and `interactive` launches, with slash commands sharing the one-shot dispatcher and scripted stdin support.

## Verification

- `npx vitest run tests/unit/agent-world-cli.test.js tests/unit/world-store.test.js tests/unit/agent-world-runtime.test.js`
- `npx vitest run tests/e2e/agent-world-cli.e2e.test.js`
- `npm test`
- `git diff --check`
- CR: no blocking code issues remained after fixing CLI startup auto-resume behavior and the piped-stdin readline path.
- VR: requirement, plan, E2E spec, implementation, and tests all align.

## Notes

- `agent-world-cli` remains local-only; interactive mode is terminal/stdin based, not remote relay mode.
- Direct `agent-world-cli send` still uses the real runtime and can require provider credentials; `send --queue` is the provider-free path.
- The store was not split into smaller modules; this story only renamed the ownership boundary.
