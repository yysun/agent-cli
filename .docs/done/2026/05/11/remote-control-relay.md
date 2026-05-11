# DD: remote-control-relay

- Story slug: `remote-control-relay`
- Completed: `2026-05-11`
- Status: Done
- Related requirement: `./.docs/reqs/2026/05/11/req-remote-control-relay.md`
- Related plan: `./.docs/plans/2026/05/11/plan-remote-control-relay.md`
- Related test spec: `./.docs/tests/test-remote-control-relay.md`

## Outcome

Added optional relay-backed remote supervision for one active local Agent CLI chat while keeping execution, tools, workspace access, environment secrets, and memory on the local machine.

The shipped behavior now supports:
- `agent-cli --remote` host mode
- relay URL loading from `AGENT_CLI_RELAY_SERVER_URL`
- client connection URL output for pairing
- relay-backed command polling and event publication
- remote approval routing through the existing local permission gate
- local persistence of active remote-session metadata under the chat directory

## Delivered

1. Relay server and client surface
- Added `lib/relay-server.js` with short-lived in-memory session state, pairing, command polling, event backlog/SSE delivery, notification summaries, revoke, and expiry handling.
- Added `bin/relay-server.js` and package scripts/bin entries for local relay startup.
- Added `lib/relay-client.js` helpers for session creation, pairing, event writes, command polling, notification reads, and revoke calls.

2. CLI remote host mode
- Updated `bin/agent-cli.js` to support `--remote` instead of a relay URL flag.
- Added relay URL loading through `AGENT_CLI_RELAY_SERVER_URL` with clear startup failure when missing.
- Refactored the shared turn execution path so local and remote turns use the same runtime flow.
- Persisted the active chat shell before remote hosting begins and persisted `remote.json` as soon as the relay session is created.

3. Remote host coordination
- Added `lib/remote-control.js` to register the remote session, print the client connection URL, wait for remote commands, route approvals, and publish normalized remote events.
- Added redacted remote-safe summaries for approval requests and failures.
- Ensured remote disconnect and normal host shutdown revoke the relay session server-side.

4. Runtime and session-store integration
- Updated `lib/runtime-client.js` to thread `abortSignal` into the runtime and to honor an approval gate before tool execution when permission mode is `ask`.
- Updated `lib/session-store.js` to persist optional remote-session metadata under `./.chats/<chatId>/remote.json`.

5. Documentation and configuration
- Updated `README.md` with `--remote` usage, relay env configuration, remote safety boundaries, and relay startup guidance.
- Updated `.env.example` with `AGENT_CLI_RELAY_SERVER_URL`.
- Marked the REQ, AP, and AT docs as implemented.

6. Regression coverage
- Updated CLI, runtime-client, and session-store unit coverage for remote startup, remote metadata persistence, and approval gating.
- Added relay-server and remote-control unit suites for pairing, idempotency, backlog/notifications, redaction, and disconnect revoke behavior.
- Fixed review findings discovered during CR: one-time pairing enforcement, relay revoke on remote disconnect, and immediate remote metadata persistence.

## Requirement Coverage (REQ)

1. Remote host activation and config source
- REQ 1-4 satisfied by `--remote` host mode and `AGENT_CLI_RELAY_SERVER_URL`-based relay configuration while preserving local-only behavior.

2. Local-first execution boundary
- REQ 5-8, 23, and 28 satisfied by keeping runtime execution, tools, files, secrets, and memory local while scoping relay access to one active chat.

3. Relay lifecycle and transport
- REQ 9-21, 24-27, and 29-30 satisfied by the relay session model, pairing flow, long-poll command delivery, SSE/event backlog delivery, notification summaries, idempotency handling, revoke, and expiry behavior.

4. Approval routing and safety
- REQ 22 satisfied by routing approval decisions back through the local permission boundary before tool execution proceeds.

## Plan Coverage (AP)

1. Phase 1: Define relay boundaries and wiring
- Completed by adding the relay client/server modules, CLI/env contract, and package wiring.

2. Phase 2: Implement relay session state and transport
- Completed by shipping in-memory session state, pairing, queues, notifications, SSE/backlog delivery, idempotency, revoke, and expiry logic.

3. Phase 3: Add desktop-host remote mode
- Completed by adding `--remote`, relay registration, client connection URL output, command polling, and local remote-session persistence.

4. Phase 4: Integrate local approvals and cancellation
- Completed by threading abort signals, approval gating, cancel handling, resume handling for host-managed waiting states, and server-side revoke on disconnect.

5. Phase 5: Expand tests and documentation
- Completed by adding focused relay/remote unit tests and updating README plus workflow docs.

## Verification

Executed on `2026-05-11`:

1. `npm run test:syntax`
2. `npm run test:unit`

Observed result:
- Syntax checks: passed.
- Unit suite: passed.
- Total unit coverage after CR fixes: 67 tests passed.