# REQ: conversation-prompt-order

- Story slug: `conversation-prompt-order`
- Created: `2026-05-11`
- Status: Implemented

## Summary

Adjust Agent CLI conversation assembly so the built-in system prompt, project `AGENTS.md` content, and tools/skills context are added in that order as `system` role messages before the user's input is added as a `user` role message.

## Problem

The current runtime behavior does not explicitly guarantee the requested prompt layering order of built-in system instructions, repository `AGENTS.md` instructions, and tools/skills context ahead of the user message. The requirement is to make that ordering explicit whenever the current project root contains `AGENTS.md`.

## Requirements

1. The CLI must always include the built-in system prompt in the model conversation context.
2. If the current project root contains a readable, non-empty `AGENTS.md`, the CLI must read it and include its content in the model conversation context.
3. When `AGENTS.md` content is included, it must be placed after the built-in system prompt.
4. Tools/skills context must be placed after the built-in system prompt and after `AGENTS.md` content when `AGENTS.md` is present.
5. The built-in system prompt, `AGENTS.md` content, and tools/skills context must each be added as `system` role content.
6. The current user input must be added after those `system` role messages as a `user` role message.
7. If `AGENTS.md` is missing or empty, the CLI must still include the built-in system prompt first and continue without failing.
8. Existing persisted chat history behavior must remain unchanged apart from the prompt/context ordering described above.

## Non-Goals

1. Changing how chat transcripts are persisted is not required.
2. Changing skill discovery rules is not required.
3. Changing tool execution behavior is not required.

## Acceptance Criteria

1. Given a project root with `AGENTS.md`, the model message list begins with the built-in system prompt.
2. Given a project root with `AGENTS.md`, the next `system` role content contains the contents of `AGENTS.md`.
3. Given available tools/skills context, that context appears after the built-in prompt and `AGENTS.md` content as `system` role content.
4. The user's input appears after all applicable `system` role messages as a `user` role message.
5. Given a project root without `AGENTS.md`, the model message list still begins with the built-in system prompt and continues without error.

## Open Questions

1. For this scope, tools/skills context is treated as a single combined `system` message so the implementation can remain aligned with the current runtime shape and minimize behavioral drift.