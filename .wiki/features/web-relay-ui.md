---
title: "Web Relay UI"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "web/src/App.tsx"
  - "web/src/relay-api.ts"
  - "web/src/relay-session.ts"
  - "README.md"
  - ".docs/done/2026/05/13/pure-relay-slash-commands.md"
updated_at: "2026-05-16"
---

# Web Relay UI

The web app is the browser side of a local `agent-cli --remote` session. It lets someone watch and guide the local run from a browser, but it is not a second copy of the agent.

## Main Jobs

- parse the invite URL or saved session details
- pair with the relay and keep the browser token in local storage
- show shared events in a chat-style transcript
- send normal text input and slash-command-backed chat actions
- render approval requests and session status updates inline

## Session Restore

The app can reopen a previous paired session, read older events it missed, and reconnect to the live event stream after refresh. That makes the browser easy to close and reopen without forcing the local host to restart.

## Chat Management

The sidebar actions use the same remote input path as regular prompts. Under the hood they send slash commands like `/chats`, `/new`, and `/use <chatId>`, then apply the reply only to the browser that asked for it.

That keeps the browser-side contract simple and leaves chat control with the host described in [[remote-session-lifecycle]].
