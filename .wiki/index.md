---
title: "Project Wiki"
type: "index"
status: "active"
language: "default"
last_commit: "c499c2e4ccb9df8cef187ba625f5ff165e02cf93"
updated_at: "2026-05-23"
---

# Agent CLI Wiki

Agent CLI is a command-line chat tool that runs on your machine. It can also open an optional browser companion through a small relay server, while still keeping files, tools, and saved history local in `.agent-world/`.

## Start Here

- [[storage-layout]] explains where the app keeps chats, agent state, and the remote lock.
- [[configuration-and-runtime-precedence]] explains which settings win and what `.env` is still allowed to do.
- [[chat-turn-lifecycle]] walks through a normal local prompt from command line to saved reply.
- [[auto-interactive-mode]] explains why no-message CLI runs now open a terminal prompt instead of failing.
- [[cli-input-ui]] explains the TTY pending animation and terminal-native `ask_user_input` flow.
- [[named-agent-selection]] explains how `--agent-id` and `--new-agent` select per-agent runtime state.
- [[remote-session-lifecycle]] shows how `agent-cli --remote` pairs a local host with browser clients.
- [[local-first-remote-supervision]] explains what remote mode can and cannot move off the local machine.

## Core Pages

- [[bin-agent-cli-js]] covers the front door of the CLI, including one-shot, interactive, and remote host modes.
- [[lib-agent-config-js]] covers how the app turns file settings and flags into one clean runtime config.
- [[lib-agent-files-js]] covers the built-in prompt, `AGENTS.md`, and skill discovery.
- [[lib-runtime-client-js]] covers the handoff into the shared model runner and tool context.
- [[cli-src-tool-trace-renderer-ts]] covers compact verbose tool-call and tool-result rendering.
- [[lib-session-store-js]] covers how `.agent-world` is created, how chats are saved, and how remote-host locking works.
- [[server-src-relay-server-ts]] covers the small relay server that links the local host to browser clients.
- [[web-src-app-tsx]] covers the browser UI for pairing, watching output, and sending chat commands.

## Concepts And Flows

- [[build-layout]] maps the editable source folders to the files users actually run.
- [[testing-strategy]] summarizes the default validation path and the optional live-provider suite.
- [[agent-world-storage-migration]] captures the recent move into `.agent-world` and the bugs it fixed.

## Coverage Notes

This wiki was refreshed from tracked repository files at `HEAD`, including `README.md`, `package.json`, `AGENTS.md`, `runtime.json`, the active TypeScript sources, the relay and remote-host tests, `.gitignore`, and the recent planning and done docs under `.docs/`.

The current coverage is intentionally focused on the big moving parts: where settings come from, where data is saved, how named agents choose runtime config, how no-argument interactive mode works, how terminal input requests are handled, how the browser pairing works, how the `llm-runtime` loop is owned, how verbose traces stay readable, and how the project is verified. The pages lead with plain-English explanations first, then introduce the exact file or code term when it helps.
