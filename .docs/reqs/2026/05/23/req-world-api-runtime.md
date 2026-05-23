# Requirement: World API Runtime

## Problem

Agent CLI has the storage pieces for a workspace-local world, agents, chats, and messages, but it does not yet expose them as one coherent world API. `agent-world-runtime.ts` is currently only an interface shape, while callers still reach into lower-level chat and agent helpers directly.

That keeps the old single-chat CLI path working, but it blocks the next product layer: a world should be the runtime object that owns agents, chats, realtime events, message routing, durable user-message flow control, and restart recovery. The old Agent World core proves the shape, but porting that whole stack would drag in orchestration, storage backends, broad restore machinery, and runtime behavior that Agent CLI does not need.

## Requirements

- Implement the existing `AgentWorldApi` surface as a real runtime API for the current workspace.
- Preserve the existing local-first `.agent-world` storage layout and workspace-root rules.
- Treat world state as durable runtime state, not process-local UI state.
- Keep the existing agent turn execution path intact; the world API should wrap it rather than replace `agent-runtime`.
- Represent the active world as the owner of:
  - world metadata, including default agent and current chat
  - loaded agents
  - loaded chats
  - a runtime event emitter
- Store durable memory at the agent level:
  - Each agent owns its own persisted memory under `.agent-world/agents/{agentId}`.
  - Agent memory is the source of truth for model context.
  - Chat message views provide the shared session transcript for display and navigation, but they must not become a second global memory source of truth.
  - Agent memory entries must carry `chatId` so a chat can be reconstructed or filtered per agent.
  - Routed turns append relevant user, assistant, and tool messages to the targeted agent's memory.
  - Broadcast or multi-agent turns append the appropriate message records to each participating agent's memory without collapsing them into one global memory file.
  - World-level chat reads may aggregate agent memory for display, but aggregation is a read model, not the source of truth.
- Build agent context from durable world state before each turn:
  - The targeted agent receives context assembled from chat-scoped message history, that agent's memory, current task plan/state, relevant world metadata, runtime config, workspace instructions, and available skill inventory.
  - Context assembly must be deterministic and inspectable enough for tests to verify what categories were included.
  - Chat history provides the recent conversational sequence; agent memory provides the agent's durable working record.
  - Task plan/state is persisted per agent and chat when present; absence of task state is treated as empty state, not an error.
  - Task plan/state captures in-progress goals, queued steering, outstanding tool/HITL waits, and recovery status that should influence the next response.
  - Context must respect the configured history/message limit rather than blindly loading every persisted record.
  - Messages irrelevant to the targeted agent under the `@mention` routing rules must not pollute that agent's LLM context.
  - Tool-call and tool-result messages needed to preserve valid function-call continuity must stay paired in context.
  - System/runtime guidance remains separate from persisted chat memory; it is composed into the model request, not written as normal user or assistant memory.
- Replace opaque runtime API records with concrete world, agent, chat, message, and realtime event types.
- Emit typed realtime events for message lifecycle, assistant streaming chunks, tool calls, tool results, run start/completion/failure, chat changes, and agent changes.
- Provide subscription APIs so local CLI, remote-control, and future UI callers can observe the same world events without duplicating runtime hooks.
- Route sent messages by Agent World `@mention` rules:
  - Mentions are case-insensitive and match either agent id or agent name after mention-token normalization.
  - Mention tokens normalize by trimming, removing trailing punctuation, replacing whitespace with `-`, and lowercasing.
  - Id-like mentions use `@name`, `@name-with-dash`, and `@name_with_underscore` forms.
  - Display-name mentions may include one following TitleCase word only when the mention starts uppercase and does not already contain `-` or `_`; for example `@Madame Pedagogue` normalizes to `madame-pedagogue`, while lowercase `@a2 Hi` normalizes to `a2`.
  - Only paragraph-beginning mentions route responses. A paragraph-beginning mention may be preceded by indentation and by `hey`, `hi`, `hello`, or `to`.
  - A paragraph-beginning mention can appear at the start of any line, so multi-line messages can target multiple agents with one beginning mention per paragraph or line.
  - Inline mentions that are not at paragraph beginnings do not route to an agent and must not trigger a fallback broadcast.
  - Human/user messages with no mentions are public messages and route to the world default responder.
  - If the world has a configured `mainAgent`, human/user messages with no paragraph-beginning mention route to that main agent instead of broadcasting.
  - World-originated messages follow the same public-or-mentioned routing behavior as human/user messages.
  - Agent-originated messages only route to agents explicitly mentioned at paragraph beginnings.
  - Agent self-messages must not trigger that same agent again.
  - Unknown paragraph-beginning mentions produce a clear user-facing failure event and error result.
  - Multiple resolved paragraph-beginning mentions are de-duplicated in first-seen order and run deterministically, without concurrent agent turns.
  - If one target in a multi-mention send fails before dispatch, that target emits a failure event; already completed target turns remain persisted and later unresolved targets are not silently skipped.
  - Tool-result routing should use tool-call context or structured target metadata, not visible `@mention` text.
- Preserve chat persistence semantics when a routed message targets a non-default agent.
- Add a lean per-chat user message queue:
  - User-authored messages submitted while a chat is already processing are queued instead of rejected or interleaved.
  - Queue processing is FIFO within a chat.
  - Different chats must not block each other through one global queue.
  - Queue entries carry at least `messageId`, `chatId`, `content`, `sender`, `status`, `retryCount`, and creation timestamp.
  - Queue statuses include `queued`, `sending`, `error`, and `cancelled`.
  - Queue entries are durably persisted under `.agent-world`, not held only in memory.
  - Only human/user-authored chat turns enter the user message queue; assistant, tool, system, and internal runtime events must not create user queue rows.
  - The current in-flight turn is allowed to complete unless explicitly stopped by existing stop/cancel behavior.
  - Queue APIs support list, add, remove, clear, pause, resume, stop, and retry operations exposed through the world API.
  - Queue `stop` cancels remaining queued rows and pauses further dispatch; it must not imply that an already running LLM call was interrupted unless existing stop/cancel behavior actually stops it.
  - Queue state changes emit typed realtime events so local CLI, remote-control, and future UI callers can render pending work.
  - Queue dispatch failures produce clear user-facing error events rather than silent stalls.
  - Queue processing must honor the same `@mention` routing rules as direct sends.
- Survive hard process restart:
  - World metadata, agents, agent-level memory, chats, queue rows, and queue pause/error/cancel state are reloaded from disk when the runtime starts again.
  - A hard restart must not lose queued user messages.
  - A hard restart must not duplicate a completed user turn.
  - On startup, `queued` rows resume automatically for their chat when the world runtime becomes active.
  - Interrupted `sending` rows are recovered deterministically: remove them if the transcript shows the turn completed, keep them blocked if they are waiting on unresolved tool/HITL state, mark them `error` if they are superseded or unrecoverable, otherwise return them to `queued`.
  - `error` and `cancelled` rows never auto-resume.
  - Auto-resume authority comes from durable queue rows only; persisted chat memory may rebuild context but must not independently resend the last user message.
  - Resume must emit observable queue/run events so callers can distinguish fresh user sends from recovered work.
- Support user steering through the queue:
  - A steering message is a normal queued user message submitted while another turn is active.
  - Steering messages preserve the user's order of intent and run as the next eligible turn after the active turn settles.
  - Steering messages can include `@mentions` to redirect the next turn to a specific agent.
  - Steering a chat must not mutate the world default agent.
  - Newer steering messages supersede unresolved user-facing prompts in the same chat only when the prompt is explicitly tied to the interrupted queued turn.
  - Users can remove or clear queued steering messages before they are dispatched.
- Preserve existing CLI and remote slash-command behavior for creating, listing, selecting, and reading chats.
- Keep imported old Agent World core concepts limited to the small pieces needed for this runtime API; do not port its full subscription, HITL replay, title scheduler, SQLite, or orchestration stack.

## Acceptance Criteria

- `agent-world-runtime.ts` exports concrete runtime types and an implementation of `AgentWorldApi`.
- A caller can load the current workspace world, list agents, list chats, create/select chats, and read chat messages through the world API.
- Agent memory is persisted per agent, carries chat scope, and can be aggregated for chat display without becoming a separate global memory source of truth.
- Before a routed turn starts, the world API builds context from chat history, targeted agent memory, task plan/state, runtime config, workspace instructions, and skills, while excluding messages that should not reach that agent.
- Sending a normal message through the world API runs the existing agent turn path against the default agent, persists the updated chat, and emits run/message events.
- Sending `@agentId message` or a recognized display-name mention runs the turn using that agent's config, persists the result without changing the default agent, and emits events tagged with the routed agent id.
- Sending a message with an unknown paragraph-beginning mention fails clearly and does not append a misleading assistant response.
- Sending a message with only inline mentions does not broadcast to the default agent.
- Multiple resolved paragraph-beginning mentions run in stable order and append distinct assistant responses to the same chat.
- A configured `mainAgent` routes unmentioned human/user messages to that agent.
- Streaming assistant chunks and tool activity are observable through the world API event subscription surface.
- If a user sends another message while a chat is processing, the world API records it as a queued message and emits a queue event.
- Queued steering messages dispatch in FIFO order after the active turn settles, using the same persistence and event behavior as a direct send.
- A queued steering message with an `@mention` routes to the mentioned agent without changing the default agent.
- Queue pause/resume/stop/clear/remove/retry operations are available through the world API and produce observable queue state changes.
- After a hard restart, durable `queued` rows resume automatically, recoverable interrupted `sending` rows are handled according to persisted transcript state, and completed turns are not duplicated.
- `error` and `cancelled` queue rows remain visible for explicit user action and do not resume automatically.
- Existing `agent-cli` local, interactive, and remote chat commands keep their current behavior.
- Targeted tests cover world API bootstrap, event subscription, default-agent sends, routed sends, unknown mentions, multi-mention ordering, queued sends, steering sends, queue controls, and queue failure events.

## Non-Goals

- Do not port the full `../agent-world/core` runtime.
- Do not replace `agent-runtime` or rewrite `runChatTurn`.
- Do not introduce SQLite or a new storage backend.
- Do not port Agent World's full queue manager, broad chat-restore replay, HITL replay, title generation, dashboard mode, heartbeat scheduling, or multi-process runtime coordination.
- Do not auto-resume from chat memory alone; only durable queue-owned rows may drive restart recovery.
- Do not move credentials, provider keys, workspace files, tools, or long-term memory off-machine.
