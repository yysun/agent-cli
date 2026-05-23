# Requirement: Agent World Runtime Boundary

## Problem

The world runtime now behaves like a core product API, but it still lives under `cli/src`. That location makes the boundary muddy: shell code, terminal HITL UI, and world-domain runtime code appear to have the same ownership.

That is the wrong shape. `agent-world-cli` is one UI over the world runtime, not the owner of the runtime. At the same time, `ask_user_input` / `ask_human_input` must stay in the final UI layer. Moving runtime code to core must not smuggle terminal prompting into core.

## Requirements

- Move the Agent World runtime implementation from `cli/src` to `core`.
- Keep `agent-world-cli` as the shell/UI layer under `cli/src`.
- Keep `human-input-ui` under `cli/src`; it is terminal UI, not runtime or server policy.
- Keep `agent-runtime` under `cli/src` because it is the terminal turn adapter for `agent-cli`.
- Ensure `core/agent-world-runtime.ts` does not import `human-input-ui`, readline, stdout/stderr UI helpers, or other terminal shell modules.
- Preserve the existing world runtime API: world, agents, chats, messages, queue, events, and generic tool-call handler plumbing.
- Preserve `agent-world-cli` behavior, including interactive mode, HITL prompt handling, edit/delete commands, and provider-free queue commands.
- Update imports, generated output, tests, syntax checks, and docs so `core/agent-world-runtime` is the canonical runtime module.
- Do not change `.agent-world` storage layout.
- Do not move `agent-runtime` unless it is first split into UI-free core logic and terminal adapter logic.

## Acceptance Criteria

- `core/agent-world-runtime.ts` exists and exports the world runtime implementation.
- No source or test imports `cli/src/agent-world-runtime.ts`.
- `agent-world-cli` imports the runtime from `../../core/agent-world-runtime.js`.
- `core/agent-world-runtime.ts` has no import from `cli/src/human-input-ui`.
- `human-input-ui` remains consumed by CLI/shell code only.
- `npm run build` succeeds and emits `core/agent-world-runtime.js`.
- Unit and E2E coverage for `agent-world-cli` and world runtime still pass.

## Non-Goals

- Do not redesign `runChatTurn`.
- Do not move `agent-runtime` wholesale into core.
- Do not introduce server-side HITL handling.
- Do not change live provider behavior or the world storage format.
