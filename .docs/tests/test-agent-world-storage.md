# AT: agent-world-storage

- Story slug: `agent-world-storage`
- Created: `2026-05-14`
- Status: Verified
- Related requirement: `./.docs/reqs/2026/05/14/req-agent-world-storage.md`
- Related plan: `./.docs/plans/2026/05/14/plan-agent-world-storage.md`

## Scope

Validate that Agent CLI uses `.agent-world` as the single supported local storage contract for world, chat, agent, runtime-default, and remote-host coordination state.

## Scenarios

1. Fresh world bootstrap creates the required durable structure
- Given a clean project root with no `.agent-world`
- When the CLI initializes storage for a new chat or follow-up flow
- Then it creates `.agent-world/world.json`
- And it creates `.agent-world/chats/` and `.agent-world/agents/`
- And it creates the default agent directory with `agent.json`, `inbox.jsonl`, `state.json`, `events.jsonl`, and `memory.md`

2. New chat writes the durable chat contract
- Given a fresh or bootstrapped world
- When the CLI creates and persists a chat
- Then the chat exists at `.agent-world/chats/{chatId}/`
- And `chat.json`, `messages.jsonl`, and `summary.md` are present
- And `messages.jsonl` contains one JSON object per line in message order

3. Current chat selection lives in world metadata
- Given more than one persisted chat exists
- When the user or remote flow selects a different current chat
- Then `.agent-world/world.json.currentChatId` changes to the selected chat ID
- And the next follow-up turn runs against that selected chat

4. Legacy `.chats` data is not imported into the new store
- Given a project root still contains an old `.chats` directory
- When the CLI initializes the new storage layer
- Then Agent CLI starts from the `.agent-world` contract only
- And no legacy chat is auto-imported into `.agent-world/chats/`

5. Runtime precedence honors repo-root and agent-level runtime files
- Given `./runtime.json` exists with default runtime values
- And `.agent-world/world.json.defaultAgentId` points at an agent directory with `runtime.json`
- When the CLI loads runtime settings without conflicting CLI flags
- Then the agent runtime file overrides matching keys from the repo-root runtime file
- And unmatched keys still come from the repo-root runtime file

6. Provider credentials still come from `.env` or the process environment
- Given runtime files exist
- And the selected provider requires credentials
- When the CLI runs a turn
- Then provider credentials can still be read from `.env` or the process environment
- And non-credential runtime defaults do not need to be duplicated into environment variables

7. CLI flags override every persisted runtime default
- Given runtime files define runtime settings
- When the user passes explicit CLI runtime flags
- Then the CLI flag values win for that invocation only

8. Stream traces move to agent-scoped events without breaking current behavior
- Given stream tracing is enabled
- When the CLI runs a turn that emits warnings, reasoning, tools, or text chunks
- Then the agent `events.jsonl` file records those events with enough metadata to associate them with the active chat
- And chat persistence still writes only `chat.json`, `messages.jsonl`, and `summary.md`

9. Remote-session persistence tracks the currently selected chat
- Given the CLI starts with `--remote`
- When the relay session becomes active and the active chat later changes through `/new` or `/use`
- Then remote-session durable state is written to the default agent `state.json`
- And `state.json.currentChatId` follows the selected world chat
- And remote chat-list, load, create, and select operations continue to resolve against `.agent-world/chats`

10. Remote host locking stays inside `.agent-world`
- Given a `--remote` host is active
- When another CLI process starts in the same project root
- Then the active lock is enforced from `.agent-world/remote-host.lock.json`
- And a stale lock from a dead process is cleared automatically

11. Prompt and skill loading remain unchanged
- Given `AGENTS.md` and `./.agents/skills/` exist
- When the CLI builds a turn
- Then prompt and skill loading still read from those existing locations
- And they do not depend on `.agent-world`

## Expected Verification During SS

1. Unit tests for session-store bootstrap, JSONL persistence, current-chat selection, and remote-host locking.
2. Unit tests for runtime-file precedence and startup behavior.
3. Unit tests for remote-host persistence updates after `/new` and `/use`.
4. Remote-host and relay e2e coverage for `.agent-world` chat storage.