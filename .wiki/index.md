---
title: "Project Wiki"
type: "index"
status: "active"
language: "default"
last_commit: "10a954f16dd06ee63b17ce7d1f71d43d51d53490"
updated_at: "2026-05-16"
---

# Agent CLI Wiki

Agent CLI is a command-line chat tool that runs on your machine. It can also open an optional browser companion through a small relay server, while still keeping files, tools, and saved history local in `.agent-world/`.

## Start Here

- [[storage-layout]] explains where the app keeps chats, agent state, and the remote lock.
- [[configuration-and-runtime-precedence]] explains which settings win and what `.env` is still allowed to do.
- [[chat-turn-lifecycle]] walks through a normal local prompt from command line to saved reply.
- [[remote-session-lifecycle]] shows how `agent-cli --remote` pairs a local host with browser clients.
- [[local-first-remote-supervision]] explains what remote mode can and cannot move off the local machine.

## Core Pages

- [[bin-agent-cli-js]] covers the front door of the CLI and the two main run modes.
- [[lib-agent-config-js]] covers how the app turns file settings and flags into one clean runtime config.
- [[lib-agent-files-js]] covers the built-in prompt, `AGENTS.md`, and skill discovery.
- [[lib-runtime-client-js]] covers the handoff into the shared model runner and tool context.
- [[lib-session-store-js]] covers how `.agent-world` is created, how chats are saved, and how remote-host locking works.
- [[server-src-relay-server-ts]] covers the small relay server that links the local host to browser clients.
- [[web-src-app-tsx]] covers the browser UI for pairing, watching output, and sending chat commands.

## Concepts And Flows

- [[build-layout]] maps the editable source folders to the files users actually run.
- [[testing-strategy]] summarizes the default validation path and the optional live-provider suite.
- [[agent-world-storage-migration]] captures the recent move into `.agent-world` and the bugs it fixed.

## Coverage Notes

This wiki was refreshed from tracked repository files at `HEAD`, including `README.md`, `package.json`, `AGENTS.md`, `runtime.json`, the active TypeScript sources, the relay and remote-host tests, `.gitignore`, and the recent done docs under `.docs/done/`.

The current coverage is intentionally focused on the big moving parts: where settings come from, where data is saved, how the browser pairing works, and how the project is verified. The pages now lead with plain-English explanations first, then introduce the exact file or code term when it helps.