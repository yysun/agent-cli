# Electron Startup Sequence Plan

## Approach

Add a small Electron-main preference file for the last selected workspace path, resolve that path before workspace preparation, and reuse the existing workspace environment and `world.json` summary helpers. Extend the preload/renderer workspace response shape so the sidebar can render optional world metadata in the existing workspace summary card.

```mermaid
flowchart TD
  Start[Electron starts] --> Restore[Read last workspace path]
  Restore --> Prepare[prepareWorkspaceEnvironment(workspace)]
  Prepare --> Env[Load workspace .env]
  Env --> Storage[Ensure .agent-world storage]
  Storage --> Summary[Read optional .agent-world/world.json]
  Summary --> Renderer[Return workspace state over IPC]
  Renderer --> Sidebar[Show world summary in left panel]
  Sidebar --> Turn[Runtime turns use active workspace]
```

## Tasks

- [x] Inspect relevant files
- [x] Make focused changes
- [x] Run validation
- [x] Update docs/status

## Validation

- `npm run electron:build` passed.
- Unit tests passed: 104 tests via targeted unit test run.
- `npm run electron:renderer:check` passed after the final review cleanup.

## Implementation Notes

- Store the Electron-only last workspace path under `app.getPath('userData')` so it survives app restarts without writing into the project.
- Keep explicit `workspaceRoot` IPC request values higher precedence than the restored path.
- Persist a workspace path only after `prepareElectronWorkspace` succeeds.
- Load `.agent-world/world.json` after workspace preparation so `AGENT_WORLD_CONFIG_PATH` points at the active workspace.
- Load workspace chat state through `loadRequestedChat({ newChat: false })` so Electron honors `.agent-world/chats/current.json` on startup.
- Convert invalid `world.json` parse errors into a response warning so startup can still display chats.
- Hide the left-panel ready status chip unless `world.json` metadata or an invalid-JSON warning is present.
- Derive the left-panel workspace summary card title from the selected workspace folder name.
- Derive the main header title from the selected workspace folder name.
- Render explicit workflow type and agent count facts in the left-panel workspace summary when `world.json` exists.
- Replace the old Skills/UI workspace stat with the active `world.json` workflow type.
- Resolve provider/model after workspace `.env` loading and display them in the left-panel workspace summary.
- Render compact `world.json` agent badges in the header strip when agent labels are available.
- Hide the header agent strip when no `world.json` agent labels are available, while retaining the default badge and animation styles for future reuse.
- Pin header grid regions so view/settings actions stay in the right column and world agents stay in the center column.
- Do not instantiate a separate runtime during app boot; `runChatTurn` already creates the runtime from the current workspace environment when a message is sent.

## E2E Decision

No separate E2E spec is required. This is an Electron startup and IPC data-shape change with no external provider call required; focused TypeScript/build validation plus targeted unit coverage for startup helpers is sufficient.

## Architecture Review

AR passed: no blocking architecture flaws. The main tradeoff is where to persist the last workspace path; Electron `userData` keeps app preference state outside workspace storage and avoids changing the project `.agent-world` layout.

## Code Review

CR passed: no blocking code flaws found. One trailing-newline cleanup was applied and the renderer typecheck was rerun successfully.