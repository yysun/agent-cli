# AP: upgrade-built-in-prompt

- Story slug: `upgrade-built-in-prompt`
- Created: `2026-05-16`
- [x] Implemented
- Related requirement: `./.docs/reqs/2026/05/16/req-upgrade-built-in-prompt.md`
- Related test spec: none required for this internal prompt update

## Goal

Upgrade Agent CLI's built-in prompt content using the stronger operational guidance from ai-workspace's server/runtime prompt, while preserving Agent CLI's existing layered prompt assembly.

## Assumptions

1. The only required source change may be `core/agent-files.ts` if the layering logic in `core/runtime-client.ts` already matches the desired model.
2. Existing unit tests in `tests/unit/agent-files.test.js` are the primary validation surface for the built-in prompt helper.
3. A small runtime-client test may be added only if prompt layering needs direct verification.
4. No E2E coverage is needed because this is an internal instruction-content change.

## Key Design Decisions

1. Keep the current layering model unchanged:
   - built-in prompt from `getBuiltInSystemPrompt()`
   - optional workspace prompt from `AGENTS.md`
   - optional skill inventory hint
2. Port instruction themes from ai-workspace, not a verbatim prompt copy.
3. Keep the built-in prompt concise enough for Agent CLI, but materially stronger than the current three-line prompt.
4. Avoid changing runtime orchestration, tool execution, or persisted state.

## Architecture Review

1. Agent CLI already has the correct layering boundary in `core/runtime-client.ts`; changing that boundary would be unnecessary scope.
2. The right adaptation point is `DEFAULT_SYSTEM_PROMPT` in `core/agent-files.ts` because that is the built-in instruction source.
3. Copying ai-workspace's exact composed prompt would be a design mistake because ai-workspace concatenates `AGENTS.md` into one prompt string, while Agent CLI already has a cleaner layered assembly.
4. No blocking architecture flaws were found for a prompt-content-only change.

## File-Level Plan

1. Update `core/agent-files.ts`.
   - Expand `DEFAULT_SYSTEM_PROMPT` with workspace-evidence, tool-usage, `load_skill`, and secret-handling guidance adapted from ai-workspace.
   - Preserve the file's existing exports and layering responsibilities.
2. Update `tests/unit/agent-files.test.js`.
   - Add assertions that the built-in prompt contains the intended stronger guidance.
   - Preserve existing tests that built-in and workspace prompt sources remain separate.
3. Update docs/status.
   - Mark the plan complete after implementation and verification.
   - Add a done doc after verification succeeds.

## Implementation Tasks

- [x] Inspect relevant files
- [x] Make focused changes
- [x] Run validation
- [x] Update docs/status

## Validation Strategy

1. Run the narrowest build or type-safe verification needed for the touched files.
2. Run focused unit tests for `tests/unit/agent-files.test.js`.
3. If a runtime-client test is added, run that file too.

## Risks

1. Over-copying ai-workspace's prompt could make Agent CLI's built-in prompt unnecessarily long or server-specific.
2. If tests assert exact full prompt text, they may become brittle; assertions should focus on the required instruction themes.
3. Changing prompt content can shift model behavior in ways that unit tests cannot fully capture, so the change should stay limited and intentional.
