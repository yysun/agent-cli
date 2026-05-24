# Minimal Desktop Shell Requirement

## Problem

Agent CLI has a browser relay UI, but no desktop application entry point. Porting the full legacy Agent World Electron app would drag in an incompatible runtime, storage model, and broad IPC surface. The immediate need is smaller: a local desktop shell that can launch the existing web experience without pretending old desktop parity exists.

## Requirement

Add a minimal Electron desktop app to this project with its own renderer under `electron/renderer`.

The shell must:

- Start as an Electron app from the repository.
- Load the Electron-owned renderer from `electron/renderer/index.html`.
- Avoid depending on the existing `web` app or its Vite dev server.
- Use a preload bridge with a tiny, explicit desktop metadata surface.
- Keep Node integration disabled and context isolation enabled.
- Add npm scripts for Electron development, build, start, and distributable-directory packaging.
- Keep the implementation separate from the legacy `../agent-world/electron` app.

## Acceptance Criteria

- `npm run electron:build` compiles Electron main and preload code.
- `npm run electron:start` launches the shell against the Electron-owned renderer.
- `npm run electron:dev` launches without requiring a separate web dev server.
- The renderer can read basic desktop metadata without direct Node access.
- Existing CLI/server/web build behavior remains intact.

## Non-Goals

- No full legacy Agent World desktop UI port.
- No reuse of the existing `web` app as the Electron renderer.
- No old `agent-world/core` import compatibility layer.
- No SQLite storage or `AGENT_WORLD_*` runtime migration.
- No auto-updater.
- No desktop-specific chat/runtime IPC beyond the metadata bridge.
