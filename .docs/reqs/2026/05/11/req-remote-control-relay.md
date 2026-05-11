# REQ: remote-control-relay

- Story slug: `remote-control-relay`
- Created: `2026-05-11`
- Status: Implemented

## Summary

Add optional remote supervision support to Agent CLI through a short-lived relay server so a mobile PWA can observe and guide one active local chat session without moving execution, tools, files, secrets, memory, or permissions off the local machine.

## Problem

The current CLI is local-only. A user cannot safely supervise an active local Agent CLI session from a mobile device, approve actions remotely, or provide follow-up input without direct access to the terminal running on the local machine. The requested behavior is local-first remote control where the cloud relay coordinates pairing and message flow, but the local machine remains the only place where the agent runs and where tools, files, tokens, memory, and permission decisions are ultimately enforced.

## Requirements

1. Agent CLI must support optional remote supervision through a `--remote` command-line switch.
2. When `--remote` is used, Agent CLI must read the relay server URL from `AGENT_CLI_RELAY_SERVER_URL` loaded from `.env` or the environment.
3. `AGENT_CLI_RELAY_SERVER_URL` must be the documented, dedicated Agent CLI setting for relay connectivity rather than a positional argument.
4. Local-only CLI usage must continue to work when `--remote` is not used.
5. Agent execution must remain on the local machine.
6. Tool execution must remain on the local machine.
7. Workspace files, local environment files, API tokens, and long-term memory must not be uploaded to or stored by the relay server.
8. Remote session access must be scoped to one active local session rather than the entire workspace.
9. The relay server must act only as a coordination layer for session discovery, pairing, routing, expiry, and notification-oriented event handling.
10. The relay server must issue separate credentials for the desktop host session, the mobile session, and the one-time pairing flow.
11. Pairing must use a short-lived one-time token suitable for QR-code-based pairing.
12. The relay server must treat pairing tokens as expiring and one-time-use credentials.
13. Agent CLI must register the active local session with the relay server when remote supervision is enabled.
14. Agent CLI must print the client connection URL returned for the active remote session so supervising clients can connect.
15. Agent CLI must post normalized remote events to the relay server.
16. Agent CLI must receive remote commands from the relay server through blocking long polling for the MVP.
17. The mobile PWA must receive live session events from the relay server through server-sent events.
18. The mobile PWA must send remote commands to the relay server over HTTPS.
19. The relay server must keep short-lived event and command queues sufficient to deliver active-session state to the connected mobile client and local host.
20. The normalized remote event stream must include assistant output, run status, tool approval requests, completion, failure, and disconnect events.
21. The normalized remote command stream must include user messages, approval decisions, cancel, resume, and disconnect commands.
22. Approval decisions received from the mobile client must be routed back to the local permission gate before local tool execution proceeds.
23. Tool execution must never occur on the relay server or on the mobile client.
24. The relay server must support idempotency keys so duplicate events, commands, user messages, and approval decisions do not create duplicated side effects.
25. Session revoke and session expiry must be first-class safety controls.
26. The relay server must support expiry of sessions, pairing credentials, and short-lived coordination state.
27. Notification handling for the MVP must focus on approval required, run completed, run failed, and human input needed states.
28. The relay server must avoid storing local workspace contents or full chat/workspace replication beyond the short-lived coordination data needed to route the active session.
29. WebSocket transport is not required for the MVP.
30. If future high-frequency or terminal-like remote interaction is needed, WebSocket may be considered later as an optimization, but it is not required to satisfy this requirement.

## Non-Goals

1. Replacing the desktop workspace with a full mobile editing experience is not required.
2. Executing tools on the relay server is not required.
3. Persisting long-term remote chat history in the relay is not required.
4. Shipping a production push notification service is not required as long as the relay exposes the notification-relevant states needed by the supervising client.
5. Reworking the existing local chat persistence model for non-remote usage is not required.

## Acceptance Criteria

1. Given `--remote` is not used, the CLI continues to run locally with the existing behavior.
2. Given `--remote` is used and `AGENT_CLI_RELAY_SERVER_URL` is present in `.env`, the CLI connects to the relay and registers one active local session.
3. Given `--remote` is used and the relay connection succeeds, the CLI prints the client connection URL for the active remote session.
4. Given a valid short-lived pairing token, a mobile client can pair and receive a mobile-scoped credential without receiving desktop credentials.
5. Given an active paired session, assistant output and run status updates are delivered from the local CLI to the mobile client through the relay event stream.
6. Given an active paired session, the local CLI can receive a remote user message through relay long polling and process it against the active local session.
7. Given the local permission gate requests approval, the mobile client can send an approval decision through the relay and that decision reaches the local host before tool execution continues.
8. Given a cancel or disconnect command from the mobile client, the local host receives it through the relay command path and the active session reflects the resulting state.
9. Given duplicated delivery attempts with the same idempotency key, the relay does not create duplicated commands, events, user messages, or approval decisions.
10. Given session expiry or revoke, the relay stops treating the remote session as valid and the local/mobile clients receive a disconnect or equivalent terminal state.
11. Given relay operation, the relay stores only short-lived coordination data and does not store local files, `.env` contents, API keys, long-term memory, or full workspace data.

## Open Questions

1. The requirement defines QR-code-based pairing behavior, but the final responsibility split between the desktop CLI, relay server, and mobile PWA for rendering the QR artifact still needs to be chosen.
2. The requirement calls out notification-oriented states, but the MVP delivery path for those notifications may remain limited to relay-exposed signals until a dedicated push channel is planned.