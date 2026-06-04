# Electron Reference UI Plan

## Goal

The Electron app must expose the reference-aligned settings panel behavior while keeping chat execution coherent: theme, right-panel, and verbose-message controls remain renderer concerns, and skills settings become the per-turn contract for which skills are shown to the model and available through `load_skill`.

## Current Context

- `electron/renderer/src/hooks/useDesktopWorkspace.ts` owns renderer state for theme, settings-panel visibility, verbose tool-message visibility, skill scope toggles, per-skill disabled keys, and chat send/resend requests.
- `electron/renderer/src/features/settings/SettingsPanel.tsx` renders the right-panel settings controls, including global/project skills and per-skill switches.
- `electron/main.ts` receives `chat:sendMessage` and `chat:editAndResend` IPC calls, loads workspace prompts and scoped skill inventory, and calls `runChatTurn`.
- `core/agent-files.ts` owns skill inventory loading, skill inventory prompt text, and should own any shared selection logic that must stay consistent across Electron and future host surfaces.
- `core/agent-runtime.ts` creates the `llm-runtime` environment and currently defaults to root-level skill discovery unless a host supplies a narrower runtime skill root list.
- `.docs/reqs/2026/05/31/req-electron-reference-ui.md` now requires settings-panel skills choices to affect chat runtime behavior, replacing the earlier UI-only skill placeholder contract.
- `.docs/tests/test-electron-reference-ui.md` covers the user-facing right-panel/theme/verbose behavior and now records the skills availability scenario as a documented E2E contract. Stable runtime skill filtering is better covered by unit tests because live model tool choices are provider-dependent.

## Decisions

- Keep panel open/collapse, theme preference, and verbose transcript filtering in renderer state because these controls do not require persistence or runtime ownership.
- Pass the current `skillSelection` with each send/resend request instead of introducing backend settings persistence. The chat turn should reflect what the user sees at send time, and no separate storage migration is justified.
- Put skill selection filtering in `core/agent-files.ts`, not only in `electron/main.ts`, so the model-visible skill inventory and runtime `load_skill` roots are derived by one shared policy.
- Derive runtime skill roots from selected skill `sourcePath` values so disabled scopes and individually disabled skills do not leak through a broad default root.
- Keep `runChatTurn` backward-compatible by making filtered `runtimeSkillRoots` optional. CLI behavior should continue using default workspace/global roots.
- Reject new feature flags, environment variables, compatibility modes, skill-install/edit implementation, and provider-specific behavior. They do not solve the settings-panel contract and would widen the change.
- Treat the existing Electron reference UI scenario spec as sufficient E2E documentation. Add unit coverage for the runtime skill filtering edge cases instead of relying on live LLM E2E behavior to prove deterministic filtering.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Inspect `.docs/reqs/2026/05/31/req-electron-reference-ui.md` to confirm the current acceptance criteria include runtime-affecting skills settings, not UI-only placeholders.
- [x] Inspect `electron/renderer/src/hooks/useDesktopWorkspace.ts` to confirm send and edit/resend requests include the current skills settings from the settings panel.
- [x] Inspect `electron/main.ts`, `core/agent-files.ts`, and `core/agent-runtime.ts` to confirm where prompt skill inventory and runtime `load_skill` roots are assembled.
- [x] Record that skill installation, editing, marketplace behavior, backend settings persistence, provider changes, and chat-store changes are non-goals.

### Phase 2 - Foundation changes

- [x] Update `core/agent-files.ts` with a shared skill-selection key helper so renderer-disabled skill keys match main-process filtering semantics.
- [x] Update `core/agent-files.ts` with a settings-based scoped inventory selector so disabled scopes and disabled individual skills are removed before prompt construction.
- [x] Update `core/agent-files.ts` with runtime-root derivation from selected skill `sourcePath` values so the runtime registry can match the selected inventory.
- [x] Update the skill inventory prompt text in `core/agent-files.ts` to state that skill IDs must be loaded through `load_skill` and must not be called directly as tool names.

### Phase 3 - Feature implementation

- [x] Update `core/agent-runtime.ts` so hosts can pass optional `runtimeSkillRoots` while the CLI keeps default runtime roots when no override is provided.
- [x] Update `electron/main.ts` so `loadRuntimeInputs` applies `selectSkillInventoryBySettings` to the request's `skillSelection`.
- [x] Update `electron/main.ts` so `executeRuntimeTurn` passes filtered `runtimeSkillRoots` into `runChatTurn`.
- [x] Confirm `electron/renderer/src/hooks/useDesktopWorkspace.ts` sends `skillSelection` for both new messages and edit/resend requests without adding backend persistence.

### Phase 4 - Tests and verification wiring

- [x] Add unit coverage in `tests/unit/agent-files.test.js` proving disabled global/project scopes and disabled individual skill keys are excluded from selected inventory and runtime roots.
- [x] Add unit coverage in `tests/unit/agent-runtime.test.js` proving host-provided `runtimeSkillRoots` are passed to `llm-runtime` instead of default roots.
- [x] Update `tests/unit/agent-files.test.js` to cover the prompt instruction that skill IDs are not direct tool names.
- [x] Run `npx vitest run tests/unit/agent-files.test.js tests/unit/agent-runtime.test.js` and record passing focused unit evidence.
- [x] Run `npm run check` and record build/syntax/typecheck evidence.
- [x] Run `npm run electron:main:build` and record Electron main build evidence.
- [x] Run `npm run test:unit` and record full unit suite evidence.

### Phase 5 - Documentation and status

- [x] Update `.docs/reqs/2026/05/31/req-electron-reference-ui.md` so it no longer claims skills controls are UI-only.
- [x] Update `.docs/tests/test-electron-reference-ui.md` so the skills scenario describes settings-driven chat skill availability.
- [x] Update `.docs/plans/2026/05/31/plan-electron-reference-ui.md` so the AP contains Goal, Current Context, Decisions, Phased Tasks, Validation, and Rollback / Risk.
- [x] Record final verification evidence showing the settings-panel skill choices control both prompt inventory and runtime `load_skill` availability.

## Validation

- Focused unit command: `npx vitest run tests/unit/agent-files.test.js tests/unit/agent-runtime.test.js`.
  Evidence: passed with 2 test files and 32 tests.
- Repository check command: `npm run check`.
  Evidence: passed; core and CLI builds completed and configured syntax checks passed.
- Electron main build command: `npm run electron:main:build`.
  Evidence: passed; Electron TypeScript and bundled main process build completed.
- Full unit command: `npm run test:unit`.
  Evidence: passed with 12 test files and 121 tests.
- E2E decision: keep `.docs/tests/test-electron-reference-ui.md` as the human-readable scenario spec. Do not add a live LLM E2E test for skill filtering because deterministic availability is a host/runtime contract and live tool choice would make the check provider-dependent.

## Rollback / Risk

- Risk: deriving roots from individual selected skill paths can expose sibling skills if the runtime treats a directory as a recursive root. Mitigation: use each selected skill directory, not the broad workspace skills root, and keep unit coverage around disabled skill exclusion.
- Risk: prompt inventory and runtime roots can drift if selection logic is duplicated. Mitigation: keep filtering and runtime-root derivation in `core/agent-files.ts` and call it from Electron main.
- Risk: Electron settings state is not persisted. This is intentional for this requirement; adding persistence would create a new storage contract outside the requested behavior.
- Risk: CLI behavior could change if filtered roots became mandatory. Mitigation: `runtimeSkillRoots` remains optional and CLI continues to use `buildRuntimeSkillRoots()`.
- Rollback: revert the core selection helpers, Electron main wiring, runtime optional root override, related tests, and RPD doc updates together. The renderer can keep displaying skills settings, but without runtime wiring it would return to the older UI-only contract and the requirement would need to say that explicitly.

## Architecture Review

AR passed: no blocking architecture flaws. The plan now covers each acceptance point with dependency-ordered phases, keeps non-goals explicit, avoids new persistence or feature flags, and gives deterministic validation for the runtime skill-filtering contract.

## Verification Review

VR passed: the requirement, plan, scenario spec, implementation code, and verification evidence now agree. The settings panel skill choices are sent with chat turns, filtered once through shared core policy, used for both prompt inventory and runtime `load_skill` roots, and covered by focused unit tests plus full repository verification.
