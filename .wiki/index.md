---
title: "Project Wiki"
type: "index"
status: "active"
language: "default"
last_commit: "ce93207529f3206c6306d9195f96a4236d57fca9"
updated_at: "2026-05-26"
---

# Agent CLI Wiki

## What is this?

Agent CLI is a local-first command-line chat workspace with a minimal Electron shell. The supported product is intentionally narrow: one `agent-cli` binary, provider/runtime integration through `llm-runtime`, prompts and skills from the selected workspace, and durable chat state under `.agent-world/chats`.

The old relay server, web app, `agent-world-cli`, worlds, persisted agents, queues, and remote host mode are gone. Start with [[cli-entry-and-host-modes]], [[chat-turn-lifecycle]], [[chat-store]], and [[storage-layout]].

## Get started

Run a local turn with `npm run agent-cli -- "Summarize this workspace"`. Run `npm run agent-cli -- --new-chat "Map my next move"` to force a fresh chat, or omit the message with `npm run agent-cli --` to enter the interactive terminal prompt.

You need provider credentials in the shell or invocation cwd `.env`. Runtime defaults can also come from `.env`: provider, model, temperature, max tokens, permissions, history count, streaming, stream trace, web search, and `AGENT_CLI_GLOBAL_SKILLS`. A successful local run streams or prints assistant output and writes chat files under `.agent-world/chats/{chatId}`.

First read `README.md`, `package.json`, `cli/src/agent-cli.ts`, `cli/src/turn-executor.ts`, `core/chat-store.ts`, `core/workspace-environment.ts`, and `core/agent-files.ts`. A safe first change is adding a focused unit test around CLI parsing, chat persistence, or env loading. A tempting dangerous change is bringing back worlds, agents, relay/web paths, or `.chats` compatibility.

## Why does it exist?

The project is trying to make an AI work session feel like local software, not a remote black box. The current design removes the old side products and keeps the useful core: local execution, local tools, local prompts, local chat storage, and a desktop shell that talks to the same runtime.

The tradeoff is deliberate. The product has less surface area, but fewer stale promises. Deleted surfaces are documented as stale pages, not current architecture: [[agent-world-cli]], [[agent-world-runtime]], [[remote-session-lifecycle]], [[relay-server-and-session-transport]], and [[web-relay-ui]].

## What happens when I run it?

`agent-cli` parses flags, resolves the workspace root, loads allowed `.env` keys, creates `.agent-world` under the workspace, loads runtime defaults plus CLI overrides, loads `AGENTS.md` and skill inventory, opens or creates the target chat, then calls the shared model runtime. A completed turn is persisted by [[chat-store]].

If there is no positional message, the same setup path enters [[auto-interactive-mode]]. Interactive commands such as `/new`, `/clear`, `/chats`, and `/use <chatId>` call the same chat-store functions as one-shot turns.

Electron uses `electron/main.ts` as a main-process bridge over the same core runtime and chat store. It is not the old web relay app; it is a local desktop shell. See [[electron-shell]].

## Where is data saved?

The only supported durable app folder is `.agent-world/` under the resolved workspace root:

```text
.agent-world/
  chats/
    current.json
    {chatId}/
      chat.json
      messages.jsonl
      summary.md
      events.jsonl
  skills/
    .../SKILL.md
```

Workspace skills in `.agent-world/skills` always load. Global skills are opt-in with `AGENT_CLI_GLOBAL_SKILLS=true`, which adds `~/.agent-world/skills` and `~/.agents/skills`. Workspace skills override duplicate global skill ids.

There is no supported `.chats`, `.agent-world/worlds`, registry, `world.json`, `agents`, `agent.json`, queue, relay lock, server, or web app storage path.

## What are the important moving parts?

- [[cli-entry-and-host-modes]] covers the `agent-cli` shell.
- [[chat-turn-lifecycle]] covers a user message becoming a saved assistant reply.
- [[chat-store]] covers durable chat files and current-chat selection.
- [[storage-layout]] covers the filesystem contract.
- [[workspace-root-resolution]] covers how the workspace is chosen.
- [[configuration-and-runtime-precedence]] covers `.env`, CLI overrides, and provider validation.
- [[prompt-and-skill-loading]] covers `AGENTS.md`, workspace skills, and opt-in global skills.
- [[model-runner-handoff]] covers `core/agent-runtime.ts` and the `llm-runtime` completion loop.
- [[electron-shell]] covers the local desktop surface.
- [[testing-strategy]] covers the validation shape.

## What should I avoid breaking?

Do not create `.agent-world` under the invocation cwd when `--workspace` points elsewhere. Do not reintroduce `.chats`, worlds, persisted agents, queues, relay/web artifacts, or `agent-world-cli`. Do not make global skills load by default. Do not let generated bundles drift from TypeScript sources. Do not treat `.env` as an unrestricted config import; only allowlisted keys should flow into `process.env`.

The fragile contracts are summarized in [[storage-layout]], [[workspace-root-resolution]], [[configuration-and-runtime-precedence]], [[prompt-and-skill-loading]], and [[build-layout]].

## Where do I look first?

For a normal chat bug, read [[chat-turn-lifecycle]], then `cli/src/agent-cli.ts`, `cli/src/turn-executor.ts`, `core/agent-runtime.ts`, and [[chat-store]]. For root or storage bugs, read [[workspace-root-resolution]], `core/workspace-environment.ts`, `core/paths.ts`, and `core/workspace-store.ts`. For skill loading, read [[prompt-and-skill-loading]] and `core/agent-files.ts`. For desktop behavior, read [[electron-shell]] and `electron/main.ts`.
