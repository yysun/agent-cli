# REQ: llm-runtime-cli

- Story slug: `llm-runtime-cli`
- Created: `2026-05-07`
- Status: Superseded
- Superseded by: `./.docs/reqs/2026/05/07/req-codex-copilot-convention.md`

## Supersession Note

This requirement captured the initial `./agent/*` layout.
Current repository conventions are defined by `codex-copilot-convention` (`AGENTS.md`, `./.agents/skills/`, and `./.chats/`).
Use this document as historical context only.

## Summary

Create a Node.js CLI for the Agent CLI project that uses `llm-runtime` to send user messages into a persisted chat system stored under `./agent`.

## Problem

The repository does not currently provide a command-line entry point for invoking an LLM with persistent chat state, workspace prompt files, and workspace skills. A user should be able to run one CLI command, pass a message as an argument, have that message appended to the current chat, and receive the model response in the terminal while chat history is persisted on disk.

## Requirements

1. The project must provide a Node.js CLI command for chatting with the LLM from the terminal.
2. The CLI must accept the user message from command-line arguments.
3. The CLI must send each user message to the current chat.
4. The CLI must support a `--new-chat` flag that creates a new chat and sets it as the current chat before sending the user message.
5. The CLI must persist chats and messages under `./agent/sessions`.
6. The CLI must keep enough session metadata on disk to determine which chat is the current chat between invocations.
7. The CLI must load the system prompt at runtime from `./agent/system.md` instead of hardcoding it in source code.
8. The CLI must load skills at runtime from `./agent/skills/` using the `llm-runtime` skill-root convention and register them with the LLM skill registry.
9. The CLI must use the `llm-runtime` package to execute the chat request.
10. The CLI must include existing messages from the current chat when sending a new message so that chat state persists across invocations.
11. The CLI must print the model response to standard output.
12. The CLI must print clear error messages to standard error and exit with a non-zero status when required inputs or runtime dependencies are missing or invalid.
13. The CLI must fail clearly when the user message is omitted.
14. The CLI must fail clearly when `./agent/system.md` cannot be found or loaded.
15. The CLI must fail clearly when `./agent/skills/` cannot be found or loaded.
16. The CLI must fail clearly when no current chat exists and the user does not provide `--new-chat`, unless the product later defines an automatic fallback behavior.
17. The CLI must persist the current-chat pointer in a stable file under `./agent/sessions` so the active chat can be resolved between invocations.
18. Each persisted chat must have a stable chat identifier and must retain ordered message history with role information.
19. The CLI must discover skill files from `./agent/skills/` using the `llm-runtime` `SKILL.md` convention and a deterministic file selection rule.
20. The CLI must behave consistently when `./agent/skills/` exists but contains no loadable skill files.
21. The CLI must perform persistence in a way that avoids corrupting the current chat state during a normal single-process invocation.

## Non-Goals

1. Interactive REPL-style chat is not required.
2. Prompt editing inside the CLI is not required.
3. Chat management commands beyond sending to the current chat and creating a new current chat are not required.
4. Streaming output is not required unless `llm-runtime` makes it necessary for basic operation.

## Acceptance Criteria

1. Running the CLI with a message argument appends that message to the current chat, sends the current chat history to the LLM, persists the resulting assistant response, and prints the final response.
2. The system prompt used by the request is sourced from `./agent/system.md`.
3. The skill registry used by the request is populated from `SKILL.md` files discovered under `./agent/skills/`.
4. Chat sessions and messages are written under `./agent/sessions` and remain available across separate CLI invocations.
5. Running the CLI with `--new-chat` creates a new chat, marks it as current, sends the provided user message to that new chat, and persists the result.
6. Running the CLI without a message exits with an actionable usage error.
7. Running the CLI when `./agent/system.md` is missing exits with an actionable file-loading error.
8. Running the CLI when `./agent/skills/` is missing exits with an actionable file-loading error.
9. Running the CLI without `--new-chat` when no current chat exists exits with an actionable current-chat error.
10. The active chat can be recovered across separate CLI invocations using persisted state under `./agent/sessions`.
11. Skill loading order is deterministic across repeated runs against the same `./agent/skills/` contents.

## Architecture Review

### Outcome

The requirement is viable for a small single-user CLI, but it had several ambiguities that would lead to incompatible implementations. Those ambiguities are resolved below so implementation can proceed without guesswork.

### Decisions

1. Use `./agent/sessions/current.json` as the current-chat pointer file.
2. Store one chat per file under `./agent/sessions/chats/<chat-id>.json`.
3. Persist each chat with at least `id`, `createdAt`, `updatedAt`, and ordered `messages` entries containing `role`, `content`, and timestamp metadata.
4. Load skills from `SKILL.md` files discovered recursively under `./agent/skills/` using deterministic lexical path order.
5. Treat a missing `./agent/skills/` directory as an error, but allow an existing empty directory unless later product requirements mandate at least one skill.
6. Scope the first implementation to normal single-process CLI usage; cross-process locking is not required for this version.

### Tradeoffs

1. One-file-per-chat is simpler to inspect and update than a single global sessions database, but it is weaker for concurrent writes.
2. A separate `current.json` pointer is simpler than deriving the current chat from modification time, but it introduces one more file that must be kept in sync.
3. Lexical `SKILL.md` discovery is predictable and easy to document, but it gives ordering control only through folder and file names.
4. Allowing an empty skills directory reduces setup friction, but it means behavior may rely entirely on the system prompt until skills are added.

### Resolved Risks

1. The storage layout is now defined tightly enough to support consistent persistence and recovery.
2. The current-chat lookup mechanism is now explicit instead of implicit.
3. Skill discovery order is now deterministic.

### Residual Risks

1. If future requirements need concurrent CLI invocations, the persistence design will need file-locking or transactional writes.
2. If chat histories become very large, whole-file JSON updates may become inefficient.

## Open Questions

1. Whether `current.json` should store only the active chat ID or also include lightweight metadata is still an implementation choice.
2. Whether chat IDs should be timestamp-based, random UUIDs, or user-visible slugs is still an implementation choice.
3. Whether non-`SKILL.md` files in `./agent/skills/` should be ignored silently or treated as configuration errors is still an implementation choice.
