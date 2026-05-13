# REQ: pure-relay-slash-commands

- Story slug: `pure-relay-slash-commands`
- Created: `2026-05-13`
- Status: Requested

## Summary

Refocus Agent CLI remote mode on a pure relay transport by removing chat-specific and message-specific remote protocol operations, and instead support slash commands interpreted by the local CLI host while returning operation results only to the client that issued the command.

## Problem

The current remote flow exposes host-specific chat operations directly as remote command and event types such as chat listing, chat message reads, chat creation, chat selection, and explicit remote user-message dispatch. That makes the relay protocol aware of application-level chat behavior instead of behaving as a generic coordination layer. It also means some command outcomes are expressed as broadcast events even when they are really requester-scoped operation results. The requested direction is to keep the relay pure, move local chat operations behind CLI-side slash commands, and ensure command results are routed back only to the client that asked for them.

## Requirements

1. The relay transport must remain a generic coordination layer rather than defining dedicated application-level chat-management operations.
2. Remote clients must no longer require dedicated chat-specific command types for listing chats, reading chat messages, creating chats, selecting chats, or sending normal message turns.
3. The local `agent-cli --remote` host must accept one generic text-input command path from paired clients.
4. When the generic remote text input begins with `/`, the local CLI host must interpret it as a slash command instead of sending it to the language model as a normal user turn.
5. When the generic remote text input does not begin with `/`, the local CLI host must continue to execute it as a normal chat turn against the current active local chat.
6. Slash commands must cover the remote chat-management use cases currently needed by the browser UI, including listing chats, inspecting chat messages, creating a new chat, and selecting the active chat.
7. Slash-command execution must happen on the local CLI host, which remains the authority for local chat persistence, active-chat state, and message history.
8. Slash-command success responses must be returned only to the paired client that issued the command.
9. Slash-command failure responses must be returned only to the paired client that issued the command.
10. Requester-scoped operation results must not be broadcast to other paired clients merely because they share the same relay session.
11. Shared session events that describe actual shared host state or run progress may still be broadcast when they are session-wide rather than requester-specific.
12. The protocol must make the distinction between shared session events and requester-scoped command results explicit enough for clients to render them differently.
13. If a slash command changes shared host state such as the current active chat, the system must provide enough shared state signaling for other paired clients to converge on the new session state without receiving the original requester-only operation result payload.
14. Existing remote approval, cancel, resume, disconnect, session snapshot, assistant output, run status, completion, failure, and pairing flows must continue to work.
15. Local-only CLI usage when `--remote` is not enabled must continue to work unchanged.
16. Agent execution, tool execution, workspace files, local environment files, provider credentials, and long-term memory must remain on the local machine.
17. The relay must not become the source of truth for long-term chat persistence or command interpretation.

## Non-Goals

1. Replacing the relay transport with WebSockets or another transport is not required.
2. Removing the browser UI or requiring users to type slash commands manually instead of using UI controls is not required, as long as the UI uses the generic text-command path underneath.
3. Defining a broad plugin architecture for arbitrary slash commands is not required.
4. Changing local persisted chat file formats is not required.
5. Changing the existing pairing trust model or introducing per-client authorization tiers is not required.

## Acceptance Criteria

1. Given a paired remote client, when it submits plain text without a leading `/`, the local host executes a normal chat turn and shared run events continue to flow as before.
2. Given a paired remote client, when it submits a supported slash command, the local host executes the corresponding local chat operation without sending that slash text to the language model as a user prompt.
3. Given two paired clients share one remote session, when one client issues a slash command that returns a requester-scoped result such as chat listing or chat message inspection, only that client receives the detailed result payload.
4. Given two paired clients share one remote session, when one client issues a slash command that fails, only that client receives the detailed failure payload.
5. Given a slash command changes shared host state such as the active chat, other paired clients can still converge on the new active state through shared session signaling rather than receiving the full requester-only result.
6. Given the browser UI asks for chat list, chat history, new chat, or chat selection behavior, it can do so through the generic text-command path and does not require dedicated relay command types for those actions.
7. Given remote mode is disabled, local CLI chat behavior remains unchanged.

## Open Questions

1. The requirement assumes slash commands will cover the existing remote chat-management needs, but the final user-facing slash command names and aliases still need to be fixed in implementation.
2. The requirement keeps requester-scoped operation results private, but it does not yet define whether the browser transcript should render those results inline as system messages, in a side panel, or both.