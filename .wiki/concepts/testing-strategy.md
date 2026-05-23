---
title: "Testing Strategy"
type: "concept"
status: "active"
language: "default"
source_paths:
  - "package.json"
  - "tests/unit/agent-cli.test.js"
  - "tests/unit/agent-config.test.js"
  - "tests/unit/agent-files.test.js"
  - "tests/unit/paths.test.js"
  - "tests/unit/runtime-client.test.js"
  - "tests/unit/session-store.test.js"
  - "tests/unit/relay-server.test.js"
  - "tests/unit/remote-control.test.js"
  - "tests/e2e/agent-cli-remote.e2e.test.js"
  - "tests/e2e/relay-server.e2e.test.js"
  - "tests/e2e/agent-cli.e2e.test.js"
  - ".docs/tests/test-agent-id-config.md"
  - ".docs/tests/test-auto-interactive-mode.md"
  - ".docs/tests/test-cli-input-ui.md"
updated_at: "2026-05-23"
---

# Testing Strategy

The repo checks quality in layers. First it makes sure the shipped files are valid JavaScript, then it checks important modules in isolation, then it runs the real relay flow, and only after that does it offer a live model test when someone explicitly wants it.

## Default Validation Path

`npm test` runs four checks:

1. `npm run test:syntax` to rebuild and `node --check` the shipped runtime files.
2. `npm run test:unit` for the core CLI, runtime, storage, relay, and remote-control modules.
3. `npm run test:e2e:relay` for the real bundled relay and `agent-cli --remote` flow.
4. `npm run web:typecheck` for the React app.

That means the default repo validation already covers the long-running remote host behavior without depending on a real model provider.

## Unit Test Focus

- `agent-cli.test.js` checks CLI parsing, startup behavior, `.env` loading, no-message interactive mode, named-agent prompt wiring, TTY pending display, local input collection, and user-facing output.
- `agent-cli.test.js` also checks that streaming diagnostics stay off stderr unless `--verbose` is enabled, then render structured tool-call and tool-result rows through [[cli-src-tool-trace-renderer-ts]].
- `paths.test.js` checks `AGENT_CLI_ROOT` versus `cwd` resolution.
- `agent-config.test.js` checks runtime normalization and precedence rules, including provider/model fallback from selected-agent metadata.
- `agent-files.test.js` checks `AGENTS.md`, skill inventory loading, and the stronger built-in prompt guidance covered in [[lib-agent-files-js]].
- `runtime-client.test.js` checks provider validation, the `llm-runtime` 0.5 completion-loop handoff, approval rejection behavior, runtime-backed tool-executor fallback, CLI-owned tool handler persistence, and tool-result callbacks.
- `session-store.test.js` checks `.agent-world` bootstrap, durable file behavior, and named-agent initialization.
- `relay-server.test.js` and `remote-control.test.js` check the transport and host-side remote protocol.

## End-To-End Coverage

- `tests/e2e/relay-server.e2e.test.js` starts the real relay server bundle.
- `tests/e2e/agent-cli-remote.e2e.test.js` starts the real CLI bundle in `--remote` mode and verifies chat-management commands such as `/chats`, `/messages`, `/new`, and `/use`.
- `tests/e2e/agent-cli.e2e.test.js` is the live-provider path.

The live suite is intentionally separate because it needs real provider credentials such as API keys. That keeps the normal repo checks stable while still preserving a full real-world proof when needed.

## Practical Quality Boundary

The tests are aimed at the files and flows people actually run, not only at tiny helper functions. That matches the repo's current priorities: keep the shipped CLI, the remote browser flow, and the `.agent-world` save format trustworthy as the architecture changes.
