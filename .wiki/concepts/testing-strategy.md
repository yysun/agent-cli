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
updated_at: "2026-05-16"
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

- `agent-cli.test.js` checks CLI parsing, startup behavior, `.env` loading, and user-facing output.
- `paths.test.js` checks `AGENT_CLI_ROOT` versus `cwd` resolution.
- `agent-config.test.js` checks runtime normalization and precedence rules.
- `agent-files.test.js` checks `AGENTS.md` and skill inventory loading.
- `runtime-client.test.js` checks provider validation and the handoff into `llm-runtime`.
- `session-store.test.js` checks `.agent-world` bootstrap and durable file behavior.
- `relay-server.test.js` and `remote-control.test.js` check the transport and host-side remote protocol.

## End-To-End Coverage

- `tests/e2e/relay-server.e2e.test.js` starts the real relay server bundle.
- `tests/e2e/agent-cli-remote.e2e.test.js` starts the real CLI bundle in `--remote` mode and verifies chat-management commands such as `/chats`, `/messages`, `/new`, and `/use`.
- `tests/e2e/agent-cli.e2e.test.js` is the live-provider path.

The live suite is intentionally separate because it needs real provider credentials such as API keys. That keeps the normal repo checks stable while still preserving a full real-world proof when needed.

## Practical Quality Boundary

The tests are aimed at the files and flows people actually run, not only at tiny helper functions. That matches the repo's current priorities: keep the shipped CLI, the remote browser flow, and the `.agent-world` save format trustworthy as the architecture changes.