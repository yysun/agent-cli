# AP: web-relay-ui-server-move

- Story slug: `web-relay-ui-server-move`
- Created: `2026-05-11`
- Status: Implemented
- Related requirement: `./.docs/reqs/2026/05/11/req-web-relay-ui-server-move.md`
- Related test spec: `./.docs/tests/test-web-relay-ui-server-move.md`

## Goal

Ship a browser-based remote supervision UI while preserving local-first `agent-cli --remote` execution, and normalize relay server placement under `server/`.

## Phases

- [x] Phase 1: Move relay server files and update references.
  - Move relay entrypoint to `server/bin/relay-server.js`.
  - Move relay implementation to `server/lib/relay-server.js`.
  - Update package `bin`, scripts, syntax checks, and test imports.

- [x] Phase 2: Add web app scaffold and relay client integration.
  - Create React + Vite app in `web/`.
  - Add relay API helpers for pairing, command send, notifications, revoke, and event stream.
  - Implement a single-page command deck for pairing and runtime control.

- [x] Phase 3: Make relay browser-friendly.
  - Add CORS headers to JSON endpoints.
  - Add OPTIONS preflight handling.
  - Add CORS allowance on SSE event responses.

- [x] Phase 4: Documentation and verification.
  - Update README with relay + web startup flow.
  - Run syntax and unit verification to ensure no regressions.

## E2E Decision

E2E spec is required because this change introduces a user-facing cross-system flow (CLI `--remote` + relay + web UI).

## Architecture Notes

1. Web UI uses relay APIs directly and never accesses local files, tokens, or runtime internals.
2. Pairing starts from the CLI-provided client connection URL, preserving one-time token semantics.
3. Event streaming uses relay SSE endpoint; command and notifications use JSON endpoints.
4. Browser support requires CORS and preflight responses from relay endpoints.
