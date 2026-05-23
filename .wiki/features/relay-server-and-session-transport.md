---
title: "Relay Server And Session Transport"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "server/src/relay-server.ts"
  - "server/src/relay-server-cli.ts"
  - "README.md"
  - "tests/e2e/relay-server.e2e.test.js"
  - ".docs/done/2026/05/11/remote-control-relay.md"
updated_at: "2026-05-16"
---

# Relay Server And Session Transport

The relay server is the optional middleman between a long-running local host and one or more paired browser clients.

## What It Owns

- session creation and expiry
- desktop, browser, and one-time pairing keys
- command queues
- event backlog and SSE delivery, where SSE means a one-way live update stream from server to browser
- notification summaries
- session shutdown and disconnect cleanup

All of that state lives only in memory. The relay does not save chat history or agent state to disk.

## Network Behavior

The server can listen only on the local machine, or it can listen on LAN-visible addresses such as `0.0.0.0` and `::`. When it is listening for LAN access and `bin/public/index.html` exists, it also serves the built browser app from `bin/public`.

The startup wrapper in `server/src/relay-server-cli.ts` makes sure the built `bin/server.js` file can still find the built web files after bundling.

## Remote Reliability Features

- heartbeat messages and reconnect hints for the browser's live event stream
- resume support through `Last-Event-ID`, which lets the browser continue from its last seen event
- bounded in-memory queues so sessions do not grow forever
- multi-client pairing with both requester-only and shared event delivery

Those features are what make [[remote-session-lifecycle]] practical in a browser instead of only in a local terminal.
