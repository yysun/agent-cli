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
  - "tests/unit/agent-runtime.test.js"
  - "tests/unit/chat-store.test.js"
  - "tests/e2e/agent-cli.e2e.test.js"
updated_at: "2026-05-26"
---

# Testing Strategy

The repo checks the kept product surfaces: CLI, core runtime/config/storage, skill loading, workspace paths, and the local live-provider E2E path.

## Default Validation Path

`npm test` runs:

1. `npm run check`
2. `npm run test:unit`
3. `npm run test:e2e`

`npm run check` itself rebuilds the CLI bundle and syntax-checks the shipped CLI plus selected test/config files.

## Unit Test Focus

- `agent-cli.test.js` checks argument parsing, `.env` loading, workspace selection, startup diagnostics, interactive mode, and output behavior.
- `agent-config.test.js` checks runtime normalization and environment-backed defaults.
- `agent-files.test.js` checks `AGENTS.md`, workspace skills, opt-in global skills, and skill inventory messages.
- `paths.test.js` checks workspace root and path constants.
- `chat-store.test.js` checks `.agent-world/chats` persistence, current chat selection, stream trace files, and the rule that `.agent-world` is created under the resolved workspace.
- `agent-runtime.test.js` checks provider validation, `llm-runtime` handoff, tool-call handling, and cleanup.

## E2E Coverage

`tests/e2e/agent-cli.e2e.test.js` is the live-provider path. It needs usable provider credentials, so failures can be environmental rather than code regressions.

## Removed Coverage

Relay, web, `agent-world-cli`, world runtime, and remote-host tests were deleted with those surfaces. Stale wiki pages describe the old behavior but should not be used as current test guidance.
