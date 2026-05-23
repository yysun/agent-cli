# REQ: multi-client-chat-broadcast

- Story slug: `multi-client-chat-broadcast`
- Created: `2026-05-13`
- Status: Requested

## Summary

Extend Agent CLI remote mode so one local CLI host can broadcast session state to multiple paired clients, and let those clients list chats, inspect chat messages, create chats, and switch the active chat remotely.

## Problem

The current remote supervision flow is centered on one active local chat and one supervising client experience. That is sufficient for a single remote observer, but it does not support a shared remote view for multiple clients or a remote workflow that can move between persisted chats. A supervising client cannot currently browse the local chat inventory, inspect a selected chat's messages, create a new chat remotely, or choose which existing chat should become the active chat for subsequent remote interaction. The requested behavior is collaborative remote supervision for one local CLI host, while keeping execution, files, environment, tools, and persistence on the local machine.

## Requirements

1. `agent-cli --remote` must support more than one paired remote client connected to the same local CLI host at the same time.
2. The relay-backed remote session must broadcast normalized session events to every currently authorized paired client for that local host.
3. A newly paired client must be able to catch up to the current active session state without requiring the local CLI host to restart.
4. Multiple paired clients must be able to observe assistant output, run status, approval requests, completion, failure, and disconnect events for the active chat.
5. Remote clients must be able to request the list of chats available to the current local workspace root or local host scope exposed by Agent CLI.
6. The remote chat list must include enough metadata for a client to distinguish chats and choose one to open, including at minimum chat identity and recency information.
7. A remote client must be able to request the persisted message history for a specific chat it is authorized to access.
8. A remote client must be able to create a new chat through the remote session.
9. A remote client must be able to select an existing chat as the active chat for subsequent remote turns.
10. When a new chat is created remotely, that chat must become selectable immediately without requiring a fresh pairing flow.
11. When the active chat changes, the local CLI host and every connected paired client must converge on the same active chat identity.
12. After a remote client selects or creates the active chat, subsequent remote user messages must be routed to that selected chat rather than being forced into the previously active chat.
13. The remote protocol must provide an explicit response or event for chat-list requests, chat-message requests, chat creation, and chat selection so clients can render success and failure states reliably.
14. Concurrent paired clients must receive active-chat change notifications so their UI state stays synchronized.
15. Remote access must remain scoped to clients that successfully pair with the current local host session; unpaired clients must not be able to list chats, read messages, create chats, or switch chats.
16. Local-only CLI usage must continue to work unchanged when `--remote` is not used.
17. Existing single-client remote flows must remain backward compatible for clients that only send message, approval, cancel, resume, and disconnect commands.
18. Agent execution, tool execution, workspace files, local environment files, provider credentials, and long-term memory must remain on the local machine.
19. The relay must continue to act only as a coordination layer and must not become the source of truth for long-term chat persistence.
20. The local CLI host must remain the authority for persisted chat storage, chat creation, active-chat selection, and message retrieval.

## Non-Goals

1. Multi-user identity, roles, or per-client permissions beyond the existing pairing trust boundary are not required.
2. Moving chat persistence from the local machine into the relay is not required.
3. Building a full collaborative editor or per-message annotation system is not required.
4. Defining conflict-resolution semantics beyond keeping the active chat synchronized is not required for this requirement.
5. Replacing the current local CLI interface is not required.

## Acceptance Criteria

1. Given one running `agent-cli --remote` host, at least two paired clients can connect concurrently and receive the same active-session event stream.
2. Given two paired clients are connected, when the host emits assistant output for the active chat, both clients receive that output without the host starting separate sessions.
3. Given a paired client requests the available chat list, it receives the set of chats exposed by the local CLI host together with metadata sufficient to present a picker.
4. Given a paired client requests messages for a selected chat, it receives the persisted messages for that chat from the local host.
5. Given a paired client creates a new chat, the local host persists that chat and returns or emits the new chat identity so connected clients can select it.
6. Given a paired client selects an existing chat, subsequent remote messages run against that selected chat and other paired clients are notified of the active-chat change.
7. Given a second paired client connects after chat creation or chat selection already happened, it can discover the current active chat and request its messages without restarting the host session.
8. Given an unpaired client or an invalid session token, chat listing, chat-message retrieval, chat creation, and chat selection are rejected.
9. Given `--remote` is not used, existing local chat creation, selection, and follow-up behavior continue to work as they do now.
10. Given remote operation with multiple clients, long-term chat persistence still resides on the local machine rather than the relay.

## Open Questions

1. The requirement assumes multiple paired clients can all observe the same host session, but it does not yet define whether any paired client may mutate the active chat at any time or whether a stronger coordination rule is needed.
2. The requirement asks for chat-message retrieval, but pagination, truncation, and incremental backfill behavior for very large chats still need to be decided.
