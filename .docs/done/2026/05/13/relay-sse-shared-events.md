# DD: relay-sse-shared-events

- Story slug: `relay-sse-shared-events`
- Completed: `2026-05-13`
- Status: Done
- Related requirement: `./.docs/reqs/2026/05/13/req-relay-sse-shared-events.md`
- Related plan: `./.docs/plans/2026/05/13/plan-relay-sse-shared-events.md`
- Related test spec: `./.docs/tests/test-relay-sse-shared-events.md`

## Outcome

Hardened the relay-backed browser observation path so one hosted remote session can keep multiple paired browsers aligned through shared SSE events while recovering from transient stream interruptions without restarting the local `agent-cli --remote` host.

The shipped behavior now supports:
- concurrent SSE subscribers for one shared remote session
- session-wide fan-out of shared run and chat-state events to all authorized paired browsers
- continued requester-targeted delivery for browser-specific query results and command failures
- heartbeat and retry hints so idle sessions remain viable across browser and intermediary timeouts
- resume from the last confirmed SSE event position using standard `Last-Event-ID` plus existing cursor compatibility
- automatic browser restore after refresh, reopening the remote session URL, foreground resume, and transient disconnect recovery
- reconnect-safe event and notification merging so durable UI state is not silently duplicated during replay

## Delivered

1. Relay SSE liveness and resume contract
- Updated `server/lib/relay-server.js` to emit SSE retry hints, heartbeat comments, and sequence-aware event frames through shared helpers.
- Added support for `Last-Event-ID` on the SSE endpoint while preserving query-based resume compatibility.
- Cleaned up idle or disconnected SSE clients and heartbeat timers during disconnect and stale-client sweep paths.

2. Browser reconnect and restore behavior
- Updated `web/src/App.tsx` to reopen a live session automatically from saved relay state.
- Added restore handling for page refresh, reopening the shared session URL, browser foreground resume, and transient stream interruption.
- Added reconnect-safe backlog replay, event dedupe by sequence, notification merge safety, and transient-versus-terminal connection state handling.
- Fixed the reconnect loop so non-terminal restore failures keep retrying automatically instead of waiting for another browser lifecycle event.

3. Verification coverage
- Extended `tests/unit/relay-server.test.js` with coverage for SSE retry hints, heartbeat delivery, and `Last-Event-ID` resume behavior.
- Extended `tests/e2e/relay-server.e2e.test.js` with end-to-end coverage for resumed SSE streams using `Last-Event-ID`.
- Reused existing remote-control targeting behavior so shared versus requester-scoped event semantics remained intact.

## Requirement Coverage (REQ)

1. Shared event stream for multiple browsers
- Satisfied by keeping one normalized SSE observation path per paired browser while broadcasting shared session events to every authorized client.

2. Messages represented as event types
- Satisfied by continuing to deliver assistant output, completion, failure, approval, snapshot, and chat-state changes as relay event types rather than introducing a separate browser-facing message channel.

3. Automatic reconnect without host restart
- Satisfied by server heartbeat plus retry hints, browser resume from the last confirmed event sequence, and automatic restore behavior for refresh, link reopen, and foreground resume.

4. Shared versus targeted audience separation
- Satisfied by preserving requester-targeted result events for browser-specific actions while keeping session-wide state changes untargeted.

5. Backward compatibility
- Satisfied by leaving browser-to-host commands on the existing POST path and leaving local-only CLI usage unchanged.

## Plan Coverage (AP)

1. Inspect relevant files
- Completed by reviewing the relay server, remote control, browser client, and existing relay tests before implementation.

2. Make focused changes
- Completed by adding SSE heartbeat and resume support on the server and reconnect-safe restore logic in the browser without changing the command transport.

3. Run validation
- Completed by adding focused relay coverage, rerunning browser typecheck, and rerunning the full repository test path after the reconnect-loop fix.

4. Update docs/status
- Completed by marking the plan implemented, keeping README unchanged for this scoped internal hardening, and adding this done doc.

## Verification

Executed on `2026-05-13`:

1. `vitest run tests/unit/relay-server.test.js tests/unit/relay-session.test.js tests/e2e/relay-server.e2e.test.js`
2. `npm --prefix ./web run typecheck`
3. `npm test`

Observed result:
- Focused relay validation: passed.
- Web TypeScript typecheck: passed.
- Full repository test suite: passed.
- Unit coverage in the verified full run: 89 tests passed.
- Relay end-to-end coverage in the verified full run: 5 tests passed.

## Follow-Up Risks

1. The browser reconnect path is validated by targeted relay tests and full repo verification, but there is still no browser-specific automated test that repeatedly injects transient restore failures through the `web/src/App.tsx` reconnect loop.
2. Notification polling still exists alongside the shared SSE stream, so there is some remaining overlap in browser-side state recovery until notifications are fully unified or intentionally retained.
3. Resume guarantees still depend on the relay's retained in-memory event window, so very long offline periods may still require snapshot-style recovery rather than complete event replay.