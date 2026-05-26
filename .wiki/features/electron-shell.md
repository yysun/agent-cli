---
title: "Electron Shell"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "electron/main.ts"
  - "electron/preload.cts"
  - "electron/renderer/index.html"
  - "electron/renderer/renderer.js"
  - "electron/renderer/styles.css"
  - "electron/tsconfig.json"
  - "electron-builder.json"
  - "package.json"
updated_at: "2026-05-26"
---

# Electron Shell

The Electron app is the kept desktop surface. It is local-first: the renderer talks to the main process, and the main process calls the same core runtime and chat store used by the CLI.

## Main Process Jobs

`electron/main.ts`:

- opens `electron/renderer/index.html`
- keeps context isolation enabled
- exposes workspace and chat IPC handlers
- prepares the selected workspace before storage or runtime calls
- loads runtime inputs from `.env`, `AGENTS.md`, and skill inventory
- calls `runChatTurn()` for sends and edit/resend operations
- persists completed messages through [[chat-store]]
- sends external links to the operating system browser

## Renderer Boundary

The renderer is Electron-owned HTML/CSS/JS, not the old Vite web app. It is a local UI over workspace, chat, and message IPC handlers.

## Why It Matters

Electron gives the project a desktop shell without reintroducing the deleted relay/web product. The important invariant is that desktop actions still write the same `.agent-world/chats` files and use the same runtime path as `agent-cli`.
