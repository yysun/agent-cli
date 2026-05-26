---
title: "Local-First Remote Supervision"
type: "concept"
status: "stale"
language: "default"
source_paths:
  - "README.md"
  - "core/remote-control.ts"
  - "server/src/relay-server.ts"
  - "server/src/relay-server-cli.ts"
  - ".docs/done/2026/05/11/remote-control-relay.md"
  - ".docs/done/2026/05/13/pure-relay-slash-commands.md"
updated_at: "2026-05-26"
---

# Local-First Remote Supervision

> Stale: remote browser supervision was removed with the relay and web app. The current local-first boundary is CLI plus Electron on the local machine.

Remote mode exists so a browser can watch and guide a local CLI session. It does not move the real work into the relay server.

## What Stays Local

- model execution
- tool execution
- workspace files
- provider credentials and `.env`
- long-term chat and agent persistence

All of that remains on the machine running `agent-cli --remote`.

## What The Relay Actually Does

The relay is a small temporary server that passes messages between the local host and paired browsers. It keeps short-lived session, command, event, and notification lists in memory and exposes HTTP endpoints plus a live update stream called SSE, short for server-sent events.

It carries generic remote input and session events. Chat-specific decisions stay in the local host, especially the slash commands described in [[remote-session-lifecycle]].

## Why This Boundary Matters

This design keeps browser supervision useful without turning the relay into a second brain or a second storage system. That reduces how much can go wrong and makes the privacy story easier to explain to a new reader.

The browser-facing half of this model is described in [[web-relay-ui]], and the transport layer is described in [[relay-server-and-session-transport]].
