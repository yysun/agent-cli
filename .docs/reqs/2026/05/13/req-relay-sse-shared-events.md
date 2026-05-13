# REQ: relay-sse-shared-events

- Story slug: `relay-sse-shared-events`
- Created: `2026-05-13`
- Status: Requested

## Summary

Clarify the browser-facing relay contract so multiple paired browsers can observe one shared remote session through a single SSE event stream, where assistant messages are represented as event types and transient SSE disconnects can recover without requiring the local CLI host to restart.

## Problem

The existing remote relay already supports SSE delivery and multi-client pairing, but the requirement boundary is still ambiguous in two places that directly affect client behavior. First, it is not explicit whether multiple paired browsers should each receive the same shared run events or whether message-like output should travel through a separate browser-facing path. Second, it is not explicit how the browser experience should behave when an SSE connection goes idle long enough for a browser, proxy, or network hop to time out the stream. Without a requirement that defines one shared event model and resilient reconnect semantics, implementations can diverge into per-browser private streams, unnecessary polling, or brittle reconnect behavior that loses or duplicates session state.

## Requirements

1. The browser-facing remote relay contract must expose one normalized event stream for observing a shared hosted session.
2. Assistant output chunks and final assistant messages must be represented as event types on that stream rather than requiring a separate browser-facing message channel.
3. More than one paired browser client connected to the same remote session must be able to hold concurrent SSE subscriptions.
4. Shared session events must be delivered to every currently authorized paired browser connected to that session.
5. Shared session events must include at minimum assistant output, run status, tool approval requests, completion, failure, disconnect, session snapshot, and active-chat state changes.
6. The remote protocol may continue to emit requester-scoped response events for browser-specific actions such as query results or command failures, and those targeted responses must not be broadcast when they are not session-wide state.
7. The remote contract must make the distinction between shared session events and requester-targeted response events explicit enough that browser clients can render collaborative state separately from private command results.
8. One hosted remote session must remain a shared session observed by multiple browsers rather than becoming multiple independent parallel run contexts inside the same local host process.
9. When multiple browsers are connected to the same session, a remote turn started by one browser must produce the same shared run events for every other connected browser that is authorized for that session.
10. A browser that pairs late or reconnects after a transient disconnect must be able to obtain enough backlog or snapshot state to synchronize with the current remote session without requiring the local CLI host to restart.
11. A transient SSE interruption while the remote session is still valid must not require the user to re-create the relay session or restart the CLI host.
12. While the remote session remains valid, the browser-facing SSE subscription must retry automatically after transient transport interruption rather than relying only on a manual reconnect action.
13. While the remote session remains valid, a browser refresh, reopening the remote session from its connection URL, or returning the browser to an active foreground state must automatically restore the live session view without requiring the local CLI host to restart.
14. After a transient SSE interruption or browser lifecycle re-entry, a browser must be able to resume from its last confirmed event position or otherwise restore enough retained state so shared events are not silently lost.
15. Resume behavior for interrupted SSE subscriptions or browser lifecycle re-entry must avoid duplicating already-applied durable session state in the browser UI.
16. The relay and browser experience must tolerate idle periods such as waiting-for-input without treating a valid but quiet session as terminally disconnected.
17. Browser clients must distinguish transient stream interruption from terminal session end states such as explicit revoke, session expiry, or intentional disconnect.
18. The browser-facing observation path must not require separate long polling for shared transcript delivery when SSE is available.
19. Browser-to-host input may continue to use explicit command requests rather than SSE, and this requirement does not require changing the existing command path to WebSockets.
20. Local-only CLI usage and previously supported remote command semantics must continue to work unchanged when remote mode is disabled.

## Non-Goals

1. Replacing browser-to-host command POSTs with WebSockets is not required.
2. Introducing multiple independent private run streams within one hosted remote session is not required.
3. Defining a production push-notification or background wake-up system is not required.
4. Guaranteeing infinite event backlog retention for arbitrarily long offline periods is not required.
5. Redesigning the local chat persistence model is not required.

## Acceptance Criteria

1. Given two paired browsers are connected to the same remote session over SSE, when either browser starts a remote turn, both browsers receive the same shared assistant-output, run-status, completion, or failure events for that turn.
2. Given two paired browsers are connected, when one browser requests a browser-specific operation such as chat-list retrieval, the requester can receive its targeted result without that targeted response being broadcast to the other browser.
3. Given a second browser pairs after a shared session is already in progress, it can obtain enough session state to determine the current active chat and current shared run status without restarting the host.
4. Given a valid remote session enters an idle waiting period with no assistant output, the browser event stream remains usable for later shared events without requiring manual host restart.
5. Given an SSE connection is interrupted transiently while the remote session remains valid, the browser automatically retries the SSE subscription without requiring the user to create a new session.
6. Given the browser is refreshed, reopened through the remote session link, or returned to the foreground while the remote session remains valid, the browser automatically restores the live session view without requiring the host to restart.
7. Given an SSE connection reconnects after a transient interruption or browser lifecycle re-entry, the browser continues from the last confirmed event position or otherwise restores enough retained state without silently missing subsequent shared events.
8. Given an SSE connection reconnects after a transient interruption or browser lifecycle re-entry, the browser does not render already-applied durable session state twice.
9. Given the remote session has been revoked, expired, or intentionally disconnected, the browser can distinguish that terminal state from a transient transport interruption.
10. Given remote mode is disabled, local CLI behavior remains unchanged.

## Open Questions

1. The requirement assumes message-like output is fully modeled as event types, but it does not yet decide whether the separate browser notification polling path should be eliminated entirely in favor of deriving notifications from the event stream.
2. The requirement asks for reconnect safety, but the maximum acceptable backlog window for reconnect after a long offline period still needs to be defined.
3. The requirement keeps one shared run context per hosted session, but it does not yet define whether future per-client attribution in the shared event stream should be purely informational or should later affect permissions or UI controls.