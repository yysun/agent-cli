# DD: codex-copilot-convention

- Story slug: `codex-copilot-convention`
- Completed: `2026-05-07`
- Status: Done
- Related requirement: `./.docs/reqs/2026/05/07/req-codex-copilot-convention.md`
- Related plan: `./.docs/plans/2026/05/07/plan-codex-copilot-convention.md`
- Related test spec: `./.docs/tests/test-codex-copilot-convention.md`

## Outcome

Migrated Agent CLI to codex/copilot conventions:
- system prompt loads from `AGENTS.md`
- skills load from `.agents/skills/`
- runtime config no longer reads `agent/config.json`
- chat persistence root moved to `.chats/`
- chat directory layout flattened to `./.chats/{chatId}/`

## Delivered

1. Runtime path migration
- Updated path constants to use `AGENTS.md`, `.agents/skills`, and `.chats`.
- Updated chat artifact layout to store chat files directly under `./.chats/{chatId}/`.
- Updated prompt/skills/session modules and comments to match new conventions.

2. Runtime configuration source migration
- Removed config-file loading from CLI startup.
- Kept runtime override normalization via CLI flags.
- Preserved environment fallback behavior in runtime validation.

3. Repository file migration
- Added `AGENTS.md`.
- Added `.agents/skills/agent-cli-core/SKILL.md`.
- Added `.env.example`.
- Removed legacy tracked files `agent/system.md` and `agent/skills/agent-cli-core/SKILL.md`.

4. Test and fixture migration
- Updated fixture helpers to write `AGENTS.md` and `.agents/skills`.
- Updated unit and e2e tests to assert `.chats` persistence and new skill/prompt roots.
- Reworked agent-config tests to cover normalization-only behavior.

5. Documentation migration
- Updated README runtime docs and precedence.
- Added references to `.env.example`.
- Updated `.gitignore` to ignore `.chats` and legacy local runtime artifacts under `agent/`.

## Requirement Coverage (REQ)

1. Prompt and skills path migration
- REQ 1-2 satisfied by loading prompt from `AGENTS.md` and skills from `.agents/skills/`.

2. Runtime config source and precedence
- REQ 3-5 satisfied by retiring `agent/config.json` loading, keeping CLI flags, and preserving environment fallback.

3. Environment template
- REQ 6 satisfied via `./.env.example` documenting provider/runtime variables.

4. Chat storage migration
- REQ 7-9 satisfied by storing sessions under `.chats/`, including `current.json` and per-chat files in `./.chats/{chatId}/`.

5. Documentation alignment
- REQ 10 satisfied by updating README and project docs to the new conventions.

## Plan Coverage (AP)

1. Phase 1: Core paths and loaders
- Completed via path constant migration and prompt/skill loader updates.

2. Phase 2: Retire config.json runtime source
- Completed by removing runtime config-file loading from CLI startup and preserving override normalization.

3. Phase 3: Move persistence to `.chats`
- Completed by session-store path migration and flattening chat artifacts to `./.chats/{chatId}/`.

4. Phase 4: Docs and onboarding
- Completed by README, `.env.example`, `.gitignore`, and `.docs` updates.

5. Phase 5: Validation
- Completed by passing syntax, unit, and e2e test runs.

## Verification

Executed on `2026-05-07`:

1. `npm run test:unit`
2. `npm test`
3. `rg -n "agent/config\\.json|agent/system\\.md|agent/skills|agent/sessions" -- README.md bin lib tests AGENTS.md .env.example .gitignore`

Observed result:
- Unit suite: passed.
- Full suite (syntax + unit + e2e): passed.
- Legacy path scan in active code/docs/tests: no matches.
