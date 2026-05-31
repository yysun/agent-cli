# Electron Startup Sequence Requirement

## Requirement

The Electron app startup flow must restore the last persisted workspace path before loading workspace-local runtime inputs. Startup must prepare the selected workspace, load its `.env`, and keep Agent CLI runtime setup based on that workspace. If the selected workspace contains `.agent-world/world.json`, the renderer must show a compact world summary in the left panel workspace summary section.

## Acceptance Criteria

- Electron startup restores the last workspace path selected in a previous app session when available.
- The restored workspace path is applied before workspace `.env` loading and storage setup.
- Workspace `.env` values are read from the restored or selected workspace path.
- Agent runtime turns are created from the active workspace environment, prompts, and skills.
- Selecting a new workspace persists that workspace path for future Electron startups.
- Electron workspace IPC responses include optional `.agent-world/world.json` startup summary metadata.
- Electron workspace startup loads the selected chat through `.agent-world/chats/current.json` and hydrates that chat in the renderer.
- Missing `.agent-world/world.json` is treated as normal and does not block startup.
- Invalid `.agent-world/world.json` reports a clear warning-like status without blocking workspace chat loading.
- The left panel workspace summary section displays the `world.json` workflow type and number of agents when the file exists.
- The left panel workspace stats replace the old Skills/UI text with the `world.json` workflow type.
- The left panel workspace summary displays the active runtime provider and model resolved from the workspace environment.
- The left panel workspace summary card title uses the selected workspace folder name instead of a hard-coded product name.
- The main header title uses the selected workspace folder name instead of a hard-coded product name.
- The left panel ready status chip is shown only when `./.agent-world/world.json` exists.
- The left panel may also display compact agent labels when available.
- The header agent strip displays agents loaded from `world.json` when available, falling back to the runtime badges when no world agents exist.
- The header agent strip is hidden when `world.json` does not exist or provides no agents; existing default badge and animation styling is retained for future use.
- Header view/settings buttons stay right-aligned while the `world.json` agent list stays center-aligned.
- The change keeps context isolation and the narrow preload bridge intact.

## Non-Goals

- No schema validation for `world.json`.
- No runtime defaults from `world.json`.
- No persisted agent/world registry revival.
- No redesign of the chat transcript or composer.