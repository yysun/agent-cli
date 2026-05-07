# REQ: codex-copilot-convention

- Story slug: `codex-copilot-convention`
- Created: `2026-05-07`
- Status: Implemented

## Summary

Align Agent CLI project conventions with codex/copilot expectations for prompt source, skill source, runtime configuration source, and chat storage location.

## Problem

The current project layout and runtime behavior use legacy `./agent`-scoped files and folders (`system.md`, `skills/`, `config.json`, and `sessions/`) that do not match codex/copilot conventions. This creates friction for shared tooling expectations and repository portability.

## Requirements

1. The CLI must load the system prompt from `./AGENTS.md`.
2. The CLI must load skills from `./.agents/skills/`.
3. The CLI must retire `./agent/config.json` as a runtime configuration source.
4. The CLI must support runtime configuration from command-line options.
5. The CLI must fall back to environment variables when relevant runtime options are not provided on the command line.
6. The repository must provide a `./.env.example` file that documents required and optional runtime environment variables.
7. The CLI must move persisted chat storage from `./agent/sessions/` to `./.chats/`.
8. The current-chat pointer and chat transcripts must be persisted under `./.chats/`.
9. Existing behavior that depends on persisted chat continuity must continue to work with the new storage root.
10. Documentation must reflect the new prompt path, skills path, configuration source, and chat storage path.

## Non-Goals

1. Changing the underlying LLM runtime library is not required.
2. Adding new chat-management commands is not required.
3. Defining migration tooling for old `./agent/sessions/` data is not required unless separately requested.

## Acceptance Criteria

1. Running the CLI loads prompt instructions from `./AGENTS.md`.
2. Running the CLI discovers skills from recursive `SKILL.md` files under `./.agents/skills/`.
3. The CLI does not read `./agent/config.json` during runtime configuration resolution.
4. CLI-provided runtime flags are honored.
5. When runtime flags are omitted, environment-based runtime configuration is honored.
6. The repository contains `./.env.example` with environment variable guidance.
7. New chats and follow-up turns persist under `./.chats/`.
8. The current-chat pointer is stored under `./.chats/` and is used for chat reuse across invocations.
9. Project documentation references `./AGENTS.md`, `./.agents/skills/`, and `./.chats/` instead of the retired legacy locations.

## Open Questions

1. Whether one-time migration of existing `./agent/sessions/` data into `./.chats/` should be automatic or manual remains undecided.