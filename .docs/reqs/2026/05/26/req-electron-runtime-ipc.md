# Electron Runtime IPC Requirement

## Requirement

The Electron app must call the existing Agent CLI runtime from the Electron main process through IPC. The runtime remains in `core/agent-runtime.ts`; the solution must not introduce npm workspaces, separate packages, or a new runtime ownership boundary.

The Electron renderer must support the basic chat workflow against the flat Agent CLI workspace store: select workspace, show chats, select a chat, display messages, send a message, edit a user message, and resend from the edited point.

## Acceptance Criteria

- Electron main can execute a chat turn by importing the existing core runtime path.
- Renderer code can call a preload-exposed method without direct Node or Electron access.
- Runtime setup uses existing workspace environment, prompt, skill inventory, and chat-turn helpers.
- Renderer can select a workspace and refresh the persisted chat list.
- Renderer can create/select a chat and display persisted messages.
- Renderer can send a message through the runtime and persist the returned messages.
- Renderer can edit a user message and resend from that message by truncating later messages.
- Renderer can set tool permission and reasoning effort for each runtime turn.
- The Electron build includes the local core runtime without publishing or packaging core separately.
- The change keeps context isolation and sandbox posture intact.
- Validation covers the Electron build path and does not require live provider calls.

## Non-Goals

- No npm workspace split.
- No separate `agent-runtime` package.
- No full chat UI redesign.
- No old world/session/agent model restoration.
