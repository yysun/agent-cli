# DD: pure-relay-slash-commands

- Story slug: `pure-relay-slash-commands`
- Completed: `2026-05-13`
- Status: Done
- Related requirement: `./.docs/reqs/2026/05/13/req-pure-relay-slash-commands.md`
- Related plan: `./.docs/plans/2026/05/13/plan-pure-relay-slash-commands.md`

## Outcome

Refocused the remote-control flow so the relay now carries generic remote input plus shared session events, while the local `agent-cli --remote` host interprets slash commands for chat-management operations and returns requester-only results to the client that issued them.

The shipped behavior now supports:
- generic remote text input for both normal turns and host-side slash commands
- host-side slash commands for `/help`, `/chats`, `/messages <chatId>`, `/new`, and `/use <chatId>`
- requester-targeted `command_result` and `command_error` events for slash-command outcomes
- continued broadcast of shared run-state events such as assistant output, run status, approvals, completion, failure, disconnect, and session snapshots
- a browser UI that keeps its chat sidebar behavior while using the same generic input path underneath

## Delivered

1. Host-side slash-command orchestration
- Updated `lib/remote-control.js` to remove chat-specific remote command handling from the active host flow.
- Added host-side parsing for remote slash commands and routed chat list, message inspection, chat creation, and chat selection through the local session store.
- Added targeted `command_result` responses and preserved targeted `command_error` handling for requester-only outcomes.

2. Pure relay transport direction
- Kept `server/lib/relay-server.js` transport-oriented by continuing to store generic commands and targeted or shared events without relying on chat-specific host event names for current session state.
- Preserved shared session-state tracking through `session_snapshot` so paired clients still converge on the active chat.

3. Browser client contract update
- Updated `web/src/App.tsx` so the UI sends generic `input` commands for normal prompts and slash-command-backed chat operations.
- Reworked browser-side handling to consume unified `command_result` payloads instead of chat-specific result event names.
- Kept shared transcript, approval, cancel, resume, disconnect, reconnect, and restore behavior intact.

4. Test and documentation updates
- Updated relay, remote-control, and remote-host tests to assert the generic input path and requester-targeted `command_result` contract.
- Updated `README.md` to describe the slash-command-driven remote behavior and the relay-pure transport direction.
- Added the requirement, plan, and this done doc for the story.

## Requirement Coverage (REQ)

1. Remove chat-specific and message-specific remote protocol operations
- Satisfied by replacing the active `user_message`, `list_chats`, `read_chat_messages`, `create_chat`, and `select_chat` flow with one generic remote `input` command path for normal turns and slash commands.

2. Make the CLI host interpret slash commands locally
- Satisfied by host-side parsing and execution in `lib/remote-control.js`, backed by the local session store rather than relay-side business logic.

3. Return operation results only to the requesting client
- Satisfied by targeted `command_result` and `command_error` events addressed through `targetClientId`.

4. Preserve shared session behavior and local-first boundaries
- Satisfied by keeping shared run-state broadcasts for session-wide events and keeping execution, persistence, tools, files, environment, and secrets on the local machine.

## Plan Coverage (AP)

1. Refactor host protocol
- Completed by collapsing chat-management operations into host-side slash commands over generic relay input.

2. Simplify the browser contract
- Completed by translating UI chat actions into slash commands and unifying requester-only result handling around `command_result`.

3. Verify transport and behavior
- Completed by updating unit and e2e coverage for the new command path and rerunning the full repo validation command.

4. Update docs and status
- Completed by updating `README.md`, marking the plan implemented, and adding this done doc.

## Verification

Executed on `2026-05-13`:

1. Scoped relay and remote-host verification through the repository test harness for:
   - `tests/unit/remote-control.test.js`
   - `tests/unit/relay-server.test.js`
   - `tests/e2e/relay-server.e2e.test.js`
   - `tests/e2e/agent-cli-remote.e2e.test.js`
2. `npm --prefix ./web run typecheck`
3. `npm test`

Observed result:
- Scoped relay and remote-host tests: passed.
- Web TypeScript typecheck: passed.
- Full repository validation: passed.
- Unit coverage in the verified full run: 89 tests passed.
- Relay e2e coverage in the verified full run: 5 tests passed.

## Follow-Up Risks

1. The browser currently renders requester-only slash-command results inline in the transcript as system-style messages while also using structured payloads to update sidebar state, which could feel noisy if more slash commands are added.
2. The `command_result` payload is intentionally generic, so future slash-command expansion should keep its shape disciplined or it could become harder to evolve than the chat-specific protocol it replaced.
3. Shared session convergence now depends on `session_snapshot` plus local browser refresh requests rather than separate broadcast chat-management result events, so future state mutations should continue to emit sufficient shared snapshot updates.