# AT: codex-copilot-convention

- Story slug: `codex-copilot-convention`
- Created: `2026-05-07`
- Status: Implemented
- Related requirement: `./.docs/reqs/2026/05/07/req-codex-copilot-convention.md`
- Related plan: `./.docs/plans/2026/05/07/plan-codex-copilot-convention.md`

## Scope

Validate codex/copilot convention migration for prompt path, skill root, runtime configuration source, and chat storage location.

## Scenarios

1. Prompt path migration
- Given repository root contains `AGENTS.md`
- When the CLI runs a turn
- Then runtime prompt loading resolves from `AGENTS.md`

2. Skills root migration
- Given `.agents/skills/<skill>/SKILL.md` exists
- When the CLI runs a turn that can trigger `load_skill`
- Then runtime skill discovery scans `.agents/skills/**/SKILL.md`

3. Runtime config source migration
- Given no `agent/config.json` is used
- When CLI runtime flags are supplied
- Then runtime uses CLI values
- And when flags are omitted runtime falls back to environment values

4. Chat storage migration
- Given a new chat is started
- When the turn completes
- Then current pointer is persisted at `.chats/current.json`
- And chat transcripts are persisted under `.chats/{chatId}/messages.json`
- And optional stream trace is persisted under `.chats/{chatId}/events.json`

5. Legacy path removal
- Given legacy tracked prompt/skills files were under `agent/`
- When migration is applied
- Then active runtime files are `AGENTS.md` and `.agents/skills/...`
- And no runtime code path references `agent/system.md`, `agent/skills`, `agent/config.json`, or `agent/sessions`

## Verification Run

Executed on `2026-05-07`:

1. `npm test`

Observed result:
- Syntax checks passed.
- Unit suite passed.
- E2E suite passed.
