# DD: multi-client-chat-broadcast

- Story slug: `multi-client-chat-broadcast`
- Completed: `2026-05-13`
- Status: Done
- Related requirement: `./.docs/reqs/2026/05/13/req-multi-client-chat-broadcast.md`
- Related plan: `./.docs/plans/2026/05/13/plan-multi-client-chat-broadcast.md`
- Related test spec: `./.docs/tests/test-multi-client-chat-broadcast.md`

## Outcome

Extended the relay-backed remote host so one local `agent-cli --remote` process can serve multiple paired clients while keeping chat persistence, active-chat selection, runtime execution, tool execution, and permission enforcement on the local machine.

The shipped behavior now supports:
- multiple paired clients per hosted relay session
- one-time invite minting for additional clients after the first pair
- requester-targeted relay events for chat list/history queries and command failures
- local chat list, chat history, chat creation, and active-chat selection from the web UI
- continued shared transcript, approval, cancel, resume, and disconnect flows for all paired clients

## Delivered

1. Relay multi-client session model
- Updated `server/lib/relay-server.js` to replace the single mobile token with a per-client registry and token index.
- Added one-time pairing invite creation for already-authorized session members.
- Extended commands and events with client routing metadata so requester-only results do not leak across clients.
- Preserved shared broadcast behavior for assistant output, run status, approvals, completion, failure, disconnect, and active-chat state changes.

2. Host-side remote chat control
- Updated `lib/remote-control.js` to keep a mutable active chat instead of binding the host loop to one startup chat.
- Added handling for `list_chats`, `read_chat_messages`, `create_chat`, and `select_chat` remote commands.
- Added targeted `chat_list_result`, `chat_messages_result`, and `command_error` events plus broadcast `chat_created`, `active_chat_changed`, and `session_snapshot` events.

3. Local persistence surface
- Expanded `lib/session-store.js` with `listPersistedChats()`, `loadChatById()`, `createPersistedChat()`, `setCurrentChat()`, and remote-host lock updates during chat switches.
- Kept the current `./.chats/{chatId}/messages.json`, `events.json`, `remote.json`, and `current.json` layout intact.
- Left turn execution and long-term persistence local to the CLI host.

4. CLI and client contract updates
- Updated `bin/agent-cli.js` to expose the new session-store helpers through remote mode.
- Extended `lib/relay-client.js` and `web/src/relay-api.ts` for pairing invite creation and targeted event posting.
- Preserved existing single-client startup behavior while allowing multi-client relay sessions.

5. Web relay UI
- Reworked `web/src/App.tsx` to add chat browsing, chat preview/history loading, local chat creation, active-chat switching, and share-invite controls.
- Updated `web/src/styles.css` for the new sidebar, session status, and responsive remote layout.
- Kept the shared transcript and approval UX intact for users who only need the original supervision flow.

6. Documentation and test wiring
- Updated `README.md` with multi-client remote behavior, invite sharing, remote chat-management capabilities, and the revised test command split.
- Updated the plan doc to reflect implemented phases and verification.
- Updated `package.json` so `npm test` now includes deterministic relay e2e coverage via `npm run test:e2e:relay`.

## Requirement Coverage (REQ)

1. Multi-client pairing and invite lifecycle
- Satisfied by the relay client registry, one-time invite issuance, and unique client identity per successful pair.

2. Shared session behavior with requester isolation
- Satisfied by broadcast session events for shared run state and requester-targeted query results for chat list/history and command failures.

3. Remote chat management
- Satisfied by host-side list, load, create, and select operations backed by the local session store rather than relay-side persistence.

4. Local-first trust boundary and backward compatibility
- Satisfied by keeping runtime execution, tools, files, secrets, and persistence local while preserving the existing single-client relay path.

## Plan Coverage (AP)

1. Phase 1: Refactor relay session/auth model for multiple clients
- Completed by adding per-client auth state, invite issuance, and audience-aware event filtering.

2. Phase 2: Expand local chat persistence APIs
- Completed by adding chat enumeration, direct loading, empty-chat creation, explicit selection, and remote-host lock updates.

3. Phase 3: Add host-side remote chat control
- Completed by routing chat-management commands through the host coordinator and publishing targeted or broadcast relay events as appropriate.

4. Phase 4: Update browser relay client and UI
- Completed by extending the browser API wrapper and rebuilding the web UI around chat browsing, preview, switching, and invite sharing.

5. Phase 5: Verify compatibility, tests, and docs
- Completed by updating unit coverage, adding relay e2e coverage, updating docs, and validating the default repo test path.

## Verification

Executed on `2026-05-13`:

1. `npm run test:e2e:relay`
2. `npm test`

Observed result:
- Relay e2e suite: passed.
- Syntax checks: passed.
- Unit suite: passed.
- Relay e2e in default test path: passed.
- Web TypeScript typecheck: passed.
- Total unit coverage in the verified run: 88 tests passed.

## Follow-Up Risks

1. Same-browser multi-tab invite handling currently reuses the stored mobile session when the saved session ID matches the invite session, which can collapse two browser tabs into one logical paired client.
2. `listPersistedChats()` currently enumerates directory-based chat storage only, so legacy flat-file chats are not surfaced in the remote chat picker.
3. `remote.json` metadata remains attached to the startup chat and is not rewritten when the active remote chat changes.