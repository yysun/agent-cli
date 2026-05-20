---
title: "CLI Entry And Host Modes"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "package.json"
  - "bin/agent-cli.js"
  - "cli/src/index.ts"
  - "cli/src/cli-shell.ts"
  - "cli/src/agent-runtime.ts"
  - "cli/src/tool-trace-renderer.ts"
  - "README.md"
  - ".docs/done/2026/05/16/port-trace-renderer.md"
updated_at: "2026-05-20"
---

# CLI Entry And Host Modes

This is the main front door of the app. `bin/agent-cli.js` is the built file that users run, while `cli/src/index.ts` and `cli/src/cli-shell.ts` hold the source code that decides what the CLI should do.

## Main Responsibilities

- read user flags such as `--new-chat`, `--verbose`, `--stream-off`, and setting overrides
- load the allowed `.env` keys from the chosen project folder
- figure out the final settings before starting a turn
- choose between a normal single chat run and the long-running `--remote` host mode
- save chat and remote-session state through [[lib-session-store-js]]

## Local Chat Mode

For a normal run, this layer loads the current chat, prompt files, skills, and final settings, then hands the actual turn to `cli/src/agent-runtime.ts`. The detailed step-by-step path is covered in [[chat-turn-lifecycle]].

## Remote Host Mode

With `--remote`, the CLI becomes a long-running local host. It requires `AGENT_CLI_RELAY_SERVER_URL`, takes the project-level remote lock, creates or loads the active chat, opens a relay session, and keeps serving browser commands until shutdown.

That mode is described in [[remote-session-lifecycle]] and relies on [[server-src-relay-server-ts]] for the transport side.

## Output Rules

- assistant text is the only thing written to stdout in a normal streaming run
- `--verbose` sends diagnostics such as warnings, reasoning, errors, and tool names to stderr
- `--stream-off` suppresses chunked output and prints only the final assistant text

Those output rules are designed so other programs can safely read stdout, while humans can still inspect live details on stderr.

Verbose tool display now goes through [[cli-src-tool-trace-renderer-ts]]. The important boundary is unchanged: stdout remains parseable assistant text, and stderr gets bounded human-readable rows for tool calls and results.
