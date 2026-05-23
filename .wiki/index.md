---
title: "Project Wiki"
type: "index"
status: "active"
language: "default"
last_commit: "aa4bf954d718883fe223706f49535528bf17ea05"
updated_at: "2026-05-23"
---

# Agent CLI Wiki

## What is this?

Agent CLI is a local-first command-line chat workspace. The main `agent-cli` binary runs model turns against the current workspace, saves chats and agent state under `.agent-world/`, and can optionally expose the live local session to a browser through a relay server.

The newer `agent-world-cli` binary is the JSON-first control surface for the same saved world: inspect agents, chats, messages, queues, and send or queue work without inventing another storage layout. Start with [[cli-entry-and-host-modes]], [[agent-world-cli]], and [[world-store]].

## Get started

Run the main chat CLI with `npm run agent-cli -- --new-chat "Summarize this repo"`. Run `npm run agent-cli --` for the interactive terminal prompt. Use `npm run agent-world-cli -- world` when you want a machine-readable snapshot of the saved world.

You need provider credentials in the shell or in the workspace `.env`; `.env` is only for credentials and relay config. `AGENT_CLI_RELAY_SERVER_URL` is required only for `agent-cli --remote`. A successful local run prints assistant text on stdout and writes durable chat state under `.agent-world/chats/{chatId}`.

First read `README.md`, `package.json`, `cli/src/agent-cli.ts`, `cli/src/agent-world-cli.ts`, `core/world-store.ts`, and `core/agent-world-runtime.ts`. A safe first change is adding a focused unit test around argument parsing or world-store behavior. A tempting dangerous change is treating `.env` as a general runtime-config file; that breaks the explicit precedence contract in [[configuration-and-runtime-precedence]].

## Why does it exist?

The project is trying to make an AI work session feel like local software, not a remote black box. The old pressure was scattered runtime state and browser supervision that could become its own control plane. The current design keeps execution, tools, prompts, saved chats, agent memory, queues, and credentials local, while giving the browser only a supervised relay path. See [[local-first-remote-supervision]] and [[agent-world-runtime]].

## What happens when I run it?

`agent-cli` resolves the workspace root, loads allowed `.env` keys, selects an agent, merges runtime config, loads prompts and skills, opens the current chat, then calls the shared model runner. A completed turn is persisted back to `.agent-world`. The full path is [[chat-turn-lifecycle]].

`agent-cli --remote` does the same local setup, takes a remote-host lock, opens a relay session, and serves browser input until shutdown. The relay does transport; the local host still owns chat commands and storage. See [[remote-session-lifecycle]].

`agent-world-cli` opens the same workspace and delegates world, agent, chat, message, queue, and send operations to `core/agent-world-runtime.ts`. Queue-only sends persist local rows without provider calls. See [[agent-world-cli]].

## Where is data saved?

The only supported durable app folder is `.agent-world/`. `world.json` tracks `defaultAgentId` and `currentChatId`; chats live in `.agent-world/chats/{chatId}`; agent metadata, runtime overrides, state, memory, inbox, and event logs live in `.agent-world/agents/{agentId}`; queues live in `.agent-world/queues/{chatId}.json`; the remote lock is `.agent-world/remote-host.lock.json`.

`core/paths.ts` resolves those paths from the workspace root. Prefer `--workspace` and `AGENT_CLI_WORKSPACE`; `--project` and `AGENT_CLI_ROOT` remain compatibility aliases. Details are in [[storage-layout]] and [[workspace-root-resolution]].

## What are the important moving parts?

- [[cli-entry-and-host-modes]] covers the main `agent-cli` shell.
- [[agent-world-cli]] covers the JSON-first world control CLI.
- [[agent-world-runtime]] covers the workspace-local world API, routing, events, memory, and queues.
- [[world-store]] covers durable `.agent-world` persistence.
- [[configuration-and-runtime-precedence]] covers runtime files, agent overrides, flags, and `.env` limits.
- [[prompt-and-skill-loading]] covers `AGENTS.md`, built-in instructions, and `.agent-world/skills`.
- [[model-runner-handoff]] covers the core agent runtime and `llm-runtime` completion loop.
- [[relay-server-and-session-transport]] and [[web-relay-ui]] cover the optional browser path.
- [[testing-strategy]] covers the targeted checks that keep these contracts honest.

## What should I avoid breaking?

Do not reintroduce `.chats`, `.agents`, repo-root generated `core/*.js`, or `.env` runtime defaults. Do not move execution, tools, workspace files, provider keys, saved chats, agent memory, or queue state into the relay. Do not bypass `world.json` for current chat/default agent selection. Do not make `agent-world-cli send --queue` dispatch provider calls. The fragile contracts are summarized in [[storage-layout]], [[configuration-and-runtime-precedence]], [[local-first-remote-supervision]], and [[build-layout]].

## Where do I look first?

For a normal chat bug, read [[chat-turn-lifecycle]], then `cli/src/agent-cli.ts`, `cli/src/agent-runtime.ts`, `core/agent-runtime.ts`, and [[world-store]]. For world API or queue behavior, read [[agent-world-runtime]], [[agent-world-cli]], `core/agent-world-runtime.ts`, and `tests/unit/agent-world-runtime.test.js`. For root resolution or secrets loading, read [[workspace-root-resolution]], `core/workspace-environment.ts`, and `core/paths.ts`. For browser supervision, read [[remote-session-lifecycle]], `core/remote-control.ts`, and `server/src/relay-server.ts`.
