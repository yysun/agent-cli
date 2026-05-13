# AT: relay-sse-shared-events

- Story slug: `relay-sse-shared-events`
- Created: `2026-05-13`
- Related requirement: `./.docs/reqs/2026/05/13/req-relay-sse-shared-events.md`
- Related plan: `./.docs/plans/2026/05/13/plan-relay-sse-shared-events.md`

## Scope

Validate that one remote relay session can broadcast shared run events to multiple paired browsers over SSE and that a browser can recover from transient SSE interruption without restarting the local CLI host.

## Scenarios

1. Two paired browsers receive the same shared run events
- Given one local `agent-cli --remote` host and two paired browsers
- When either browser sends a remote prompt
- Then the host executes exactly one run
- And both browsers receive the same `assistant_output`, `run_status`, and `completion` or `failure` events for that run

2. Browser-specific query results remain targeted
- Given two paired browsers are connected to the same session
- When one browser requests chat-list data or chat-message data
- Then the requesting browser receives the corresponding response event
- And the other browser does not render that targeted response as a shared transcript change

3. Late-joining browser can catch up from current session state
- Given one browser is already connected and the shared session has an active chat and prior run events
- When a second browser pairs later
- Then it can obtain enough backlog or snapshot data to determine the current active chat and current shared state
- And the host does not need to restart

4. Idle SSE stream survives waiting-for-input periods
- Given a paired browser is connected and the host is idle in a waiting-for-input state
- When no new assistant output is emitted for longer than a typical intermediary idle timeout window
- Then the stream remains viable for later delivery
- And the browser does not require the user to create a new relay session

5. Browser reconnect resumes after transient interruption
- Given a paired browser has already applied shared events through event sequence N
- When the SSE connection drops transiently and the relay session remains valid
- Then the browser retries the SSE subscription automatically while the session remains valid
- And it reconnects using its last confirmed event position
- And it receives retained events after N
- And later shared events continue without host restart

6. Refresh, URL reopen, or foreground resume restores the session automatically
- Given a browser previously paired to a still-valid remote session
- When the page is refreshed, the session link is opened again, or the browser returns to the foreground
- Then the browser restores the live session automatically
- And it resumes the shared event view without requiring the CLI host to restart

7. Reconnect replay does not duplicate durable UI state
- Given a browser reconnects or restores after refresh and the relay replays retained events that overlap the browser's current local state
- When the browser reapplies the incoming events
- Then the visible transcript and session state do not duplicate already-applied durable entries

8. Terminal session end is distinct from transient stream loss
- Given a paired browser is connected
- When the session is revoked, expired, or intentionally disconnected
- Then the browser surfaces a terminal session-ended state
- And it does not treat that state as a transient retry-only interruption

9. Transient reconnect does not present as terminal failure
- Given a paired browser experiences a temporary SSE transport interruption while the session remains valid
- When native EventSource retry is still in progress
- Then the browser may show a transient reconnecting state
- And it does not present the session as permanently failed or disconnected

10. Local-only mode remains unchanged
- Given the CLI runs without `--remote`
- When local chat usage continues normally
- Then no SSE-specific remote relay behavior is required

## Expected Verification During SS

1. Relay unit coverage for shared fan-out, targeted filtering, heartbeat behavior, and reconnect cursor handling.
2. Browser/client coverage for dedupe and reconnect state handling where practical.
3. End-to-end relay coverage for two-browser shared observation and reconnect-after-interruption behavior.
4. Manual browser exercise with two paired sessions if automated interruption coverage is incomplete.