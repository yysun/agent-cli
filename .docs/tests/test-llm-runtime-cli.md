# AT: llm-runtime-cli

- Status: Superseded
- Superseded by: `./.docs/tests/test-codex-copilot-convention.md`

## Supersession Note

This test spec targets the original `./agent/*` layout and is retained for historical context.
Use `test-codex-copilot-convention.md` for current path/configuration expectations.

## Goal

Validate that the Agent CLI follows the `llm-runtime` convention for prompt and skill loading, persists chat sessions, and routes each invocation into the current chat unless `--new-chat` is requested.

## Preconditions

1. Dependencies are installed with `npm install`.
2. `./agent/system.md` exists.
3. `./agent/skills/` exists.
4. At least one skill is represented as `./agent/skills/<skill-folder>/SKILL.md` with `name` and `description` front matter.
5. Provider configuration is available through environment variables such as `LLM_PROVIDER`, `LLM_MODEL`, and the matching provider API key variables; the e2e suite is live-only and should fail fast if no usable provider is configured.

## Scenarios

1. Missing message fails clearly.
   Expected: Running the CLI without a message exits non-zero and prints a usage error to stderr.

2. Missing system prompt fails clearly.
   Expected: If `./agent/system.md` is absent, the CLI exits non-zero and explains that the system prompt file is missing.

3. Missing skills root fails clearly.
   Expected: If `./agent/skills/` is absent, the CLI exits non-zero and explains that the skill root is missing.

4. Empty skills root is accepted.
   Expected: If `./agent/skills/` exists but contains no `SKILL.md` files, the CLI still runs and does not fail during skill inventory.

5. `--new-chat` creates and selects a new chat.
   Steps: Run the CLI with `--new-chat "first message"`.
   Expected: A new chat file is written under `./agent/sessions/chats/`, `./agent/sessions/current.json` points at that chat, and the assistant response is printed.

6. Current chat is reused on the next invocation.
   Steps: Run the CLI with `--new-chat "first message"`, then run it again with `"follow-up message"`.
   Expected: The second run appends to the same chat ID and persists both turns in order.

7. Missing current chat without `--new-chat` fails clearly.
   Steps: Remove `./agent/sessions/current.json` and run the CLI with a message but without `--new-chat`.
   Expected: The CLI exits non-zero and instructs the operator to start a new chat.

8. Skill inventory follows `llm-runtime` convention.
   Steps: Place multiple nested `SKILL.md` files under `./agent/skills/`.
   Expected: The CLI inventories them deterministically by lexical path and exposes them to the model through the `load_skill` built-in flow.

9. Chat persistence excludes hardcoded prompt duplication.
   Expected: Persisted chat files contain conversation messages and any tool-result messages from the skill-loading loop, but future runs still read the current system prompt from `./agent/system.md` instead of persisting it into the session file.

10. Assistant response is persisted only after a successful turn.
   Expected: If the model invocation fails before a final assistant response is produced, the chat file is not partially updated with a half-finished turn.