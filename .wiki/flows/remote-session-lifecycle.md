---
title: "Remote Session Lifecycle"
type: "flow"
status: "active"
language: "default"
source_paths:
  - "cli/src/agent-cli.ts"
  - "core/remote-control.ts"
  - "core/relay-client.ts"
  - "core/world-store.ts"
  - "server/src/relay-server.ts"
  - "tests/e2e/agent-cli-remote.e2e.test.js"
  - ".docs/done/2026/05/11/remote-control-relay.md"
  - ".docs/done/2026/05/13/pure-relay-slash-commands.md"
updated_at: "2026-05-16"
---

# Remote Session Lifecycle

This is the path for `agent-cli --remote`. In plain terms, it shows how a local terminal session becomes a browser-guided session without moving the real work off the machine.

1. The CLI picks the workspace folder, loads the allowed `.env` keys, and requires `AGENT_CLI_RELAY_SERVER_URL` so it knows which relay server to use.
2. It checks `.agent-world/remote-host.lock.json` so two remote hosts do not try to control the same workspace at once.
3. It creates or loads the active chat, then opens a relay session through the relay client.
4. It saves the remote-session details locally and prints a client connection URL for pairing.
5. A browser pairs with the relay using the one-time token and starts reading shared events over SSE, a live event stream from server to browser.
6. The browser sends remote input. Normal text becomes a normal turn. Slash commands such as `/chats`, `/messages <chatId>`, `/new`, and `/use <chatId>` are handled locally by the host.
7. Shared events such as assistant output, status changes, approvals, completion, failure, and disconnect are sent to every paired client.
8. Slash-command replies meant for only one browser are sent back as `command_result` or `command_error` events.
9. On shutdown or disconnect, the host closes the relay session and releases the local remote lock.

## Why Slash Commands Matter

The relay is intentionally just the messenger. It does not decide which chat should be active. The local host does, because the host is the only side that can safely read and change `.agent-world`.

That split is one of the key ideas behind [[local-first-remote-supervision]].
