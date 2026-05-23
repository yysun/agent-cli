---
title: "Build Layout"
type: "concept"
status: "active"
language: "default"
source_paths:
  - "package.json"
  - "tsconfig.core.json"
  - "tsconfig.cli.json"
  - "tsconfig.server.json"
  - "web/vite.config.ts"
  - ".docs/done/2026/05/14/codebase-structure-cleanup.md"
  - ".docs/done/2026/05/23/agent-world-cli-store-rename.md"
updated_at: "2026-05-23"
---

# Build Layout

This page answers a simple question: which files do developers edit, and which files do users actually run?

## Source Trees

- `cli/src` is where the command-line app starts and where its user-facing flow is controlled.
- `core` holds the shared logic for settings, saved data, model calls, and relay communication.
- `server/src` holds the small relay server and the code that starts it.
- `web/src` holds the browser app that pairs with a remote session.

## Shipped Outputs

- `bin/agent-cli.js` is the built command-line program people run.
- `bin/agent-world-cli.js` is the built JSON-first world control program.
- `bin/server.js` is the built relay server people run when they want browser pairing.
- `bin/public` is the built browser app.

`core` now remains TypeScript source checked with `noEmit`. Generated JavaScript copies beside `core/*.ts` are intentionally ignored and removed from the committed source of truth.

## Why The Layout Matters

The cleanup on 2026-05-14 removed duplicate JavaScript copies from the repo root. The May 23 build update carried that further by keeping `core` source-only and shipping runnable binaries under `bin/`. That makes it much easier for a newcomer to tell the difference between files they should edit, files the build creates for them, and files users actually launch.

[[cli-entry-and-host-modes]], [[agent-world-cli]], [[relay-server-and-session-transport]], and [[web-relay-ui]] describe the runtime behavior behind those outputs.
