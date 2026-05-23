# E2E Spec: Agent World CLI And Store Rename

## Scenario: Help And World Snapshot

1. Run `agent-world-cli help` in a fresh workspace.
2. Confirm the output lists world, agent, chat, message, send, and queue commands.
3. Run `agent-world-cli world`.
4. Confirm the output is JSON and includes `defaultAgentId`, `currentChatId`, `agents`, and `chats`.

## Scenario: Agent And Chat Operations

1. Run `agent-world-cli agents create reviewer --name Reviewer --provider openai --model gpt-5`.
2. Run `agent-world-cli agents list`.
3. Confirm `reviewer` appears without changing the default agent unless `--default` is used.
4. Run `agent-world-cli chats new`.
5. Run `agent-world-cli chats list`.
6. Confirm the new chat appears and can be selected with `agent-world-cli chats use <chatId>`.

## Scenario: Provider-Free Queued Send

1. Create or select a chat.
2. Run `agent-world-cli send --queue --chat <chatId> @reviewer check this`.
3. Confirm the command prints a queued result with `queued: true`.
4. Run `agent-world-cli queue list <chatId>`.
5. Confirm the durable queue row is visible with status `queued`.
6. Run `agent-world-cli queue clear <chatId>`.
7. Confirm the queue is empty.

## Scenario: Existing CLI And Relay Compatibility

1. Run the existing local and relay automated tests.
2. Confirm `/new`, `/chats`, `/use <chatId>`, and `/messages <chatId>` behavior still uses `.agent-world`.
3. Confirm no runtime import still references `core/session-store.js`.

## Scenario: Interactive Mode

1. Run `agent-world-cli` with no subcommand in an isolated workspace.
2. Confirm it prints an interactive prompt and does not auto-resume queued work on startup.
3. Type `/help`.
4. Confirm interactive help lists slash commands and plain-text send behavior.
5. Type `/new`.
6. Confirm a chat is created and the prompt updates or subsequent commands use that chat.
7. Type `/send --queue @reviewer check this`.
8. Confirm a durable queued row is created without provider credentials.
9. Type `/queue`.
10. Confirm the queued row is visible.
11. Type `/clear`.
12. Confirm the queue is empty.
13. Type `/exit`.
14. Confirm the process exits with code 0.

## Scenario: Agent World CLI Real Binary E2E

1. Build `agent-world-cli`.
2. Run the built binary in an isolated temporary workspace, following the Electron E2E pattern of exercising the real entrypoint rather than mocked internals.
3. Confirm help and world snapshot commands work.
4. Confirm agent and chat operations persist to `.agent-world`.
5. Confirm queued send, queue stop, and queue clear expose durable queue status transitions without provider credentials.
6. Run a scripted interactive session through stdin/stdout against the built binary and verify the same queue lifecycle.
7. Run a monitored interactive session that keeps the process open, sends one stdin command at a time, waits for the corresponding stdout transition, and then verifies durable queue state.

## Execution Status

- Automated unit coverage: `tests/unit/agent-world-cli.test.js`, `tests/unit/world-store.test.js`, and `tests/unit/agent-world-runtime.test.js`.
- Automated E2E coverage: `tests/e2e/agent-world-cli.e2e.test.js` and `tests/e2e/agent-world-cli-interactive.e2e.test.js`, included in `npm run test:e2e:relay` and therefore `npm test`.
- The E2E follows the Electron app pattern from `../agent-world/tests/electron-e2e`: real built entrypoint, isolated workspace, helper-based command execution, and durable state assertions.
- Interactive mode is covered by scripted unit coverage, batch real-binary stdin/stdout coverage, and stepwise monitored real-binary stdin/stdout coverage.
