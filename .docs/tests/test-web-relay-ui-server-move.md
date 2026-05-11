# E2E Spec: web-relay-ui-server-move

## Scenario 1: Pair from CLI URL and observe events

1. Start relay server: `npm run relay-server`.
2. Start CLI host: `AGENT_CLI_RELAY_SERVER_URL=http://127.0.0.1:8787 npm run agent-cli -- --remote`.
3. Copy printed `Client connection URL`.
4. Start web UI: `npm run web:install` and `npm run web:dev`.
5. Paste URL in the web Pair form and connect.
6. Verify UI shows paired state and event list updates (including `run_status`).

## Scenario 2: Send remote message and receive completion

1. With an active paired session, submit a user message from web UI.
2. Verify relay accepts command and CLI processes the turn.
3. Verify web UI receives `assistant_output` and `completion` events.

## Scenario 3: Approval control path

1. Trigger a tool call requiring approval in remote session.
2. Verify web UI receives `tool_approval_request` with argument summary.
3. Approve from web UI and verify local run continues.
4. Repeat with reject and verify local run is blocked/rejected.

## Scenario 4: Cancel, resume, and disconnect

1. Start a long-running remote turn.
2. Send `cancel` from web UI and verify run status reflects cancellation.
3. When host is waiting for input, send `resume` and verify waiting state is cleared.
4. Send disconnect/revoke from web UI and verify relay session closes.
