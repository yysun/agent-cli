# AT: remote-control-relay

- Story slug: `remote-control-relay`
- Created: `2026-05-11`
- Status: Implemented
- Related requirement: `./.docs/reqs/2026/05/11/req-remote-control-relay.md`
- Related plan: `./.docs/plans/2026/05/11/plan-remote-control-relay.md`

## Scope

Validate that Agent CLI can host one active local session through an optional relay server while keeping execution local and exposing only the short-lived coordination state required for remote supervision.

## Scenarios

1. Local-only fallback remains unchanged
- Given the CLI is run without `--remote`
- When a user starts a new chat or sends a follow-up message
- Then the CLI uses the existing local-only chat path
- And no relay session is created

2. Desktop host registers a remote session
- Given the CLI is started with `--remote`
- When the host registers with the relay
- Then the CLI reads the relay server URL from `AGENT_CLI_RELAY_SERVER_URL`
- And the relay returns a relay session ID, desktop token, short-lived pairing token, client connection URL payload, and expiry metadata
- And the client connection URL is the canonical payload for QR-based mobile pairing
- And the CLI prints the client connection URL for the mobile pairing flow

3. Initial message runs before the host wait loop
- Given the CLI is started with `--remote` and a positional message
- When the remote host session starts
- Then the positional message is processed as the first local turn for the active chat
- And after that turn completes the host continues waiting for remote commands on the same chat

4. Missing relay environment configuration fails clearly
- Given the CLI is started with `--remote`
- And `AGENT_CLI_RELAY_SERVER_URL` is not present in `.env` or the environment
- When remote host startup begins
- Then the CLI exits with a clear configuration error
- And it does not start a remote session

5. Mobile pairing returns only mobile-scoped access
- Given a valid short-lived pairing token for the active relay session
- When the mobile client completes pairing
- Then the relay returns a mobile-scoped token
- And the mobile client does not receive the desktop token
- And an expired or reused pairing token is rejected

6. Assistant output and status stream to mobile through SSE
- Given a paired remote session is active
- When the local CLI runs a turn
- Then normalized `assistant_output` and `run_status` events are published to the relay
- And the mobile client receives them through the SSE event stream

7. Remote user message reaches the active local session
- Given a paired remote session is active
- When the mobile client sends a `user_message` command through HTTPS
- Then the relay stores it in the short-lived command queue
- And the desktop host receives it through blocking long polling
- And the local CLI processes it against the active local session only

8. Remote approval decision gates local tool execution
- Given the local permission policy requires approval for a tool call
- When the local CLI emits a `tool_approval_request` event
- And the mobile client sends an `approval_decision` command
- Then the local host receives the decision before local tool execution continues
- And a deny decision prevents the local tool execution from proceeding

9. Remote approval and failure payloads are redacted
- Given a local tool call or failure contains local-sensitive fields
- When the local host publishes a `tool_approval_request` or `failure` event
- Then the remote payload contains only the explicit safe summary fields for remote display
- And it does not include raw workspace paths, raw file contents, environment-variable values, stack traces, or provider response dumps

10. Cancel propagates through the host abort path
- Given a local run is active in a paired remote session
- When the mobile client sends a `cancel` command
- Then the desktop host receives the command through long polling
- And the active local run is aborted
- And the remote event stream reflects a cancelled or equivalent terminal state

11. Resume only affects host-managed waiting states
- Given the remote host is in a known waiting state such as `waiting_for_input`
- When the mobile client sends a `resume` command
- Then the host clears that waiting state if it is still current
- And a `resume` command does not restart an already aborted or already completed turn

12. Disconnect, revoke, and expiry terminate remote access safely
- Given a paired remote session is active
- When the mobile client sends `disconnect`, or the desktop host revokes the session, or the session expires
- Then the relay stops accepting further commands/events for that remote session
- And the desktop and mobile clients receive a disconnect or equivalent terminal state

13. Idempotency prevents duplicated side effects
- Given a command, event, approval decision, or user message is retried with the same idempotency key
- When the relay receives the duplicate submission
- Then it returns the prior accepted result or equivalent duplicate response
- And the desktop host does not apply the logical action twice

14. Relay payloads exclude local-sensitive data
- Given a remote session is active
- When the desktop host publishes events and metadata
- Then the relay stores only short-lived coordination data for the active session
- And relay payloads do not include local files, `.env` contents, API keys, long-term memory, or full workspace data

## Expected Verification During SS

1. Unit tests for relay state and transport helpers.
2. Unit tests for remote-host orchestration and approval routing.
3. CLI unit tests for `--remote`, `AGENT_CLI_RELAY_SERVER_URL` loading, printed client connection URL behavior, and local-only fallback.
4. Optional manual end-to-end exercise of one remote-host session against a running relay instance once the mobile counterpart exists.

## Verification Run

Verified during SS with:

1. `npm run test:syntax`
2. `npm run test:unit`

Coverage now includes relay session lifecycle, event backlog and notification reads, `--remote` CLI startup, relay env loading, remote metadata persistence, approval redaction, failure redaction, and runtime approval gating.