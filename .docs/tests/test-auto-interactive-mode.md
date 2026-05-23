# E2E Spec: Auto Interactive Mode

## Scenario: No-argument CLI starts a prompt

1. Build the CLI.
2. Run `agent-cli` from a test workspace with valid runtime credentials or mocked runtime.
3. Confirm stdout shows an interactive prompt instead of `Missing user message`.
4. Enter `/exit`.
5. Confirm the process exits successfully.

## Scenario: Interactive turns preserve chat context

1. Start `agent-cli` with no positional message.
2. Enter a first message.
3. Enter a second message.
4. Confirm the second runtime request includes the persisted prior messages according to the configured history limit.
5. Enter `/exit`.

## Scenario: Chat commands work inside the prompt

1. Start `agent-cli` with no positional message.
2. Enter `/new`.
3. Confirm a new chat is selected.
4. Enter `/chats`.
5. Confirm persisted chats are listed.
6. Enter `/use <chatId>` for a listed chat.
7. Confirm the chat is selected or a clear error is shown.
8. Enter `/clear`.
9. Confirm an empty chat is selected.
10. Enter `/exit`.

## Scenario: Existing modes are unchanged

1. Run `agent-cli --help`.
2. Confirm help prints and no prompt starts.
3. Run `agent-cli "hello"`.
4. Confirm one-shot behavior still runs one turn and exits.
5. Run `agent-cli --remote`.
6. Confirm remote host mode still starts or reports relay configuration errors exactly as before.
