# AP: pure-relay-slash-commands

- Story slug: `pure-relay-slash-commands`
- Created: `2026-05-13`
- [x] Implemented
- Related requirement: `./.docs/reqs/2026/05/13/req-pure-relay-slash-commands.md`

## Goal

Simplify the remote-control protocol so the relay carries generic text commands and shared session events, while the local `agent-cli --remote` host interprets slash commands for chat-management operations and returns requester-only operation results to the client that issued them.

## Assumptions

1. The relay server should remain transport-oriented and should not need dedicated application-level chat command names to support the browser UI.
2. Shared run-state events such as assistant output, run status, approvals, completion, failure, disconnect, and session snapshots remain valid broadcast concepts.
3. Requester-scoped operation results such as chat listings and chat history should remain private to the originating client.
4. The current browser UI can keep its chat sidebar, as long as it invokes slash commands through the generic input path rather than dedicated relay command types.
5. The local session store remains the only authority for chat creation, chat selection, current pointer updates, and persisted message reads.

## Proposed Structure

1. Refactor [lib/remote-control.js](lib/remote-control.js):
   - Replace chat-specific remote command handling with a generic text-input command path.
   - Parse slash commands locally on the host.
   - Emit one targeted command-result event shape for slash-command outcomes.
   - Keep shared run events broadcast for normal turns.
2. Keep [server/lib/relay-server.js](server/lib/relay-server.js) transport-generic:
   - Continue storing generic commands and events.
   - Remove host-side reliance on chat-specific event names for active state updates where possible.
   - Preserve targeted event delivery by `targetClientId`.
3. Update [web/src/App.tsx](web/src/App.tsx) and [web/src/relay-api.ts](web/src/relay-api.ts):
   - Send generic text commands for both normal turns and slash-command operations.
   - Translate sidebar actions into slash commands.
   - Consume the new targeted command-result payloads and keep shared transcript rendering unchanged.
4. Update documentation and tests:
   - Replace chat-specific protocol expectations in relay, remote-control, and remote-host tests.
   - Document the supported slash commands and requester-only result behavior.

## Slash Command Scope

Initial host-side slash commands should cover:

1. `/help`
2. `/chats`
3. `/messages <chatId>`
4. `/new`
5. `/use <chatId>`

These names can be adjusted during implementation if the final naming proves awkward, but the feature surface should stay equivalent.

## Event Shape

1. Shared events remain broadcast as needed:
   - `assistant_output`
   - `completion`
   - `run_status`
   - `tool_approval_request`
   - `failure`
   - `disconnect`
   - `session_snapshot`
2. Requester-only operation responses should be targeted:
   - `command_result`
   - `command_error`
3. `command_result` should carry enough structure for the browser to distinguish:
   - plain informational text
   - chat list payloads
   - chat message payloads
   - active-chat change payloads

## Implementation Tasks

- [x] Inspect relevant files
- [x] Make focused changes
- [x] Run validation
- [x] Update docs/status

## Verification Strategy

1. Unit tests in [tests/unit/remote-control.test.js](tests/unit/remote-control.test.js):
   - generic input commands route to either slash-command handling or normal turns
   - slash-command results are targeted only to the requesting client
   - active chat changes update shared session snapshots without broadcasting requester-only result payloads
2. Unit tests in [tests/unit/relay-server.test.js](tests/unit/relay-server.test.js):
   - targeted events stay visible only to the intended client
   - generic command queue behavior remains correct with non-chat-specific command names
3. Remote-host e2e in [tests/e2e/agent-cli-remote.e2e.test.js](tests/e2e/agent-cli-remote.e2e.test.js):
   - browser-style slash commands return expected targeted results
   - selecting a chat through slash commands updates the active local chat
4. Relay e2e in [tests/e2e/relay-server.e2e.test.js](tests/e2e/relay-server.e2e.test.js):
   - the transport still handles generic commands, targeted events, and shared events correctly

## Verification Result

Executed on `2026-05-13`:

1. `vitest` scoped run through the repository test harness for:
   - [tests/unit/remote-control.test.js](tests/unit/remote-control.test.js)
   - [tests/unit/relay-server.test.js](tests/unit/relay-server.test.js)
   - [tests/e2e/relay-server.e2e.test.js](tests/e2e/relay-server.e2e.test.js)
   - [tests/e2e/agent-cli-remote.e2e.test.js](tests/e2e/agent-cli-remote.e2e.test.js)
2. `npm --prefix ./web run typecheck`

Observed result:

1. Scoped relay and remote-host tests passed.
2. Web TypeScript typecheck passed.

## Risks

1. If slash-command result payloads are too ad hoc, the browser state logic will become harder to maintain than the chat-specific protocol it replaces.
2. If active-chat changes do not emit a shared state update after requester-only command results, other clients may fall out of sync.
3. If the browser keeps too much request-specific state, reconnect and replay behavior may duplicate or overwrite targeted results incorrectly.