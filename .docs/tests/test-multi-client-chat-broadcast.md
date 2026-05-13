# AT: multi-client-chat-broadcast

- Story slug: `multi-client-chat-broadcast`
- Created: `2026-05-13`
- Related requirement: `./.docs/reqs/2026/05/13/req-multi-client-chat-broadcast.md`
- Related plan: `./.docs/plans/2026/05/13/plan-multi-client-chat-broadcast.md`

## Scope

Validate that one local `agent-cli --remote` host can serve multiple paired clients concurrently, broadcast shared session state to them, and let an authorized client list chats, inspect chat messages, create chats, and switch the active chat while long-term persistence remains on the local machine.

## Scenarios

1. Local-only mode remains unchanged
- Given the CLI runs without `--remote`
- When a user creates a new chat or sends a follow-up locally
- Then the existing local chat behavior still works
- And no relay multi-client behavior is activated

2. First paired client still uses the standard invite path
- Given the CLI host starts with `--remote`
- When it registers a relay session
- Then it receives the first short-lived client connection URL
- And the first client can pair successfully with that invite
- And the client receives its own client identity and client-scoped mobile token

3. A second client can pair without replacing the first client
- Given one client is already paired to the active host session
- When the host or an authorized paired client creates another one-time pairing invite
- And a second client redeems that invite
- Then the second client receives its own client identity and client-scoped token
- And the first client remains connected and authorized

4. Shared assistant output is broadcast to all paired clients
- Given two paired clients are connected to the same host session
- When one client sends a remote user message for the active chat
- Then the host runs exactly one local turn
- And the resulting `assistant_output`, `run_status`, and completion events reach both clients

5. Chat list requests return local chat metadata
- Given a paired client is connected
- When that client requests the chat list
- Then the local host returns the available chats from local persistence
- And the result includes enough metadata to identify the current chat and recent activity

6. Chat history requests return the selected chat messages
- Given a paired client knows a valid chat ID
- When that client requests that chat's messages
- Then the host returns the persisted messages for that chat
- And the request does not silently switch the current chat by itself

7. Requester-only query results do not confuse other clients
- Given two paired clients are connected
- When one client requests a chat list or chat history payload
- Then that requester receives the response needed to render the data
- And the other client does not treat that query response as a transcript change unless the active chat actually changes

8. Remote chat creation persists locally and becomes immediately selectable
- Given a paired client is connected
- When that client creates a new chat remotely
- Then the local host creates the chat under `./.chats/`
- And the new chat is returned or announced with its chat ID
- And connected clients can select it without re-pairing

9. Selecting a chat updates the shared active chat state
- Given two paired clients are connected
- When one client selects an existing chat
- Then the local host switches the active chat pointer
- And both clients receive an active-chat change signal
- And later remote user messages run against the newly selected chat

10. Late-joining clients can catch up to the current active chat
- Given the host session already created or switched chats before another client joins
- When a newly paired client connects and requests backlog or snapshot data
- Then it can discover the current active chat
- And it can request that chat's message history without restarting the host session

11. Approvals, cancel, and disconnect still work with more than one client
- Given two paired clients are connected during an active run
- When the host emits a tool approval request, or a client sends cancel, or a client disconnects
- Then the existing approval and run-control rules still apply safely
- And the host remains the only place where tool execution is allowed or denied

12. Invalid or unpaired clients cannot use chat-management features
- Given an invalid token, expired invite, or unpaired browser tab
- When it attempts to list chats, read messages, create chats, or switch chats
- Then the relay rejects the request
- And no local chat state changes occur

13. Remote chat state does not move long-term persistence into the relay
- Given multi-client remote usage is active
- When chats are listed, loaded, created, or selected remotely
- Then long-term chat contents still live under the local `./.chats/` directory
- And the relay stores only the short-lived coordination data needed for connected clients

## Expected Verification During SS

1. Unit tests for relay multi-client pairing, invite issuance, audience filtering, and broadcast behavior.
2. Unit tests for session-store list/load/create/select helpers.
3. Unit tests for remote-control command routing and active-chat switching.
4. Integration coverage for backward-compatible remote startup and multi-client command flow.
5. Manual browser exercise with two paired clients once the UI changes are in place.