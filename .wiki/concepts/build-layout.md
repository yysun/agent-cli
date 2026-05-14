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
updated_at: "2026-05-16"
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
- `bin/server.js` is the built relay server people run when they want browser pairing.
- `bin/public` is the built browser app.
- `core/*.js` are the generated JavaScript files produced from the shared TypeScript code in `core`.

## Why The Layout Matters

The cleanup on 2026-05-14 removed duplicate JavaScript copies from the repo root and made these folders the clear home for the real code. That makes it much easier for a newcomer to tell the difference between files they should edit, files the build creates for them, and files users actually launch.

[[bin-agent-cli-js]], [[server-src-relay-server-ts]], and [[web-src-app-tsx]] describe the runtime behavior behind those outputs.